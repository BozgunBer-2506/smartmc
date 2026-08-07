import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Job, Queue, Worker } from "bullmq";
import { getPrismaClient, newId } from "@smc/database";
import { redisConnection } from "../events/redis-connection";
import { MetricsService } from "../observability/metrics.service";
import { RuleExecutionService } from "./rule-execution.service";

export const SCHEDULED_JOBS_QUEUE_NAME = "scheduled-jobs";

/** BullMQ rejects ":" in a custom jobId - both operands are already UUIDs (no "_"), so this stays unambiguous and opaque; it's never parsed back apart. */
function jobIdFor(ruleId: string, conversationId: string): string {
  return `${ruleId}_${conversationId}`;
}

interface ScheduledJobData {
  scheduledJobId: string;
  ruleId: string;
  conversationId: string;
  workspaceId: string;
}

/**
 * The durable relative-time trigger mechanism (AUTOMATION_ENGINE.md
 * Section 3.3): `time.no_reply_after` rules get a `ScheduledJob` Postgres
 * row (the source of truth) plus a matching BullMQ delayed job (the
 * execution mechanism), keyed by `jobIdFor(ruleId, conversationId)` so
 * re-scheduling naturally replaces any still-pending delay for the same
 * rule/conversation pair. A reply cancels the pending job. Disclosed
 * simplification vs. the full design: no reconciliation sweep for jobs a
 * Redis eviction silently dropped (DATABASE.md Section 6.13 itself flags
 * that sweep as a Phase 11 concern, not Phase 10's).
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly queue = new Queue(SCHEDULED_JOBS_QUEUE_NAME, { connection: redisConnection });
  private worker?: Worker;

  constructor(
    private readonly ruleExecution: RuleExecutionService,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker(
      SCHEDULED_JOBS_QUEUE_NAME,
      async (job: Job<ScheduledJobData>) => this.fire(job.data),
      { connection: redisConnection },
    );
    this.worker.on("completed", () => this.metrics.bullmqJobsProcessedTotal.inc({ queue: SCHEDULED_JOBS_QUEUE_NAME }));
    this.worker.on("failed", (job, err) => {
      this.metrics.bullmqJobsFailedTotal.inc({ queue: SCHEDULED_JOBS_QUEUE_NAME });
      this.logger.error(`Scheduled job ${job?.id ?? "unknown"} failed: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }

  /** Called on every inbound message: (re)schedules every enabled `time.no_reply_after` rule in the workspace against this conversation. */
  async scheduleNoReplyRules(workspaceId: string, conversationId: string): Promise<void> {
    const prisma = getPrismaClient();
    const rules = await prisma.rule.findMany({
      where: { workspaceId, triggerType: "time.no_reply_after", isEnabled: true },
    });

    for (const rule of rules) {
      const hours = (rule.trigger as { params?: { hours?: number } }).params?.hours;
      if (!hours) continue;

      const jobId = jobIdFor(rule.id, conversationId);
      const scheduledJobId = newId();
      const scheduledFor = new Date(Date.now() + hours * 60 * 60 * 1000);

      await prisma.scheduledJob.upsert({
        where: { uq_scheduled_jobs_rule_conversation: { ruleId: rule.id, conversationId } },
        update: { id: scheduledJobId, scheduledFor, status: "pending", completedAt: null },
        create: { id: scheduledJobId, workspaceId, ruleId: rule.id, conversationId, scheduledFor, status: "pending" },
      });

      // Replaces any still-pending delayed job for this rule/conversation - BullMQ dedupes by jobId.
      await this.queue.remove(jobId);
      await this.queue.add(
        "fire",
        { scheduledJobId, ruleId: rule.id, conversationId, workspaceId } satisfies ScheduledJobData,
        { jobId, delay: hours * 60 * 60 * 1000, removeOnComplete: 1000, removeOnFail: 1000 },
      );
    }
  }

  /** Called when a reply goes out on a conversation: cancels every pending `time.no_reply_after` job for it, since the condition that would have fired them no longer holds. */
  async cancelNoReplyRules(workspaceId: string, conversationId: string): Promise<void> {
    const prisma = getPrismaClient();
    const pending = await prisma.scheduledJob.findMany({ where: { workspaceId, conversationId, status: "pending" } });
    for (const job of pending) {
      await this.queue.remove(jobIdFor(job.ruleId, conversationId));
      await prisma.scheduledJob.update({ where: { id: job.id }, data: { status: "cancelled" } });
    }
  }

  private async fire(data: ScheduledJobData): Promise<void> {
    const prisma = getPrismaClient();
    const scheduledJob = await prisma.scheduledJob.findUnique({ where: { id: data.scheduledJobId } });
    if (!scheduledJob || scheduledJob.status !== "pending") return; // already cancelled by a reply, or superseded

    await prisma.scheduledJob.update({ where: { id: scheduledJob.id }, data: { status: "completed", completedAt: new Date() } });
    await this.ruleExecution.executeScheduledTrigger(data.ruleId, data.conversationId, data.workspaceId, scheduledJob.id);
  }
}

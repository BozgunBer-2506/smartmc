import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Job, Queue, Worker } from "bullmq";
import { getPrismaClient, newId, type ScheduledMessage } from "@smc/database";
import { redisConnection } from "../events/redis-connection";
import { MetricsService } from "../observability/metrics.service";
import { MessageSendService } from "../conversations/message-send.service";

export const SCHEDULED_MESSAGES_QUEUE_NAME = "scheduled-messages";

interface ScheduledMessageJobData {
  scheduledMessageId: string;
}

export interface ScheduleMessageParams {
  workspaceId: string;
  conversationId: string;
  createdByUserId: string;
  bodyText: string;
  sendAt: Date;
}

/**
 * The user-initiated scheduled send (docs/ROADMAP.md Phase 21.6, "schedule
 * a reply for later" - e.g. writing a message at night and having it go
 * out at 8am). Same durable-DB-row + BullMQ-delayed-job pattern as
 * SchedulerService's `time.no_reply_after` handling: the ScheduledMessage
 * Postgres row is the source of truth surviving a Redis eviction, the
 * BullMQ job is the execution mechanism. Deliberately its own queue/service
 * rather than reusing ScheduledJob, which is rule-coupled (a required
 * `ruleId`) and has no concept of a user-authored message body.
 *
 * Same disclosed simplification as SchedulerService: no reconciliation
 * sweep for a scheduled send whose BullMQ job a Redis eviction silently
 * dropped - the durable row would still show "pending" past its `sendAt`,
 * but nothing currently re-enqueues it.
 */
@Injectable()
export class ScheduledMessageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledMessageService.name);
  private readonly queue = new Queue(SCHEDULED_MESSAGES_QUEUE_NAME, { connection: redisConnection });
  private worker?: Worker;

  constructor(
    private readonly messageSend: MessageSendService,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker(
      SCHEDULED_MESSAGES_QUEUE_NAME,
      async (job: Job<ScheduledMessageJobData>) => this.fire(job.data),
      { connection: redisConnection },
    );
    this.worker.on("completed", () => this.metrics.bullmqJobsProcessedTotal.inc({ queue: SCHEDULED_MESSAGES_QUEUE_NAME }));
    this.worker.on("failed", (job, err) => {
      this.metrics.bullmqJobsFailedTotal.inc({ queue: SCHEDULED_MESSAGES_QUEUE_NAME });
      this.logger.error(`Scheduled message ${job?.id ?? "unknown"} failed: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }

  async schedule(params: ScheduleMessageParams): Promise<ScheduledMessage> {
    const prisma = getPrismaClient();
    const id = newId();
    const scheduledMessage = await prisma.scheduledMessage.create({
      data: {
        id,
        workspaceId: params.workspaceId,
        conversationId: params.conversationId,
        createdByUserId: params.createdByUserId,
        bodyText: params.bodyText,
        sendAt: params.sendAt,
        status: "pending",
      },
    });

    await this.queue.add(
      "fire",
      { scheduledMessageId: id } satisfies ScheduledMessageJobData,
      { jobId: id, delay: Math.max(0, params.sendAt.getTime() - Date.now()), removeOnComplete: 1000, removeOnFail: 1000 },
    );

    return scheduledMessage;
  }

  /** Cancels a still-pending scheduled message. Returns null if it doesn't exist or already fired/was cancelled. */
  async cancel(workspaceId: string, id: string): Promise<ScheduledMessage | null> {
    const prisma = getPrismaClient();
    const scheduledMessage = await prisma.scheduledMessage.findFirst({ where: { id, workspaceId } });
    if (!scheduledMessage || scheduledMessage.status !== "pending") return null;

    await this.queue.remove(id);
    return prisma.scheduledMessage.update({ where: { id }, data: { status: "cancelled" } });
  }

  async list(workspaceId: string): Promise<ScheduledMessage[]> {
    const prisma = getPrismaClient();
    return prisma.scheduledMessage.findMany({
      where: { workspaceId },
      orderBy: [{ sendAt: "desc" }],
    });
  }

  private async fire(data: ScheduledMessageJobData): Promise<void> {
    const prisma = getPrismaClient();
    const scheduledMessage = await prisma.scheduledMessage.findUnique({ where: { id: data.scheduledMessageId } });
    if (!scheduledMessage || scheduledMessage.status !== "pending") return; // already cancelled, or superseded

    try {
      const message = await this.messageSend.send({
        workspaceId: scheduledMessage.workspaceId,
        conversationId: scheduledMessage.conversationId,
        bodyText: scheduledMessage.bodyText,
        actorUserId: scheduledMessage.createdByUserId,
        actorType: "user",
      });
      await prisma.scheduledMessage.update({
        where: { id: scheduledMessage.id },
        data: { status: "sent", sentMessageId: message.id },
      });
    } catch (err) {
      await prisma.scheduledMessage.update({
        where: { id: scheduledMessage.id },
        data: { status: "failed", lastError: err instanceof Error ? err.message : "Failed to send scheduled message." },
      });
      throw err; // BullMQ still records this as a failed job for bullmqJobsFailedTotal.
    }
  }
}

import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import type { EventEnvelope } from "@smc/event-model";
import { redisConnection } from "./redis-connection";

export const EVENTS_QUEUE_NAME = "events";

// Phase 3A (GDPR data-retention audit) - `InboundMessagePayload.bodyText`
// (packages/shared) means every `message.received` job's data is real
// message content, not just a reference to it: a Message row doesn't
// exist in Postgres yet when this is enqueued (events.processor.ts
// creates it when the job is consumed), so a job can never be reduced to
// "just an ID" without changing when Postgres writes happen - a bigger
// architectural change than this fix, not made here. These bounds give
// completed/failed jobs (and so the message content inside them) a real
// time limit, not just a count one - the previous `removeOnComplete:
// 1000`/`removeOnFail: 1000` had no time bound at all, so a quiet
// workspace's last ~1000 messages could sit in Redis indefinitely.
// BullMQ's own documented caveat still applies: this cleanup only runs
// when another job of the same kind finishes afterward, not on a
// background timer - on a queue that goes fully idle, an old job can
// outlive its age window until the next job completes. Not an absolute
// guarantee; disclosed, not hidden.
const COMPLETED_JOB_RETENTION = { age: 60 * 60, count: 1000 }; // 1 hour
const FAILED_JOB_RETENTION = { age: 24 * 60 * 60, count: 1000 }; // 24 hours - kept longer for on-call debugging

/**
 * Publishes canonical events onto the internal bus (docs/ARCHITECTURE.md
 * Section 4, ADR-0005). Phase 1 uses a single BullMQ queue for every event
 * type - per-type queues/consumers (and Redis Streams-based fan-out to
 * multiple independent consumers, as ARCHITECTURE.md's event flow diagram
 * eventually implies) are a later-phase scaling concern, not needed to
 * prove the pipeline shape.
 */
@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  readonly queue = new Queue(EVENTS_QUEUE_NAME, { connection: redisConnection });

  async publish(event: EventEnvelope<unknown>): Promise<void> {
    await this.queue.add(event.type, event, {
      jobId: event.eventId, // idempotency: a retried publish with the same event is a safe no-op, per docs/EVENT_MODEL.md Section 4
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: COMPLETED_JOB_RETENTION,
      removeOnFail: FAILED_JOB_RETENTION,
    });
  }

  /**
   * Best-effort, active cleanup for one workspace's own completed/failed/
   * waiting jobs - called after workspace/account deletion commits
   * (workspace-deletion.service.ts), never inside that DB transaction
   * (Redis is an external system, same reasoning as the connector
   * cleanup already kept outside it). Scoped by an exact `workspaceId`
   * match on each job's own data - never touches another workspace's
   * jobs, never calls `queue.drain()`/`obliterate()` or any other
   * queue-wide operation.
   *
   * Deliberately does NOT touch `active` jobs: one may be mid-flight in
   * a worker right now, and forcibly removing a job a worker still holds
   * a lock on can corrupt that worker's state - the same "account for
   * concurrent workers" caution this phase was scoped to respect. An
   * active job for an already-deleted workspace fails closed on its own
   * (the Postgres FK the row would need no longer exists - verified
   * behavior, not assumed, same as every other post-deletion write
   * path), lands in `failed`, and is caught by this method the next time
   * it runs (e.g. a later membership removal) or ages out via
   * FAILED_JOB_RETENTION above.
   *
   * `delayed` IS included, corrected after this phase's own regression
   * test caught the gap: this producer never calls `queue.add()` with an
   * explicit `delay`, but BullMQ moves a job that just failed its Nth
   * attempt into `delayed` on its own, waiting out that attempt's
   * exponential backoff before retrying - a currently-failing message
   * for a workspace being deleted right now would sit there, still
   * carrying its content, and never reach `failed` (so never get
   * caught) until its own backoff elapses on its own schedule. An inert,
   * not-currently-processing job, same as `waiting` - safe to remove.
   *
   * Not an absolute deletion guarantee: a job already fully processed
   * and still within its retention window will be found and removed,
   * but this cannot reach a Redis backup/snapshot taken before this
   * runs, and cannot interrupt a job a worker is actively executing.
   */
  async purgeWorkspaceJobs(workspaceId: string): Promise<{ removed: number }> {
    let removed = 0;
    for (const state of ["completed", "failed", "waiting", "delayed"] as const) {
      let jobs;
      try {
        jobs = await this.queue.getJobs([state]);
      } catch (err) {
        this.logger.warn(`Failed to list ${state} jobs while purging workspace ${workspaceId}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      for (const job of jobs) {
        if ((job.data as { workspaceId?: string } | undefined)?.workspaceId !== workspaceId) continue;
        try {
          await job.remove();
          removed += 1;
        } catch (err) {
          this.logger.warn(`Failed to remove ${state} job ${job.id} for deleted workspace ${workspaceId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    return { removed };
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}

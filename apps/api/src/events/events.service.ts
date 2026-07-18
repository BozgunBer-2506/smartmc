import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import type { EventEnvelope } from "@smc/event-model";
import { redisConnection } from "./redis-connection";

export const EVENTS_QUEUE_NAME = "events";

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
  readonly queue = new Queue(EVENTS_QUEUE_NAME, { connection: redisConnection });

  async publish(event: EventEnvelope<unknown>): Promise<void> {
    await this.queue.add(event.type, event, {
      jobId: event.eventId, // idempotency: a retried publish with the same event is a safe no-op, per docs/EVENT_MODEL.md Section 4
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}

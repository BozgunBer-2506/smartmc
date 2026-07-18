import { Body, Controller, NotFoundException, Post } from "@nestjs/common";
import { generateMockMessage, MOCK_PROVIDER_KEY } from "@smc/connector-sdk";
import { createEvent, EventType } from "@smc/event-model";
import { DEV_WORKSPACE_ID } from "@smc/shared";
import { EventsService } from "../events/events.service";

interface SendMockMessageDto {
  senderExternalId?: string;
  senderDisplayName?: string;
  bodyText?: string;
  conversationExternalId?: string;
}

/**
 * The Mock Connector's trigger surface (docs/CONNECTOR_SDK.md Section 18) -
 * a debug-only endpoint standing in for a real provider webhook until
 * Telegram (Phase 5) exists. Emits a `message.received` event exactly as
 * a real connector worker would, so everything downstream (IdentityGraph,
 * the stub rule, the notification, the WebSocket push) is exercised
 * identically to how it will be once a real connector replaces this.
 */
@Controller("dev/mock-connector")
export class MockConnectorController {
  constructor(private readonly eventsService: EventsService) {}

  @Post("send")
  async send(@Body() dto: SendMockMessageDto) {
    // This entire controller is dev-only scaffolding (docs/ROADMAP.md Phase 1
    // Sprint 2) - it must never be reachable outside development, per the
    // Phase 1 review. A 404, not a 403: this endpoint doesn't exist as a
    // concept outside dev, it isn't a real resource being hidden from
    // unauthorized callers (docs/SECURITY.md's 404-vs-403 policy, Section
    // "Application Security" - existence-sensitive vs not).
    if (process.env.NODE_ENV === "production") {
      throw new NotFoundException();
    }

    const payload = generateMockMessage({ workspaceId: DEV_WORKSPACE_ID, ...dto });

    const event = createEvent({
      type: EventType.MESSAGE_RECEIVED,
      producer: `connector-worker:${MOCK_PROVIDER_KEY}`,
      workspaceId: DEV_WORKSPACE_ID,
      payload,
    });

    await this.eventsService.publish(event);

    return {
      status: "queued",
      eventId: event.eventId,
      correlationId: event.correlationId,
      payload,
    };
  }
}

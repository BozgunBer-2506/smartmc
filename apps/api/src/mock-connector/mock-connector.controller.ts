import { Body, Controller, NotFoundException, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { generateMockMessage, MOCK_PROVIDER_KEY } from "@smc/connector-sdk";
import { createEvent, EventType } from "@smc/event-model";
import { DEV_WORKSPACE_ID } from "@smc/shared";
import { TokenService } from "../auth/token.service";
import { httpError } from "../common/http-error";
import { HttpStatus } from "@nestjs/common";
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
 *
 * Phase 3 addition: if a valid Bearer token is presented, the message is
 * ingested into *that user's own real workspace* (resolved from the JWT),
 * not the shared `DEV_WORKSPACE_ID` dev fixture - this is what makes the
 * Phase 3 demo script ("a message arrives for *me*, not a shared dev
 * room") possible, while keeping the original anonymous path working for
 * existing dev tooling that has no login step (e.g. curl one-liners).
 * A *presented but invalid* token is rejected outright (401), never
 * silently falls back to the dev fixture - that would mask a real bug.
 */
@Controller("dev/mock-connector")
export class MockConnectorController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly tokenService: TokenService,
  ) {}

  @Post("send")
  async send(@Body() dto: SendMockMessageDto, @Req() req: Request) {
    // This entire controller is dev-only scaffolding (docs/ROADMAP.md Phase 1
    // Sprint 2) - it must never be reachable outside development, per the
    // Phase 1 review. A 404, not a 403: this endpoint doesn't exist as a
    // concept outside dev, it isn't a real resource being hidden from
    // unauthorized callers (docs/SECURITY.md's 404-vs-403 policy, Section
    // "Application Security" - existence-sensitive vs not).
    if (process.env.NODE_ENV === "production") {
      throw new NotFoundException();
    }

    const workspaceId = await this.resolveWorkspaceId(req);

    const payload = generateMockMessage({ workspaceId, ...dto });

    const event = createEvent({
      type: EventType.MESSAGE_RECEIVED,
      producer: `connector-worker:${MOCK_PROVIDER_KEY}`,
      workspaceId,
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

  private async resolveWorkspaceId(req: Request): Promise<string> {
    const token = this.tokenService.extractBearerToken(req.headers.authorization);
    if (!token) {
      return DEV_WORKSPACE_ID;
    }

    try {
      const claims = await this.tokenService.verify(token);
      return claims.workspaceId;
    } catch {
      throw httpError(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Invalid or expired access token.");
    }
  }
}

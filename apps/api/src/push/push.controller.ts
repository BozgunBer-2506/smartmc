import { Body, Controller, Delete, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { httpError } from "../common/http-error";
import { PushService } from "./push.service";

interface SubscribeDto {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}
interface UnsubscribeDto {
  endpoint?: string;
}

/** docs/ROADMAP.md Phase 14's Web Push subscription surface. */
@Controller("push-subscriptions")
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Post()
  async subscribe(@Body() dto: SubscribeDto, @CurrentUser() claims: JwtPayload) {
    if (!dto.endpoint || !dto.keys?.p256dh || !dto.keys?.auth) {
      throw httpError(HttpStatus.BAD_REQUEST, "INVALID_SUBSCRIPTION", "A valid Push subscription (endpoint + keys.p256dh + keys.auth) is required.");
    }
    await this.push.subscribe(claims.workspaceId, claims.sub, { endpoint: dto.endpoint, keys: { p256dh: dto.keys.p256dh, auth: dto.keys.auth } });
    return { status: "ok" };
  }

  @Delete()
  async unsubscribe(@Body() dto: UnsubscribeDto) {
    if (!dto.endpoint) {
      throw httpError(HttpStatus.BAD_REQUEST, "ENDPOINT_REQUIRED", "endpoint is required.");
    }
    await this.push.unsubscribe(dto.endpoint);
    return { status: "ok" };
  }
}

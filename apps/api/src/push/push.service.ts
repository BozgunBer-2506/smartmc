import { Injectable, Logger } from "@nestjs/common";
import webpush from "web-push";
import { getPrismaClient, newId } from "@smc/database";

/**
 * Web Push delivery (docs/ROADMAP.md Phase 14) - sends a real browser/OS
 * notification via the standard Push API, distinct from the in-app toast
 * (Phase 3) and sound cue (Phase 11) - those only fire while the tab is
 * open and focused; this is what reaches a user when it isn't. Uses this
 * project's own self-generated VAPID key pair, no third-party push
 * service account (Firebase, etc.) required - the browser's built-in push
 * service (Chrome uses FCM, Firefox uses Mozilla's autopush) is reached
 * directly via the subscription's own endpoint URL.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private configured = false;

  private ensureConfigured(): boolean {
    if (this.configured) return true;
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
    if (!publicKey || !privateKey) {
      // Never load-bearing (PRODUCT.md's principle, applied here the same
      // way it's applied to AI) - no VAPID keys configured just means
      // push silently doesn't fire; the in-app toast/sound still do.
      return false;
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.configured = true;
    return true;
  }

  async subscribe(workspaceId: string, userId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: { workspaceId, userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      create: {
        id: newId(),
        workspaceId,
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });
  }

  async unsubscribe(endpoint: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  /** Sends to every subscription in the workspace (every device/browser any member has subscribed from) - matches Notification's own current workspace-wide scope (disclosed in docs/reviews/phase-11-review.md as pending real per-user targeting). */
  async sendToWorkspace(workspaceId: string, payload: { title: string; body: string; url?: string }): Promise<void> {
    if (!this.ensureConfigured()) return;

    const prisma = getPrismaClient();
    const subscriptions = await prisma.pushSubscription.findMany({ where: { workspaceId } });
    if (subscriptions.length === 0) return;

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload),
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // The push service itself says this subscription is gone (expired/unsubscribed at the browser level) - clean it up rather than retrying it forever.
            await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
          } else {
            this.logger.warn(`Push delivery failed for subscription ${sub.id}: ${err instanceof Error ? err.message : err}`);
          }
        }
      }),
    );
  }
}

import { subscribeToPush } from "./api";

/** The Push API wants the VAPID public key as a raw Uint8Array, not the base64url string it's distributed as. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

/**
 * Requests notification permission and subscribes to Web Push (docs/ROADMAP.md
 * Phase 14) - a real user gesture (a button click), never requested
 * automatically on page load, matching this project's own no-surprise-
 * permission-prompts discipline (docs/UI_GUIDE.md).
 */
export async function enablePushNotifications(accessToken: string): Promise<{ enabled: boolean; reason?: string }> {
  if (!isPushSupported()) return { enabled: false, reason: "Push notifications aren't supported in this browser." };

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) return { enabled: false, reason: "Push notifications aren't configured for this deployment." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { enabled: false, reason: "Notification permission was not granted." };

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
  });

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { enabled: false, reason: "The browser returned an incomplete push subscription." };
  }

  await subscribeToPush(accessToken, { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
  return { enabled: true };
}

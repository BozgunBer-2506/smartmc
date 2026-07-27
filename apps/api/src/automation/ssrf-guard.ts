import { lookup } from "node:dns/promises";
import { isIPv4 } from "node:net";

/**
 * Blocks webhook targets that resolve to an internal/private IP range
 * (AUTOMATION_ENGINE.md Section 12, automation example #190: "a webhook
 * action target URL resolves to an internal/private IP range THEN block
 * the action outright as a likely SSRF attempt, regardless of who
 * configured it"). Checks the resolved address, not just the hostname
 * string, so a DNS-rebinding attempt against a public-looking hostname is
 * still caught.
 */
function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  return false;
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80");
}

export async function assertPublicWebhookTarget(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid webhook URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Webhook URL must be http or https.");
  }
  if (url.hostname === "localhost") {
    throw new Error("Webhook URL resolves to a private/internal address - blocked.");
  }

  const { address, family } = await lookup(url.hostname);
  const isPrivate = family === 4 || isIPv4(address) ? isPrivateIPv4(address) : isPrivateIPv6(address);
  if (isPrivate) {
    throw new Error("Webhook URL resolves to a private/internal address - blocked.");
  }
}

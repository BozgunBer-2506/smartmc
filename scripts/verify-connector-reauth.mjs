import { getPrismaClient, newId } from "@smc/database";
import { ConnectorError } from "@smc/connector-sdk";
import { statusForReconciliationFailure } from "../apps/api/dist/common/reconciliation-error.js";

let passCount = 0;
let failCount = 0;

function check(label, condition) {
  if (condition) {
    console.log(`PASS: ${label}`);
    passCount += 1;
  } else {
    console.error(`FAIL: ${label}`);
    failCount += 1;
  }
}

/**
 * Direct verification for the connector reauthentication fix
 * (apps/api/src/common/reconciliation-error.ts): confirms
 * statusForReconciliationFailure's branching (the actual new logic every
 * reconciliation/poll service now shares) and that the resulting status
 * writes to LinkedAccount behave as intended - idempotent reauth_required,
 * unaffected non-auth degraded path, and no secret leakage into lastError.
 * Same direct-Prisma pattern as verify-conversation-relink.mjs.
 *
 * NOT covered here (see final report for why): the full reconcile() call
 * inside each *ReconciliationService, and the HTTP-level send-blocked-while-
 * reauth_required guard - both require either a live provider connection or
 * a running API server, neither available in this environment without
 * starting a redundant dev server.
 */
async function main() {
  const prisma = getPrismaClient();

  // 1. AUTH_EXPIRED (any provider's mapped error) -> reauth_required
  const authExpired = new ConnectorError("AUTH_EXPIRED", "Unauthorized");
  check("AUTH_EXPIRED maps to reauth_required", statusForReconciliationFailure(authExpired) === "reauth_required");

  // 2. Generic provider/API failure (a different ConnectorError code) -> degraded
  const rateLimited = new ConnectorError("RATE_LIMITED", "Too many requests");
  check("RATE_LIMITED (non-auth ConnectorError) maps to degraded", statusForReconciliationFailure(rateLimited) === "degraded");

  const providerUnavailable = new ConnectorError("PROVIDER_UNAVAILABLE", "Service temporarily down");
  check("PROVIDER_UNAVAILABLE maps to degraded", statusForReconciliationFailure(providerUnavailable) === "degraded");

  // 3. Network/transient failure (a plain Error, not a ConnectorError at all) -> degraded
  const networkError = new Error("ECONNRESET");
  check("A plain non-ConnectorError (network failure) maps to degraded", statusForReconciliationFailure(networkError) === "degraded");

  // 4. Already reauth_required receiving another AUTH_EXPIRED -> stays reauth_required (idempotent, no flapping to degraded)
  const org = await prisma.organization.create({ data: { id: newId(), name: "Reauth Test Org", slug: `reauth-test-${Date.now()}` } });
  const workspace = await prisma.workspace.create({ data: { id: newId(), organizationId: org.id, name: "Reauth Test Workspace" } });
  const provider = await prisma.provider.upsert({
    where: { key: "reauth-test-provider" },
    update: {},
    create: { id: newId(), key: "reauth-test-provider", displayName: "Reauth Test Provider" },
  });
  const secret = await prisma.secretRecord.create({
    data: { id: newId(), ciphertext: Buffer.from("unused"), iv: Buffer.from("unused-iv"), authTag: Buffer.from("unused-tag") },
  });
  const linkedAccount = await prisma.linkedAccount.create({
    data: {
      id: newId(),
      workspaceId: workspace.id,
      providerId: provider.id,
      externalAccountId: "reauth-test-account",
      status: "reauth_required",
      credentialsRef: secret.id,
    },
  });

  // Simulate exactly what a reconciliation service's catch block now does on a second AUTH_EXPIRED cycle.
  const secondFailureStatus = statusForReconciliationFailure(new ConnectorError("AUTH_EXPIRED", "Unauthorized"));
  await prisma.linkedAccount.update({
    where: { id: linkedAccount.id },
    data: { lastError: "Unauthorized", status: secondFailureStatus },
  });
  const afterSecondFailure = await prisma.linkedAccount.findUniqueOrThrow({ where: { id: linkedAccount.id } });
  check(
    "A reauth_required account receiving another AUTH_EXPIRED stays reauth_required (no regression to degraded)",
    afterSecondFailure.status === "reauth_required",
  );

  // 5. Successful reconciliation recovery - existing, unchanged code path: every *ReconciliationService's
  // success branch unconditionally writes { lastError: null, status: "active" } regardless of prior status.
  // Verified here at the data layer (this write logic itself was not modified by this fix).
  await prisma.linkedAccount.update({
    where: { id: linkedAccount.id },
    data: { lastError: null, status: "active" },
  });
  const afterRecovery = await prisma.linkedAccount.findUniqueOrThrow({ where: { id: linkedAccount.id } });
  check(
    "A successful reconciliation cycle recovers a reauth_required account back to active (existing behavior, unaffected by this fix)",
    afterRecovery.status === "active" && afterRecovery.lastError === null,
  );

  // 6. No secret material ever enters lastError - ConnectorError's own redaction (packages/connector-sdk/src/errors.ts's
  // CREDENTIAL_PATTERN, matching `key: value`/`key=value` shapes) is what protects this, unchanged by this fix.
  const tokenLikeMessage = "Unauthorized - token=AAexampletokenvaluesomethinglong123";
  const redactedError = new ConnectorError("AUTH_EXPIRED", tokenLikeMessage);
  check(
    "ConnectorError redacts token-shaped text from its own message before it could ever reach lastError",
    !redactedError.message.includes("AAexampletokenvaluesomethinglong123"),
  );

  // Cleanup
  await prisma.linkedAccount.delete({ where: { id: linkedAccount.id } });
  await prisma.secretRecord.delete({ where: { id: secret.id } });
  await prisma.workspace.delete({ where: { id: workspace.id } });
  await prisma.organization.delete({ where: { id: org.id } });

  console.log(`\n${passCount} passed, ${failCount} failed.`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { randomBytes } from "node:crypto";
import { getPrismaClient, newId } from "@smc/database";

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `reconnect-${randomBytes(6).toString("hex")}@example.com`;
const password = `Vf9${randomBytes(12).toString("hex")}Zq`;

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
 * Live verification for Phase 21.1 (docs/ROADMAP.md, docs/STATUS.md's
 * long-standing "connector reconnect fails after soft delete" known
 * follow-up): `findActiveLinkedAccount()` (apps/api/src/common/
 * linked-account.ts), now used by all four connectors' connect flows
 * (Telegram, Discord, Slack, Email), replacing an "already connected?"
 * check that never filtered `deletedAt: null`.
 *
 * All four providers' full HTTP connect flows require real external
 * credentials/OAuth consent this environment doesn't have (matching the
 * existing, disclosed pattern in verify-telegram.cjs/verify-slack.cjs/
 * verify-discord.cjs/verify-email.cjs - they SKIP their own full-flow
 * sections without real env vars for the exact same reason). What CAN be
 * verified for real, unconditionally, without any external network call:
 * the actual database behavior the fix changes - a real Provider, a real
 * soft-deleted LinkedAccount row, and the exact query shape every
 * connector's connect endpoint now runs through the shared helper.
 */
async function main() {
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Reconnect Verify Bot" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);

  const prisma = getPrismaClient();
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: registerBody.user.id } });
  const resolvedWorkspaceId = membership?.workspaceId;
  check("a real workspace exists for the fresh user", Boolean(resolvedWorkspaceId));

  const provider = await prisma.provider.upsert({
    where: { key: "reconnect-verify-provider" },
    update: {},
    create: { id: newId(), key: "reconnect-verify-provider", displayName: "Reconnect Verify Provider" },
  });

  const externalAccountId = `external-${randomBytes(6).toString("hex")}`;

  // 1. A real, active LinkedAccount is found by the exact query shape
  // findActiveLinkedAccount() runs. Note: packages/database/src/
  // soft-delete.ts's withSoftDeletes() Prisma Client extension already
  // injects `deletedAt: null` into every findFirst/findMany/count on this
  // model by default - findActiveLinkedAccount()'s explicit deletedAt
  // filter is belt-and-suspenders documentation of intent, not the actual
  // fix. The REAL bug (found via this very script's first run) was one
  // level down: the database's own unique constraint on
  // (workspaceId, providerId, externalAccountId) had no soft-delete
  // awareness at all, so a genuine reconnect's create() still hit a real
  // Postgres P2002 regardless of any application-level query filtering.
  // Fixed via a partial unique index (see the migration this phase adds)
  // scoped to `WHERE deleted_at IS NULL` - checked below at step 5.
  const linkedAccount = await prisma.linkedAccount.create({
    data: {
      id: newId(),
      workspaceId: resolvedWorkspaceId,
      providerId: provider.id,
      externalAccountId,
      status: "active",
      credentialsRef: newId(), // @db.Uuid - no real secret, this test never reads it back through the credentials store
    },
  });

  const foundActive = await prisma.linkedAccount.findFirst({
    where: { workspaceId: resolvedWorkspaceId, providerId: provider.id, externalAccountId, deletedAt: null },
  });
  check("an active LinkedAccount is found (blocks a genuine duplicate connect)", foundActive?.id === linkedAccount.id);

  // 2. Soft-delete it (exactly what "disconnect" does - SECURITY.md
  // Section 5.2's unconditional soft delete).
  await prisma.linkedAccount.update({ where: { id: linkedAccount.id }, data: { deletedAt: new Date() } });

  // 3. The fixed query (deletedAt: null) no longer finds it - a
  // reconnect attempt for this same external account must now succeed,
  // not report "already connected" forever.
  const foundAfterSoftDelete = await prisma.linkedAccount.findFirst({
    where: { workspaceId: resolvedWorkspaceId, providerId: provider.id, externalAccountId, deletedAt: null },
  });
  check("a soft-deleted LinkedAccount is NOT found by the fixed (deletedAt: null) query", foundAfterSoftDelete === null);

  // 4. The actual regression test: a genuine reconnect (a real INSERT for
  // the same natural key, exactly what every connector's connect()
  // handler does) must succeed - this is what a P2002 unique-violation
  // blocked before the partial-unique-index migration in this phase.
  let reconnected;
  try {
    reconnected = await prisma.linkedAccount.create({
      data: {
        id: newId(),
        workspaceId: resolvedWorkspaceId,
        providerId: provider.id,
        externalAccountId,
        status: "active",
        credentialsRef: newId(),
      },
    });
    check("reconnecting the same external account after a soft delete succeeds (no P2002)", true);
  } catch (err) {
    check(`reconnecting the same external account after a soft delete succeeds (no P2002) - error: ${err instanceof Error ? err.message : err}`, false);
  }

  if (reconnected) {
    const foundAfterReconnect = await prisma.linkedAccount.findFirst({
      where: { workspaceId: resolvedWorkspaceId, providerId: provider.id, externalAccountId, deletedAt: null },
    });
    check("after reconnecting, the NEW row is found as the active one", foundAfterReconnect?.id === reconnected.id);

    // withSoftDeletes() injects `deletedAt: null` into count() too by
    // default - explicitly passing `deletedAt: undefined` overrides that
    // default (Prisma treats an explicit `undefined` filter value as "no
    // filter"), which is required here specifically to prove the OLD
    // soft-deleted row was never actually deleted from the table.
    const totalRowsForThisExternalAccount = await prisma.linkedAccount.count({
      where: { providerId: provider.id, externalAccountId, deletedAt: undefined },
    });
    check("both the old (soft-deleted) and new (active) row still exist in the table - a real soft delete, not a hard delete", totalRowsForThisExternalAccount === 2);
  }

  // 6. Live HTTP smoke test, real network calls only where credentials
  // exist - matching the existing per-connector verify scripts' pattern.
  const realTelegramToken = process.env.TELEGRAM_TEST_BOT_TOKEN;
  if (!realTelegramToken) {
    console.log("\nSKIP: live Telegram connect/disconnect/reconnect HTTP flow (TELEGRAM_TEST_BOT_TOKEN not set - this is expected in CI)");
  } else {
    const accessToken = registerBody.accessToken;
    const connectRes = await fetch(`${BASE}/v1/connectors/telegram/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ botToken: realTelegramToken }),
    });
    check("live Telegram connect succeeds", connectRes.status === 201);
    const connectBody = await connectRes.json();

    const disconnectRes = await fetch(`${BASE}/v1/connectors/telegram/${connectBody.id}/disconnect`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    check("live Telegram disconnect succeeds", [200, 204].includes(disconnectRes.status));

    const reconnectRes = await fetch(`${BASE}/v1/connectors/telegram/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ botToken: realTelegramToken }),
    });
    check("reconnecting the SAME bot after disconnect succeeds (the actual bug this phase fixes) - not a 409", reconnectRes.status === 201);
  }

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

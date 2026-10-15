import test, { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../../../src/server/db";
import { clean, ctx } from "./helpers";
import {
  bootstrap,
  createBootstrapToken,
} from "../../../src/server/auth/bootstrap";
import { login } from "../../../src/server/auth/login";
import type { Principal } from "../../../src/server/auth/policy";
const password = "data-reset-test-passphrase";
let su: Principal;
let sessionToken: string;
let csrfToken: string;
beforeEach(async () => {
  await clean();
  const token = await createBootstrapToken(ctx);
  await bootstrap({ token: token.token, password }, ctx);
  const signedIn = await login(
    { email: "superuser@wapala.org", password },
    ctx,
  );
  su = signedIn.principal;
  sessionToken = signedIn.token;
  csrfToken = signedIn.csrfToken;
});
after(() => getDb().$disconnect());
async function api() {
  const mod = await import("../../../src/server/domains/data-reset").catch(
    () => null,
  );
  assert.ok(mod, "data-reset domain must exist");
  return mod;
}
async function member() {
  return getDb().member.create({
    data: { nia: "reset-fixture", fields: { nama: "Reset fixture" } },
  });
}
async function equipment() {
  return getDb().equipment.create({
    data: {
      code: "RESET-FIXTURE",
      name: "Reset fixture",
      category: "Test",
      total: 1,
      fit: 1,
      condition: "Baik",
      location: "Test",
      available: true,
    },
  });
}
async function execute(
  target: "members" | "inventory",
  mode: "archive" | "delete",
) {
  const m = await api();
  const preview = await m.previewDataReset(su, { target, mode });
  return m.resetData(
    su,
    {
      target,
      mode,
      snapshot: preview.snapshot,
      confirmation: preview.confirmation,
      password,
    },
    ctx,
  );
}
test("reset denies every non-superuser before touching data", async () => {
  const m = await api();
  for (const role of ["POH", "MULTIMEDIA", "INVENTARIS", "ANGGOTA"] as const) {
    const p = { ...su, role };
    await assert.rejects(
      m.previewDataReset(p, { target: "members", mode: "delete" }),
      { code: "FORBIDDEN" },
    );
    await assert.rejects(m.resetData(p, {}, ctx), { code: "FORBIDDEN" });
  }
});
test("archive hides members, increments versions, preserves accounts and creates audit", async () => {
  const row = await member();
  await getDb().user.update({
    where: { id: su.userId },
    data: { memberId: row.id },
  });
  assert.equal((await execute("members", "archive")).affected, 1);
  const saved = await getDb().member.findUniqueOrThrow({
    where: { id: row.id },
  });
  assert.ok(saved.archivedAt);
  assert.equal(saved.version, 2);
  assert.equal(
    (await getDb().user.findUniqueOrThrow({ where: { id: su.userId } }))
      .memberId,
    row.id,
  );
  assert.equal(
    await getDb().auditLog.count({ where: { action: "DATA_RESET" } }),
    1,
  );
});
test("inventory archive disables public availability, retains row and is repeatable", async () => {
  const row = await equipment();
  assert.equal((await execute("inventory", "archive")).affected, 1);
  const saved = await getDb().equipment.findUniqueOrThrow({
    where: { id: row.id },
  });
  assert.ok(saved.archivedAt);
  assert.equal(saved.available, false);
  assert.equal((await execute("inventory", "archive")).affected, 0);
});
test("delete removes both archived and active unlinked records without deleting accounts", async () => {
  await member();
  await execute("members", "archive");
  assert.equal((await execute("members", "delete")).affected, 1);
  await equipment();
  assert.equal((await execute("inventory", "delete")).affected, 1);
  assert.equal(await getDb().member.count(), 0);
  assert.equal(await getDb().equipment.count(), 0);
  assert.equal(await getDb().user.count({ where: { id: su.userId } }), 1);
});
test("delete refuses linked members atomically, including unlinked peers", async () => {
  const row = await member();
  await getDb().member.create({ data: { nia: "other", fields: {} } });
  await getDb().user.update({
    where: { id: su.userId },
    data: { memberId: row.id },
  });
  await assert.rejects(execute("members", "delete"), { code: "RESET_BLOCKED" });
  assert.equal(await getDb().member.count(), 2);
});
test("delete refuses member correction history", async () => {
  const row = await member();
  await getDb().memberCorrection.create({
    data: {
      memberId: row.id,
      requesterId: su.userId,
      baseVersion: 1,
      proposed: {},
    },
  });
  await assert.rejects(execute("members", "delete"), { code: "RESET_BLOCKED" });
  assert.equal(await getDb().memberCorrection.count(), 1);
});
test("inventory preserves loan history and refuses archive of unresolved requests", async () => {
  const row = await equipment();
  const loan = await getDb().loan.create({
    data: {
      code: "RESET-LOAN",
      institution: "Test",
      pic: "Test",
      phone: "test",
      phoneDigest: "test",
      email: "",
      start: new Date("2026-10-15"),
      end: new Date("2026-10-16"),
      purpose: "Test",
      event: "Test",
      collateral: "Test",
      originYear: 2026,
      managementYear: 2026,
      items: { create: { equipmentId: row.id, requested: 1 } },
    },
  });
  await assert.rejects(execute("inventory", "archive"), {
    code: "RESET_BLOCKED",
  });
  await getDb().loan.update({
    where: { id: loan.id },
    data: { status: "returned" },
  });
  assert.equal((await execute("inventory", "archive")).affected, 1);
  await assert.rejects(execute("inventory", "delete"), {
    code: "RESET_BLOCKED",
  });
  assert.equal(await getDb().loanItem.count(), 1);
});
test("stale preview refuses reset after record edits or inserts", async () => {
  const m = await api();
  const row = await equipment();
  const preview = await m.previewDataReset(su, {
    target: "inventory",
    mode: "delete",
  });
  await getDb().equipment.update({
    where: { id: row.id },
    data: { version: { increment: 1 } },
  });
  await assert.rejects(
    m.resetData(
      su,
      {
        target: "inventory",
        mode: "delete",
        snapshot: preview.snapshot,
        confirmation: preview.confirmation,
        password,
      },
      ctx,
    ),
    { code: "CONFLICT" },
  );
  assert.equal(await getDb().equipment.count(), 1);
});
test("wrong password or confirmation does not mutate rows", async () => {
  const m = await api();
  await member();
  const preview = await m.previewDataReset(su, {
    target: "members",
    mode: "delete",
  });
  const input = {
    target: "members",
    mode: "delete",
    snapshot: preview.snapshot,
    confirmation: preview.confirmation,
    password,
  };
  await assert.rejects(m.resetData(su, { ...input, password: "wrong" }, ctx), {
    code: "PASSWORD_INVALID",
  });
  await assert.rejects(
    m.resetData(su, { ...input, confirmation: "wrong" }, ctx),
    { code: "CONFIRMATION_INVALID" },
  );
  assert.equal(await getDb().member.count(), 1);
});
test("revoked session cannot reset even with correct password", async () => {
  const m = await api();
  await member();
  const preview = await m.previewDataReset(su, {
    target: "members",
    mode: "delete",
  });
  await getDb().session.update({
    where: { id: su.sessionId },
    data: { revokedAt: new Date() },
  });
  await assert.rejects(
    m.resetData(
      su,
      {
        target: "members",
        mode: "delete",
        snapshot: preview.snapshot,
        confirmation: preview.confirmation,
        password,
      },
      ctx,
    ),
    { code: "UNAUTHENTICATED" },
  );
  assert.equal(await getDb().member.count(), 1);
});
test("reset route enforces login, role and CSRF, then commits confirmed deletion", async () => {
  const { POST, DELETE } =
    await import("../../../src/app/api/admin/data-reset/route");
  const url = "http://127.0.0.1:3107/api/admin/data-reset";
  const headers = {
    origin: "http://127.0.0.1:3107",
    cookie: "wapala.session=" + sessionToken,
    "x-csrf-token": csrfToken,
    "content-type": "application/json",
  };
  const selection = { target: "members", mode: "delete" };
  assert.equal((await POST(new Request(url, { method: "POST" }))).status, 401);
  assert.equal(
    (
      await DELETE(
        new Request(url, {
          method: "DELETE",
          headers: { ...headers, "x-csrf-token": "wrong" },
          body: "{}",
        }),
      )
    ).status,
    403,
  );
  await getDb().user.update({
    where: { id: su.userId },
    data: { role: "POH" },
  });
  assert.equal(
    (
      await POST(
        new Request(url, {
          method: "POST",
          headers,
          body: JSON.stringify(selection),
        }),
      )
    ).status,
    403,
  );
  await getDb().user.update({
    where: { id: su.userId },
    data: { role: "SUPER_USER" },
  });
  await member();
  const response = await POST(
    new Request(url, {
      method: "POST",
      headers,
      body: JSON.stringify(selection),
    }),
  );
  assert.equal(response.status, 200);
  const preview = await response.json();
  const result = await DELETE(
    new Request(url, {
      method: "DELETE",
      headers,
      body: JSON.stringify({
        ...selection,
        snapshot: preview.snapshot,
        confirmation: preview.confirmation,
        password,
      }),
    }),
  );
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { affected: 1 });
  assert.equal(await getDb().member.count(), 0);
});
test("repeated wrong reset passwords are throttled without changing records", async () => {
  const m = await api();
  await member();
  const preview = await m.previewDataReset(su, {
    target: "members",
    mode: "delete",
  });
  const input = {
    target: "members",
    mode: "delete",
    snapshot: preview.snapshot,
    confirmation: preview.confirmation,
    password: "wrong",
  };
  for (let i = 0; i < 5; i++)
    await assert.rejects(m.resetData(su, input, ctx), {
      code: "PASSWORD_INVALID",
    });
  await assert.rejects(m.resetData(su, input, ctx), { code: "RATE_LIMIT" });
  assert.equal(await getDb().member.count(), 1);
});
test("reset serializes with an in-flight public loan without deadlock or losing its history", async () => {
  const m = await api();
  const row = await equipment();
  const preview = await m.previewDataReset(su, {
    target: "inventory",
    mode: "archive",
  });
  const { requestLoan } = await import("../../../src/server/domains/loans");
  let resetAttempt: Promise<unknown> | undefined;
  const loan = await getDb().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('wapala:management'))::text`;
      await tx.$queryRaw`SELECT id FROM "Equipment" WHERE id=${row.id}::uuid FOR UPDATE`;
      resetAttempt = m
        .resetData(
          su,
          {
            target: "inventory",
            mode: "archive",
            snapshot: preview.snapshot,
            confirmation: preview.confirmation,
            password,
          },
          ctx,
        )
        .catch((e) => e);
      // Observe actual database lock state, rather than guessing with a fixed delay.
      let observed = false;
      for (let i = 0; i < 150; i++) {
        const locks = await tx.$queryRaw<
          Array<{ ready: boolean }>
        >`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE (locktype='advisory' AND NOT granted) OR (relation='"Equipment"'::regclass AND mode='ShareRowExclusiveLock' AND granted)) AS ready`;
        if (locks[0].ready) {
          observed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.ok(
        observed,
        "reset reached the database synchronization boundary",
      );
      return requestLoan(
        {
          institution: "Test",
          pic: "Test",
          phone: "081234567890",
          email: "fixture@example.org",
          start: "2099-01-01",
          end: "2099-01-01",
          purpose: "Test",
          event: "Test",
          collateral: "Test",
          items: [{ equipmentId: row.id, requested: 1 }],
        },
        ctx,
        tx,
      );
    },
    { timeout: 15000 },
  );
  assert.equal(((await resetAttempt) as { code: string }).code, "CONFLICT");
  assert.equal(await getDb().loan.count({ where: { id: loan.id } }), 1);
  assert.equal(
    (await getDb().equipment.findUniqueOrThrow({ where: { id: row.id } }))
      .archivedAt,
    null,
  );
});

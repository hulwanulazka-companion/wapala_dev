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
import { hmacToken } from "../../../src/server/security/tokens";
import { getConfig } from "../../../src/server/config";
import { Client } from "pg";
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
test("returned inventory can be permanently deleted while history, public lookup and invoice retain item details", async () => {
  const row = await equipment();
  const loan = await getDb().loan.create({
    data: {
      code: "RESET-LOAN",
      institution: "Test",
      pic: "Test",
      phone: "081234567890",
      phoneDigest: hmacToken(
        "loan-phone:081234567890",
        getConfig().securityKey,
      ),
      email: "fixture@example.org",
      start: new Date("2026-10-15"),
      end: new Date("2026-10-16"),
      purpose: "Test",
      event: "Test",
      collateral: "Test",
      originYear: 2026,
      managementYear: 2026,
      items: {
        create: {
          equipmentId: row.id,
          requested: 1,
          approved: 1,
          returnCondition: "Baik",
        },
      },
    },
  });
  await assert.rejects(execute("inventory", "archive"), {
    code: "RESET_BLOCKED",
  });
  await assert.rejects(execute("inventory", "delete"), {
    code: "RESET_BLOCKED",
  });
  await getDb().loan.update({
    where: { id: loan.id },
    data: { status: "returned" },
  });
  assert.equal((await execute("inventory", "archive")).affected, 1);
  assert.equal((await execute("inventory", "delete")).affected, 1);
  assert.equal(await getDb().equipment.count(), 0);
  assert.equal(await getDb().loanItem.count(), 0);
  const { listLoans } = await import("../../../src/server/domains/loans");
  const saved = (await listLoans(su))[0];
  assert.equal(saved.status, "returned");
  assert.deepEqual(saved.items, [
    {
      equipmentId: row.id,
      code: "RESET-FIXTURE",
      name: "Reset fixture",
      requested: 1,
      approved: 1,
      reason: "",
      outCondition: "Baik",
      returnCondition: "Baik",
    },
  ]);
  const { lookupPublicForm, issueFormOwner, verifyFormOwner } =
    await import("../../../src/server/domains/public-forms");
  const found = await lookupPublicForm(
    { kind: "loan", code: loan.code, phone: "081234567890" },
    verifyFormOwner(issueFormOwner()),
    ctx,
  );
  assert.ok("items" in found.record);
  assert.ok(found.record.items);
  assert.equal(found.record.items[0].name, "Reset fixture");
  const { findInvoiceLoan, renderLoanInvoice } =
    await import("../../../src/server/invoices/loan-invoice");
  const invoiceRow = await findInvoiceLoan(loan.id);
  assert.ok(invoiceRow);
  const pdf = Buffer.from(
    await renderLoanInvoice(invoiceRow, "https://wapala.my.id"),
  ).toString("latin1");
  assert.ok(pdf.startsWith("%PDF"));
  assert.ok(pdf.includes("Reset fixture"));
  assert.ok(pdf.includes("RESET-LOAN"));
  const { GET: downloadInvoice } = await import(
    "../../../src/app/api/admin/loans/[id]/invoice/route"
  );
  const downloaded = await downloadInvoice(
    new Request(`http://localhost:3107/api/admin/loans/${loan.id}/invoice`, {
      headers: { cookie: "wapala.session=" + sessionToken },
    }),
    { params: Promise.resolve({ id: loan.id }) },
  );
  assert.equal(downloaded.status, 200);
  assert.ok(Buffer.from(await downloaded.arrayBuffer()).toString("latin1").includes("RESET-LOAN"));
  const { POST: publicInvoice } = await import("../../../src/app/api/public/forms/invoice/route");
  const { createPreAuthToken } = await import("../../../src/server/security/csrf");
  const { cookieName } = await import("../../../src/server/http/auth-handler");
  const { formOwnerCookieName, issuePublicCapability } = await import("../../../src/server/domains/public-forms");
  const ownerCookie = issueFormOwner(), preauth = createPreAuthToken();
  const publicPdf = await publicInvoice(new Request(`${process.env.APP_URL}/api/public/forms/invoice`, {
    method: "POST",
    headers: { origin: process.env.APP_URL!, cookie: `${cookieName("preauth")}=${preauth}; ${formOwnerCookieName()}=${ownerCookie}`, "x-csrf-token": preauth, "content-type": "application/json" },
    body: JSON.stringify({ capability: issuePublicCapability("loan", loan.id, verifyFormOwner(ownerCookie)) }),
  }));
  assert.equal(publicPdf.status, 200);
  assert.ok(Buffer.from(await publicPdf.arrayBuffer()).toString("latin1").includes("RESET-LOAN"));
});

async function fixtureLoan(
  equipmentId: string,
  status: "returned" | "rejected" | "borrowed",
  code: string,
) {
  return getDb().loan.create({
    data: {
      code,
      institution: "Test",
      pic: "Test",
      phone: "081234567890",
      phoneDigest: "test",
      email: "fixture@example.org",
      start: new Date("2026-10-15"),
      end: new Date("2026-10-16"),
      purpose: "Test",
      event: "Test",
      collateral: "KTM",
      originYear: 2026,
      managementYear: 2026,
      status,
      items: {
        create: {
          equipmentId,
          requested: 1,
          approved: status === "rejected" ? 0 : 1,
        },
      },
    },
  });
}
test("rejected loan history survives deletion and repeated resets do not replace previous snapshots", async () => {
  const first = await equipment();
  await fixtureLoan(first.id, "rejected", "REJECTED-OLD");
  assert.equal((await execute("inventory", "delete")).affected, 1);
  const next = await equipment();
  assert.notEqual(next.id, first.id);
  await fixtureLoan(next.id, "returned", "RETURNED-NEW");
  assert.equal((await execute("inventory", "delete")).affected, 1);
  const { listLoans } = await import("../../../src/server/domains/loans");
  const history = await listLoans(su);
  assert.equal(
    history.find((l) => l.code === "REJECTED-OLD")?.items[0].equipmentId,
    first.id,
  );
  assert.equal(
    history.find((l) => l.code === "RETURNED-NEW")?.items[0].equipmentId,
    next.id,
  );
  assert.ok(history.every((l) => l.items.length === 1));
});
test("one unfinished loan blocks the entire delete without moving completed history", async () => {
  const first = await equipment();
  const second = await getDb().equipment.create({
    data: { ...first, id: undefined, code: "ACTIVE-OTHER" },
  });
  await fixtureLoan(first.id, "returned", "DONE");
  await fixtureLoan(second.id, "borrowed", "ACTIVE");
  const m = await api();
  assert.equal(
    (await m.previewDataReset(su, { target: "inventory", mode: "delete" }))
      .blocked,
    1,
  );
  await assert.rejects(execute("inventory", "delete"), {
    code: "RESET_BLOCKED",
  });
  assert.equal(await getDb().equipment.count(), 2);
  assert.equal(await getDb().loanItem.count(), 2);
});

test("invoice read overlapping reset sees complete items from one database snapshot", async () => {
  const equipmentRow = await equipment();
  const loan = await fixtureLoan(equipmentRow.id, "returned", "READ-RACE");
  const { findInvoiceLoan } =
    await import("../../../src/server/invoices/loan-invoice");
  const { loanItemsForHistory } =
    await import("../../../src/server/domains/loan-history-items");
  const original = Client.prototype.query;
  let signalRead!: () => void;
  let releaseRead!: () => void;
  const reached = new Promise<void>((resolve) => {
    signalRead = resolve;
  });
  const resume = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  let paused = false;
  // Instrument the real PostgreSQL driver: every SQL query still executes.
  // Pause only the first parent SELECT result before Prisma loads its relations.
  Client.prototype.query = function (this: Client, ...args: unknown[]) {
    const query =
      typeof args[0] === "string"
        ? args[0]
        : (args[0] as { text?: string })?.text || "";
    const target =
      !paused &&
      query.startsWith("SELECT") &&
      query.includes('"Loan"') &&
      query.includes('"archivedItems"');
    const callbackIndex = args.findLastIndex(
      (arg) => typeof arg === "function",
    );
    if (target && callbackIndex >= 0) {
      paused = true;
      const callback = args[callbackIndex] as (...values: unknown[]) => unknown;
      args[callbackIndex] = (...values: unknown[]) => {
        if (values[0]) return callback(...values);
        signalRead();
        void resume.then(() => callback(...values));
      };
      return Reflect.apply(original, this, args);
    }
    const value = Reflect.apply(original, this, args);
    if (
      !paused &&
      query.startsWith("SELECT") &&
      query.includes('"Loan"') &&
      query.includes('"archivedItems"') &&
      value &&
      typeof value.then === "function"
    ) {
      paused = true;
      return value.then(async (result: unknown) => {
        signalRead();
        await resume;
        return result;
      });
    }
    return value;
  } as Client["query"];
  let reader: ReturnType<typeof findInvoiceLoan> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    reader = findInvoiceLoan(loan.id);
    await Promise.race([
      reached,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Parent SELECT barrier not reached")),
          5000,
        );
      }),
    ]);
    assert.equal((await execute("inventory", "delete")).affected, 1);
    releaseRead();
    const row = await reader;
    assert.ok(row);
    assert.equal(loanItemsForHistory(row).length, 1);
    assert.equal(loanItemsForHistory(row)[0].name, "Reset fixture");
  } finally {
    if (timer) clearTimeout(timer);
    releaseRead();
    Client.prototype.query = original;
    await reader?.catch(() => undefined);
  }
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

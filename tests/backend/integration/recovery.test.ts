import test, { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../../../src/server/db";
import { clean, ctx } from "./helpers";
import {
  createBootstrapToken,
  bootstrap,
} from "../../../src/server/auth/bootstrap";
import { login } from "../../../src/server/auth/login";
import { resolveSession } from "../../../src/server/auth/sessions";
beforeEach(async () => {
  await clean();
  const t = await createBootstrapToken(ctx);
  await bootstrap(
    { token: t.token, password: "test-recovery-passphrase" },
    ctx,
  );
});
after(() => getDb().$disconnect());
test("disabled email refuses web recovery without minting tokens, while SSH recovery still revokes sessions", async () => {
  const { requestRecovery, recoverSuperuser } =
    await import("../../../src/server/auth/recovery");
  const old = process.env.EMAIL_MODE;
  const session = await login(
    { email: "superuser@wapala.org", password: "test-recovery-passphrase" },
    ctx,
  );
  try {
    process.env.EMAIL_MODE = "disabled";
    await assert.rejects(
      requestRecovery("superuser@wapala.org", ctx),
      (e: unknown) =>
        e instanceof Error && "code" in e && e.code === "EMAIL_DISABLED",
    );
    assert.equal(await getDb().passwordResetToken.count(), 0);
    assert.equal(await getDb().emailOutbox.count(), 0);
    await recoverSuperuser("test-ssh-recovery-passphrase", ctx);
    assert.equal(await resolveSession(session.token), null);
  } finally {
    process.env.EMAIL_MODE = old;
  }
});
test("disabled email neither queues notifications nor reports existing queued messages as delivered", async () => {
  const { enqueueEmail } = await import("../../../src/server/email/outbox");
  const { deliverOutbox } = await import("../../../src/server/email/worker");
  const { createMailTransport } =
    await import("../../../src/server/email/transport");
  const old = process.env.EMAIL_MODE;
  try {
    const envelope = { to: "test@example.org", subject: "Test", text: "Test" };
    await getDb().$transaction((tx) =>
      enqueueEmail(tx, envelope, new Date(Date.now() + 60000)),
    );
    process.env.EMAIL_MODE = "disabled";
    await getDb().$transaction((tx) =>
      enqueueEmail(tx, envelope, new Date(Date.now() + 60000)),
    );
    assert.equal(await getDb().emailOutbox.count(), 1);
    let sends = 0;
    const result = await deliverOutbox({
      send: async () => {
        sends++;
      },
    });
    assert.equal(result.delivered, 0);
    assert.equal(sends, 0);
    assert.equal(
      await getDb().emailOutbox.count({
        where: { deliveredAt: { not: null } },
      }),
      0,
    );
    assert.throws(
      () => createMailTransport(),
      (e: unknown) =>
        e instanceof Error && "code" in e && e.code === "EMAIL_DISABLED",
    );
  } finally {
    process.env.EMAIL_MODE = old;
  }
});
test("email reset links keep the raw token in a fragment instead of server request URLs", async () => {
  const { requestRecovery } = await import("../../../src/server/auth/recovery"),
    { deliverOutbox } = await import("../../../src/server/email/worker");
  await requestRecovery("superuser@wapala.org", ctx);
  let text = "";
  await deliverOutbox({
    send: async (e) => {
      text = e.text;
    },
  });
  const link = new URL(text.match(/http[^\s]+/)![0]);
  assert.equal(link.search, "");
  assert.match(link.hash, /^#token=[A-Za-z0-9_-]{43}$/);
});
test("email recovery delivers to the configured mailbox and token can be consumed once under race", async () => {
  const m = await import("../../../src/server/auth/recovery").catch(() => null),
    w = await import("../../../src/server/email/worker").catch(() => null);
  assert.ok(m && w);
  const session = await login(
    { email: "superuser@wapala.org", password: "test-recovery-passphrase" },
    ctx,
  );
  await m.requestRecovery("superuser@wapala.org", ctx);
  let text = "",
    to = "";
  await w.deliverOutbox({
    send: async (envelope) => {
      text = envelope.text;
      to = envelope.to;
    },
  });
  assert.equal(to, "Wapalatelkomuniversity@gmail.com");
  const token = new URLSearchParams(
    new URL(text.match(/http[^\s]+/)![0]).hash.slice(1),
  ).get("token")!;
  const stored = await getDb().passwordResetToken.findFirstOrThrow();
  assert.notEqual(stored.tokenHash, token);
  const results = await Promise.allSettled([
    m.completeRecovery(
      { token, newPassword: "test-new-recovery-passphrase" },
      ctx,
    ),
    m.completeRecovery(
      { token, newPassword: "test-new-recovery-passphrase" },
      ctx,
    ),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await resolveSession(session.token), null);
});
test("unknown recovery is generic and expired reset never changes credentials", async () => {
  const m = await import("../../../src/server/auth/recovery").catch(() => null),
    w = await import("../../../src/server/email/worker").catch(() => null);
  assert.ok(m && w);
  await m.requestRecovery("unknown@example.org", ctx);
  assert.equal(await getDb().emailOutbox.count(), 0);
  await m.requestRecovery("superuser@wapala.org", ctx);
  let text = "";
  await w.deliverOutbox({
    send: async (e) => {
      text = e.text;
    },
  });
  const token = new URLSearchParams(
    new URL(text.match(/http[^\s]+/)![0]).hash.slice(1),
  ).get("token")!;
  const before = await getDb().user.findFirstOrThrow();
  await getDb().passwordResetToken.updateMany({
    data: { expiresAt: new Date(0) },
  });
  await assert.rejects(
    m.completeRecovery(
      { token, newPassword: "test-new-recovery-passphrase" },
      ctx,
    ),
  );
  assert.equal(
    (await getDb().user.findFirstOrThrow()).passwordHash,
    before.passwordHash,
  );
});
test("failed mail retries at most five times and concurrent workers claim one job", async () => {
  const m = await import("../../../src/server/auth/recovery").catch(() => null),
    w = await import("../../../src/server/email/worker").catch(() => null);
  assert.ok(m && w);
  await m.requestRecovery("superuser@wapala.org", ctx);
  let sends = 0;
  const failure = {
    send: async () => {
      sends++;
      throw new Error("private SMTP detail");
    },
  };
  await Promise.all([w.deliverOutbox(failure), w.deliverOutbox(failure)]);
  assert.equal(sends, 1);
  for (let i = 0; i < 6; i++) {
    await getDb().emailOutbox.updateMany({
      data: { nextAttemptAt: new Date(0) },
    });
    await w.deliverOutbox(failure);
  }
  assert.equal(sends, 5);
  const outbox = await getDb().emailOutbox.findFirstOrThrow();
  assert.equal(outbox.payload, null);
  assert.ok(!outbox.lastError?.includes("private SMTP"));
});
test("SSH fallback resets only existing SuperUser and revokes sessions without public token", async () => {
  const m = await import("../../../src/server/auth/recovery").catch(() => null);
  assert.ok(m);
  const session = await login(
    { email: "superuser@wapala.org", password: "test-recovery-passphrase" },
    ctx,
  );
  await m.recoverSuperuser("test-ssh-new-passphrase", ctx);
  assert.equal(await resolveSession(session.token), null);
  assert.equal(
    await getDb().auditLog.count({
      where: {
        action: "SUPERUSER_SSH_RECOVERED",
        actorType: "SERVER_OPERATOR",
      },
    }),
    1,
  );
});

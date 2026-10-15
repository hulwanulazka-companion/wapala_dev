import "server-only";
import { getDb } from "../db";
import { getConfig } from "../config";
import { DomainError } from "../errors";
import { hashPassword } from "../security/password";
import { newToken, digestToken } from "../security/tokens";
import { takeThrottle } from "../security/throttle";
import type { RequestContext } from "../security/request-context";
import { enqueueEmail } from "../email/outbox";
import { writeAudit } from "../audit";
export async function requestRecovery(email: string, ctx: RequestContext) {
  if (getConfig().emailMode === "disabled")
    throw new DomainError(
      "EMAIL_DISABLED",
      409,
      "Email dinonaktifkan. Hubungi pengelola untuk pemulihan akun melalui SSH.",
    );
  await takeThrottle("recovery-ip:" + ctx.ipDigest, 10, 900000);
  await takeThrottle("recovery-email:" + email.trim().toLowerCase(), 3, 900000);
  const user = await getDb().user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user || !user.active || user.archivedAt || !user.recoveryEmail) return;
  const token = newToken(),
    expiresAt = new Date(Date.now() + 1800000);
  await getDb().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR UPDATE`;
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!current.active || current.archivedAt || !current.recoveryEmail) return;
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.passwordResetToken.create({
      data: { userId: user.id, tokenHash: digestToken(token), expiresAt },
    });
    const link = new URL("/wapala/reset", getConfig().appOrigin);
    link.hash = "token=" + token;
    await enqueueEmail(
      tx,
      {
        to: current.recoveryEmail,
        subject: "Pemulihan akses WAPALA",
        text:
          "Tautan pemulihan berlaku 30 menit dan hanya sekali pakai:\n" +
          link.toString(),
      },
      expiresAt,
    );
    await writeAudit(tx, {
      actorType: "ANONYMOUS",
      action: "RECOVERY_REQUESTED",
      entityId: user.id,
      context: ctx,
    });
  });
}
export async function completeRecovery(
  input: { token: string; newPassword: string },
  ctx: RequestContext,
) {
  if (getConfig().emailMode === "disabled")
    throw new DomainError(
      "EMAIL_DISABLED",
      409,
      "Email dinonaktifkan. Hubungi pengelola untuk pemulihan akun melalui SSH.",
    );
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.token))
    throw new DomainError("RESET_INVALID", 400);
  const record = await getDb().passwordResetToken.findUnique({
    where: { tokenHash: digestToken(input.token) },
  });
  if (!record) throw new DomainError("RESET_INVALID", 400);
  const passwordHash = await hashPassword(input.newPassword);
  await getDb().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${record.userId}::uuid FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({
        where: { id: record.userId },
      }),
      fresh = await tx.passwordResetToken.findUniqueOrThrow({
        where: { id: record.id },
      });
    if (
      !user.active ||
      user.archivedAt ||
      fresh.usedAt ||
      fresh.expiresAt <= new Date()
    )
      throw new DomainError("RESET_INVALID", 400);
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        credentialVersion: { increment: 1 },
        failedLoginCount: 0,
        lockUntil: null,
        requiresUnlock: false,
      },
    });
    await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await writeAudit(tx, {
      actorType: "USER",
      actorId: user.id,
      action: "PASSWORD_RECOVERED",
      context: ctx,
    });
  });
}
export async function recoverSuperuser(password: string, ctx: RequestContext) {
  const passwordHash = await hashPassword(password);
  await getDb().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE email='superuser@wapala.org' FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { email: "superuser@wapala.org" },
    });
    if (!user || user.role !== "SUPER_USER" || !user.active || user.archivedAt)
      throw new DomainError("RECOVERY_UNAVAILABLE", 409);
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        credentialVersion: { increment: 1 },
        mustChangePassword: false,
        failedLoginCount: 0,
        lockUntil: null,
        requiresUnlock: false,
      },
    });
    await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await writeAudit(tx, {
      actorType: "SERVER_OPERATOR",
      action: "SUPERUSER_SSH_RECOVERED",
      entityId: user.id,
      context: ctx,
    });
  });
}

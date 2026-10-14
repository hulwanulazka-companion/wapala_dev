import "server-only";
import { z } from "zod";
import { getDb } from "../db";
import { DomainError } from "../errors";
import { newToken } from "../security/tokens";
import { hashPassword } from "../security/password";
import type { RequestContext } from "../security/request-context";
import { writeAudit } from "../audit";
import { assertFresh } from "./sessions";
import { requirePermission, type Principal, type Role } from "./policy";
const roleSchema = z.enum([
  "SUPER_USER",
  "POH",
  "MULTIMEDIA",
  "INVENTARIS",
  "ANGGOTA",
]);
const createSchema = z
  .object({
    email: z.email().max(254),
    name: z.string().trim().min(1).max(100),
    role: roleSchema,
    memberId: z.uuid().optional(),
  })
  .strict();
const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    role: roleSchema.optional(),
    memberId: z.uuid().nullable().optional(),
    active: z.boolean().optional(),
    archived: z.boolean().optional(),
    unlock: z.boolean().optional(),
  })
  .strict();
export const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  archivedAt: true,
  mustChangePassword: true,
  requiresUnlock: true,
  memberId: true,
} as const;
export async function createAdmin(
  principal: Principal,
  input: { email: string; name: string; role: Role; memberId?: string },
  ctx: RequestContext,
) {
  requirePermission(principal, "users:write");
  const fields = createSchema.parse(input),
    temporaryPassword = newToken(),
    passwordHash = await hashPassword(temporaryPassword);
  const user = await getDb().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(72615001)::text`;
    await assertFresh(tx, principal, "users:write");
    if (fields.role === "ANGGOTA") {
      const member = fields.memberId
        ? await tx.member.findUnique({ where: { id: fields.memberId } })
        : null;
      if (!member || member.archivedAt)
        throw new DomainError(
          "INVALID_MEMBER",
          400,
          "Pilih profil anggota aktif untuk akun ini.",
        );
      if (await tx.user.findUnique({ where: { memberId: member.id } }))
        throw new DomainError(
          "MEMBER_LINKED",
          409,
          "Profil anggota sudah memiliki akun.",
        );
    } else if (fields.memberId)
      throw new DomainError(
        "INVALID_MEMBER",
        400,
        "Tautan profil hanya untuk peran Anggota.",
      );
    if (
      await tx.user.findUnique({
        where: { email: fields.email.trim().toLowerCase() },
      })
    )
      throw new DomainError(
        "EMAIL_EXISTS",
        409,
        "Identitas akun sudah digunakan.",
      );
    const created = await tx.user.create({
      data: {
        ...fields,
        email: fields.email.trim().toLowerCase(),
        passwordHash,
        mustChangePassword: true,
      },
      select: userSelect,
    });
    await writeAudit(tx, {
      actorType: "USER",
      actorId: principal.userId,
      action: "USER_CREATED",
      entityId: created.id,
      summary: { role: fields.role },
      context: ctx,
    });
    return created;
  });
  return { user, temporaryPassword };
}
export async function listUsers(principal: Principal) {
  requirePermission(principal, "users:read");
  return getDb().user.findMany({
    select: userSelect,
    orderBy: { createdAt: "asc" },
    take: 100,
  });
}
export async function updateAdmin(
  principal: Principal,
  id: string,
  input: z.infer<typeof updateSchema>,
  ctx: RequestContext,
) {
  requirePermission(principal, "users:write");
  const fields = updateSchema.parse(input);
  if (!z.uuid().safeParse(id).success)
    throw new DomainError("INVALID_INPUT", 400);
  return getDb().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(72615001)::text`;
    await assertFresh(tx, principal, "users:write");
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${id}::uuid FOR UPDATE`;
    const target = await tx.user.findUnique({ where: { id } });
    if (!target) throw new DomainError("NOT_FOUND", 404);
    const archivedAt =
      fields.archived === undefined
        ? target.archivedAt
        : fields.archived
          ? new Date()
          : null;
    const active = fields.active ?? target.active,
      role = fields.role ?? target.role;
    const memberId =
      role === "ANGGOTA"
        ? fields.memberId === undefined
          ? target.memberId
          : fields.memberId
        : null;
    if (role === "ANGGOTA") {
      const member = memberId
        ? await tx.member.findUnique({ where: { id: memberId } })
        : null;
      if (
        (!member || member.archivedAt) &&
        ((active && !archivedAt) ||
          role !== target.role ||
          memberId !== target.memberId)
      )
        throw new DomainError(
          "INVALID_MEMBER",
          400,
          "Pilih profil anggota aktif.",
        );
      if (
        memberId &&
        (await tx.user.findFirst({ where: { memberId, id: { not: id } } }))
      )
        throw new DomainError(
          "MEMBER_LINKED",
          409,
          "Profil sudah memiliki akun.",
        );
    } else if (fields.memberId) throw new DomainError("INVALID_MEMBER", 400);
    if (
      target.active &&
      !target.archivedAt &&
      target.role === "SUPER_USER" &&
      (!active || archivedAt || role !== "SUPER_USER")
    ) {
      if (
        (await tx.user.count({
          where: { role: "SUPER_USER", active: true, archivedAt: null },
        })) <= 1
      )
        throw new DomainError(
          "LAST_SUPERUSER",
          409,
          "Super User aktif terakhir harus dipertahankan.",
        );
    }
    const revoke =
      !active ||
      !!archivedAt ||
      role !== target.role ||
      memberId !== target.memberId;
    const row = await tx.user.update({
      where: { id },
      data: {
        name: fields.name,
        active,
        archivedAt,
        role,
        memberId,
        ...(revoke ? { credentialVersion: { increment: 1 } } : {}),
        ...(fields.unlock
          ? { requiresUnlock: false, lockUntil: null, failedLoginCount: 0 }
          : {}),
      },
      select: userSelect,
    });
    if (revoke)
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    await writeAudit(tx, {
      actorType: "USER",
      actorId: principal.userId,
      action: "USER_UPDATED",
      entityId: id,
      summary: { active, role, archived: !!archivedAt },
      context: ctx,
    });
    return row;
  });
}
export async function resetAdminPassword(
  principal: Principal,
  id: string,
  ctx: RequestContext,
) {
  requirePermission(principal, "users:write");
  if (!z.uuid().safeParse(id).success)
    throw new DomainError("INVALID_INPUT", 400);
  const temporaryPassword = newToken(),
    passwordHash = await hashPassword(temporaryPassword);
  await getDb().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(72615001)::text`;
    await assertFresh(tx, principal, "users:write");
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${id}::uuid FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id } });
    if (!user || user.role === "SUPER_USER" || !user.active || user.archivedAt)
      throw new DomainError("RESET_UNAVAILABLE", 409);
    await tx.user.update({
      where: { id },
      data: {
        passwordHash,
        credentialVersion: { increment: 1 },
        mustChangePassword: true,
        requiresUnlock: false,
        lockUntil: null,
        failedLoginCount: 0,
      },
    });
    await tx.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId: id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await writeAudit(tx, {
      actorType: "USER",
      actorId: principal.userId,
      action: "ADMIN_PASSWORD_RESET",
      entityId: id,
      context: ctx,
    });
  });
  return { temporaryPassword };
}

import "server-only";
import { z } from "zod";
import { getDb } from "../db";
import { assertFresh } from "../auth/sessions";
import { requirePermission, type Principal } from "../auth/policy";
import { memberFields } from "../../lib/operational-schema";
import { DomainError } from "../errors";
import { writeAudit } from "../audit";
import type { RequestContext } from "../security/request-context";
const editable = memberFields
  .pick({
    nama: true,
    nim: true,
    prodi: true,
    angkatan: true,
    jenis_kelamin: true,
    kontak: true,
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Isi perubahan data.");
export const correctionSchema = z
  .object({ version: z.number().int().positive(), changes: editable })
  .strict();
export const reviewSchema = z
  .object({
    id: z.uuid(),
    decision: z.enum(["approved", "rejected"]),
    note: z.string().trim().max(2000),
  })
  .strict();
export async function memberPortal(p: Principal) {
  requirePermission(p, "members:directory");
  return getDb().$transaction(async (tx) => {
    const user = await assertFresh(tx, p, "members:directory");
    const own = user.memberId
      ? await tx.member.findUnique({ where: { id: user.memberId } })
      : null;
    const members = await tx.member.findMany({
      where: { archivedAt: null },
      orderBy: { nia: "asc" },
      take: 2000,
    });
    const directory = members.map((m) => {
      const f = memberFields.parse(m.fields);
      return {
        id: m.id,
        nama: f.nama,
        nia: f.nia,
        prodi: f.prodi,
        angkatan: f.angkatan,
        status: f.status,
      };
    });
    return {
      directory,
      profile:
        own && !own.archivedAt
          ? {
              id: own.id,
              version: own.version,
              fields: memberFields.parse(own.fields),
            }
          : null,
      requests: await tx.memberCorrection.findMany({
        where: { requesterId: p.userId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          status: true,
          note: true,
          proposed: true,
          createdAt: true,
        },
      }),
    };
  });
}
export async function requestCorrection(
  p: Principal,
  input: unknown,
  ctx: RequestContext,
) {
  requirePermission(p, "members:correct");
  const v = correctionSchema.parse(input);
  return getDb().$transaction(async (tx) => {
    const user = await assertFresh(tx, p, "members:correct");
    if (!user.memberId)
      throw new DomainError(
        "PROFILE_NOT_LINKED",
        409,
        "Akun belum ditautkan ke profil anggota oleh Super User.",
      );
    await tx.$queryRaw`SELECT id FROM "Member" WHERE id=${user.memberId}::uuid FOR UPDATE`;
    const member = await tx.member.findUnique({ where: { id: user.memberId } });
    if (!member || member.archivedAt) throw new DomainError("NOT_FOUND", 404);
    if (member.version !== v.version)
      throw new DomainError(
        "CONFLICT",
        409,
        "Profil berubah. Muat ulang sebelum mengajukan koreksi.",
      );
    if (
      await tx.memberCorrection.findFirst({
        where: { memberId: member.id, status: "pending" },
      })
    )
      throw new DomainError(
        "PENDING_REQUEST",
        409,
        "Masih ada permintaan yang menunggu persetujuan.",
      );
    const proposed = memberFields.parse({
      ...memberFields.parse(member.fields),
      ...v.changes,
    });
    if (
      JSON.stringify(proposed) ===
      JSON.stringify(memberFields.parse(member.fields))
    )
      throw new DomainError("NO_CHANGES", 400, "Tidak ada perubahan data.");
    const row = await tx.memberCorrection.create({
      data: {
        memberId: member.id,
        requesterId: p.userId,
        baseVersion: member.version,
        proposed,
      },
    });
    await writeAudit(tx, {
      actorType: "USER",
      actorId: p.userId,
      action: "MEMBER_CORRECTION_REQUESTED",
      entityId: row.id,
      context: ctx,
    });
    return { id: row.id, status: row.status };
  });
}
export async function listCorrections(p: Principal, cursor?: string) {
  requirePermission(p, "corrections:review");
  if (cursor) z.uuid().parse(cursor);
  return getDb().$transaction(async (tx) => {
    await assertFresh(tx, p, "corrections:review");
    const rows = await tx.memberCorrection.findMany({
      where: { status: "pending" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: 100,
      include: { member: true },
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      note: r.note,
      baseVersion: r.baseVersion,
      memberId: r.memberId,
      current: memberFields.parse(r.member.fields),
      proposed: memberFields.parse(r.proposed),
    }));
  });
}
export async function reviewCorrection(
  p: Principal,
  input: unknown,
  ctx: RequestContext,
) {
  requirePermission(p, "corrections:review");
  const v = reviewSchema.parse(input);
  try {
    return await getDb().$transaction(async (tx) => {
      await assertFresh(tx, p, "corrections:review");
      // Member first, then correction: consistent lock order with submissions.
      const initial = await tx.memberCorrection.findUnique({
        where: { id: v.id },
      });
      if (!initial) throw new DomainError("NOT_FOUND", 404);
      await tx.$queryRaw`SELECT id FROM "Member" WHERE id=${initial.memberId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "MemberCorrection" WHERE id=${v.id}::uuid FOR UPDATE`;
      const request = await tx.memberCorrection.findUniqueOrThrow({
        where: { id: v.id },
      });
      if (request.status !== "pending")
        throw new DomainError("CONFLICT", 409, "Permintaan sudah ditinjau.");
      const member = await tx.member.findUniqueOrThrow({
        where: { id: request.memberId },
      });
      if (v.decision === "approved") {
        if (member.archivedAt || member.version !== request.baseVersion)
          throw new DomainError(
            "CONFLICT",
            409,
            "Profil berubah sejak pengajuan. Tolak permintaan dan minta koreksi terbaru.",
          );
        const fields = memberFields.parse(request.proposed);
        await tx.member.update({
          where: { id: member.id },
          data: {
            fields,
            nim: fields.nim ? fields.nim.toLowerCase() : null,
            version: { increment: 1 },
          },
        });
      }
      await tx.memberCorrection.update({
        where: { id: v.id },
        data: {
          status: v.decision,
          note: v.note,
          reviewerId: p.userId,
          reviewedAt: new Date(),
        },
      });
      await writeAudit(tx, {
        actorType: "USER",
        actorId: p.userId,
        action: "MEMBER_CORRECTION_REVIEWED",
        entityId: v.id,
        summary: { decision: v.decision },
        context: ctx,
      });
      return { status: v.decision };
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002")
      throw new DomainError(
        "CONFLICT",
        409,
        "Identitas anggota sudah digunakan. Data belum diubah.",
      );
    throw e;
  }
}

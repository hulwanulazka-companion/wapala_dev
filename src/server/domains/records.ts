import "server-only";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { getDb } from "../db";
import { DomainError } from "../errors";
import { requirePermission, type Principal } from "../auth/policy";
import { assertFresh } from "../auth/sessions";
import { writeAudit } from "../audit";
import type { RequestContext } from "../security/request-context";
import { assertMediaReferences } from "../media/storage";
import { memberFields } from "../../lib/operational-schema";
export { memberFields } from "../../lib/operational-schema";
const text = z.string().trim().max(300);
const optional = text.optional().default("");
const media = z
  .union([z.literal(""), z.string().regex(/^\/api\/media\/[a-f0-9-]{36}$/)])
  .optional()
  .default("");
export const memberSchema = z
  .object({
    id: z.uuid().optional(),
    version: z.number().int().positive().optional(),
    fields: memberFields,
    archived: z.boolean().optional(),
  })
  .strict();
export const memberImportSchema = z
  .object({ rows: z.array(memberFields).min(1).max(2000) })
  .strict();
export type MemberFields = z.infer<typeof memberFields>;
const conflict = (e: unknown) => {
  if (e && typeof e === "object" && "code" in e && e.code === "P2002")
    throw new DomainError(
      "CONFLICT",
      409,
      "Identitas sudah ada. Tidak ada baris yang diimpor.",
    );
  throw e;
};
export async function listMembers(principal: Principal) {
  requirePermission(principal, "members:read");
  return getDb().$transaction(async (tx) => {
    await assertFresh(tx, principal, "members:read");
    const rows = await tx.member.findMany({
      orderBy: { createdAt: "desc" },
      take: 2000,
    });
    return rows.map((m) => ({
      id: m.id,
      version: m.version,
      fields: memberFields.parse(m.fields),
      archived: !!m.archivedAt,
    }));
  });
}
export async function importMembers(
  principal: Principal,
  input: unknown,
  ctx: RequestContext,
) {
  requirePermission(principal, "members:write");
  const rows = memberImportSchema.parse({ rows: input }).rows;
  const seen = new Set<string>(),
    nims = new Set<string>();
  for (const row of rows) {
    const key = row.nia.toLowerCase(),
      nim = row.nim.toLowerCase();
    if (seen.has(key) || (nim && nims.has(nim)))
      throw new DomainError(
        "DUPLICATE",
        409,
        "Identitas duplikat dalam berkas. Perbaiki seluruh batch.",
      );
    seen.add(key);
    if (nim) nims.add(nim);
  }
  try {
    return await getDb().$transaction(async (tx) => {
      await assertFresh(tx, principal, "members:write");
      await assertMediaReferences(
        tx,
        rows.map((row) => row.foto),
        ["member-photo"],
        "private",
      );
      await tx.member.createMany({
        data: rows.map((fields) => ({
          nia: fields.nia.toLowerCase(),
          nim: fields.nim ? fields.nim.toLowerCase() : null,
          fields,
        })),
      });
      await writeAudit(tx, {
        actorType: "USER",
        actorId: principal.userId,
        action: "MEMBERS_IMPORTED",
        summary: { count: rows.length },
        context: ctx,
      });
      return { imported: rows.length };
    });
  } catch (e) {
    return conflict(e);
  }
}
export async function saveMember(
  principal: Principal,
  input: unknown,
  ctx: RequestContext,
) {
  requirePermission(principal, "members:write");
  const v = memberSchema.parse(input);
  try {
    return await getDb().$transaction(async (tx) => {
      await assertFresh(tx, principal, "members:write");
      await assertMediaReferences(
        tx,
        [v.fields.foto],
        ["member-photo"],
        "private",
      );
      if (v.id) {
        await tx.$queryRaw`SELECT id FROM "Member" WHERE id=${v.id}::uuid FOR UPDATE`;
        const old = await tx.member.findUnique({ where: { id: v.id } });
        if (!old) throw new DomainError("NOT_FOUND", 404);
        if (!v.version || old.version !== v.version)
          throw new DomainError("CONFLICT", 409);
      }
      const data = {
        nia: v.fields.nia.toLowerCase(),
        nim: v.fields.nim ? v.fields.nim.toLowerCase() : null,
        fields: v.fields,
        archivedAt: v.archived ? new Date() : null,
      };
      const row = v.id
        ? await tx.member.update({
            where: { id: v.id },
            data: { ...data, version: { increment: 1 } },
          })
        : await tx.member.create({ data });
      await writeAudit(tx, {
        actorType: "USER",
        actorId: principal.userId,
        action: "MEMBER_SAVED",
        entityId: row.id,
        summary: { archived: !!row.archivedAt },
        context: ctx,
      });
      return {
        id: row.id,
        version: row.version,
        fields: memberFields.parse(row.fields),
        archived: !!row.archivedAt,
      };
    });
  } catch (e) {
    return conflict(e);
  }
}
const longText = z.string().trim().max(10000).optional().default("");
const date = z
  .union([z.literal(""), z.iso.date()])
  .optional()
  .default("");
const status = z.enum(["Draft", "Publik"]).optional().default("Draft");
export const contentFields = {
  konten: z
    .object({
      judul: text.min(1),
      slug: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .max(160),
      tipe: z.enum(["Berita", "Announcement"]),
      kategori: optional,
      penulis: optional,
      tanggal: date,
      sampul: media,
      status,
      ringkasan: longText,
      isi: longText,
    })
    .strict(),
  galeri: z
    .object({
      judul: text.min(1),
      kategori: optional,
      lokasi: optional,
      sampul: media,
      deskripsi: longText,
      tanggal: date,
      tanggal_upload: date,
      highlight: z.enum(["Ya", "Tidak"]).optional().default("Tidak"),
      status,
      gambar: z.array(media).max(500).optional().default([]),
      sumber: z.union([z.literal(""), z.url().refine(value => value.startsWith("https://www.wapalatelkomuniversity.org/"))]).optional().default(""),
      tahun_sumber: z.union([z.literal(""), z.string().regex(/^\d{4}$/)]).optional().default(""),
      keterangan_foto: z.array(z.string().max(10000)).max(500).optional().default([]),
    })
    .strict(),
  buku: z
    .object({
      judul: text.min(1),
      kategori: optional,
      deskripsi: longText,
      file: media,
      status,
    })
    .strict(),
};
export const contentKind = z.enum(["konten", "galeri", "buku"]);
type Kind = z.infer<typeof contentKind>;
export async function saveContent(
  principal: Principal,
  kind: Kind,
  input: unknown,
  ctx: RequestContext,
) {
  requirePermission(principal, "content:write");
  contentKind.parse(kind);
  const v = z
    .object({
      id: z.uuid().optional(),
      version: z.number().int().positive().optional(),
      fields: contentFields[kind],
      archived: z.boolean().optional(),
    })
    .strict()
    .parse(input);
  return getDb().$transaction(async (tx) => {
    await assertFresh(tx, principal, "content:write");
    if ("sampul" in v.fields)
      await assertMediaReferences(
        tx,
        [v.fields.sampul, ...("gambar" in v.fields ? v.fields.gambar : [])],
        ["content"],
        "public",
      );
    if ("file" in v.fields)
      await assertMediaReferences(tx, [v.fields.file], ["book"], "private");
    if (v.id) {
      await tx.$queryRaw`SELECT id FROM "ContentRecord" WHERE id=${v.id}::uuid FOR UPDATE`;
      const row = await tx.contentRecord.findUnique({ where: { id: v.id } });
      if (!row || row.kind !== kind) throw new DomainError("NOT_FOUND", 404);
      if (!v.version || row.version !== v.version)
        throw new DomainError("CONFLICT", 409);
    }
    const data = {
      kind,
      fields: v.fields as Prisma.InputJsonValue,
      published: v.fields.status === "Publik",
      archivedAt: v.archived ? new Date() : null,
    };
    const row = v.id
      ? await tx.contentRecord.update({
          where: { id: v.id },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.contentRecord.create({ data });
    await writeAudit(tx, {
      actorType: "USER",
      actorId: principal.userId,
      action: "CONTENT_SAVED",
      entityId: row.id,
      summary: { kind, published: row.published },
      context: ctx,
    });
    return {
      id: row.id,
      version: row.version,
      fields: row.fields,
      archived: !!row.archivedAt,
    };
  });
}
export async function listContent(principal: Principal, kind: Kind) {
  requirePermission(principal, "content:write");
  contentKind.parse(kind);
  return getDb().$transaction(async (tx) => {
    await assertFresh(tx, principal, "content:write");
    return (
      await tx.contentRecord.findMany({
        where: { kind },
        orderBy: { createdAt: "desc" },
        take: 1000,
      })
    ).map((r) => ({
      id: r.id,
      version: r.version,
      fields: r.fields,
      archived: !!r.archivedAt,
    }));
  });
}
export async function publicContent(kind: Kind) {
  contentKind.parse(kind);
  return (
    await getDb().contentRecord.findMany({
      where: { kind, published: true, archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: 1000,
    })
  ).map((r) => ({ id: r.id, fields: r.fields }));
}

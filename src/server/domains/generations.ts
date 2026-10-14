import "server-only";
import { z } from "zod";
import { getDb } from "../db";
import { requirePermission, type Principal } from "../auth/policy";
import { assertFresh } from "../auth/sessions";
import { DomainError } from "../errors";
import { assertMediaReferences } from "../media/storage";
import { writeAudit } from "../audit";
import type { RequestContext } from "../security/request-context";
export const generationSchema = z
  .object({
    number: z.number().int().min(1).max(5000),
    version: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(300),
    label: z.string().trim().max(300),
    year: z.number().int().min(1900).max(2200).nullable(),
    description: z.string().trim().max(10000),
    photo: z.union([
      z.literal(""),
      z.string().regex(/^\/api\/media\/[a-f0-9-]{36}$/),
    ]),
    archived: z.boolean().optional(),
  })
  .strict();
export async function listGenerations(p: Principal) {
  requirePermission(p, "generations:write");
  return getDb().$transaction(async (tx) => {
    await assertFresh(tx, p, "generations:write");
    return (
      await tx.generation.findMany({ orderBy: { number: "desc" }, take: 500 })
    ).map(
      ({
        number,
        version,
        name,
        label,
        year,
        description,
        photo,
        archivedAt,
      }) => ({
        number,
        version,
        name,
        label,
        year,
        description,
        photo,
        archived: !!archivedAt,
      }),
    );
  });
}
export async function saveGeneration(
  p: Principal,
  input: unknown,
  ctx: RequestContext,
) {
  requirePermission(p, "generations:write");
  const v = generationSchema.parse(input);
  try {
    return await getDb().$transaction(async (tx) => {
      await assertFresh(tx, p, "generations:write");
      await tx.$queryRaw`SELECT number FROM "Generation" WHERE number=${v.number} FOR UPDATE`;
      const old = await tx.generation.findUnique({
        where: { number: v.number },
      });
      if ((old && old.version !== v.version) || (!old && v.version))
        throw new DomainError(
          "CONFLICT",
          409,
          "Angkatan sudah berubah. Muat ulang daftar.",
        );
      await assertMediaReferences(
        tx,
        [v.photo],
        ["content", "generation-photo"],
        "public",
      );
      const { archived } = v;
      const data = {
        number: v.number,
        name: v.name,
        label: v.label,
        year: v.year,
        description: v.description,
        photo: v.photo,
      };
      const saved = old
        ? await tx.generation.update({
            where: { number: v.number },
            data: {
              ...data,
              archivedAt: archived ? new Date() : null,
              version: { increment: 1 },
            },
          })
        : await tx.generation.create({
            data: {
              ...data,
              sourceUrl: "",
              sourceKey: "manual-generation:" + v.number,
              archivedAt: archived ? new Date() : null,
            },
          });
      await writeAudit(tx, {
        actorType: "USER",
        actorId: p.userId,
        action: "GENERATION_SAVED",
        entityId: String(v.number),
        summary: { archived: !!saved.archivedAt },
        context: ctx,
      });
      return {
        number: saved.number,
        version: saved.version,
        name: saved.name,
        label: saved.label,
        year: saved.year,
        description: saved.description,
        photo: saved.photo,
        archived: !!saved.archivedAt,
      };
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002")
      throw new DomainError("CONFLICT", 409, "Nomor angkatan sudah digunakan.");
    throw e;
  }
}

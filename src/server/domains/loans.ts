import "server-only";
import { z } from "zod";
import { randomInt } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import { getDb } from "../db";
import { getConfig } from "../config";
import { DomainError } from "../errors";
import { requirePermission, type Principal } from "../auth/policy";
import { assertFresh } from "../auth/sessions";
import { writeAudit } from "../audit";
import { hmacToken } from "../security/tokens";
import type { RequestContext } from "../security/request-context";
import { conditionSchema } from "./inventory";
import { reservedPeak, lockEquipment } from "./stock";
import { loanItemsForHistory } from "./loan-history-items";
const text = z.string().trim().min(1).max(300),
  note = z.string().trim().max(2000);
export const loanRequestSchema = z
  .object({
    institution: text,
    pic: text,
    phone: z.string().regex(/^\+?[0-9 -]{8,20}$/),
    email: z.email().max(254),
    start: z.iso.date(),
    end: z.iso.date(),
    purpose: text.max(2000),
    event: text,
    collateral: text,
    items: z
      .array(
        z
          .object({
            equipmentId: z.uuid(),
            requested: z.number().int().min(1).max(100000),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.start > v.end || v.start < new Date().toISOString().slice(0, 10))
      ctx.addIssue({ code: "custom", message: "Periksa tanggal peminjaman." });
    if (new Set(v.items.map((i) => i.equipmentId)).size !== v.items.length)
      ctx.addIssue({ code: "custom", message: "Alat duplikat." });
  });
export const transitionSchema = z
  .object({
    status: z.enum([
      "approved",
      "borrowed",
      "awaiting_return",
      "late",
      "returned",
      "rejected",
    ]),
    note,
    items: z
      .array(
        z
          .object({
            equipmentId: z.uuid(),
            approved: z.number().int().min(0).max(100000),
            reason: note,
          })
          .strict(),
      )
      .max(50)
      .optional(),
    returns: z
      .array(
        z
          .object({ equipmentId: z.uuid(), condition: conditionSchema })
          .strict(),
      )
      .max(50)
      .optional(),
    penalty: z.number().int().min(0).max(1_000_000_000).optional(),
    penaltyStatus: z.enum(["none", "pending", "paid"]).optional(),
  })
  .strict();
const transitions: Record<string, string[]> = {
  requested: ["approved", "rejected"],
  approved: ["borrowed", "rejected"],
  borrowed: ["awaiting_return", "late"],
  awaiting_return: ["returned", "late"],
  late: ["awaiting_return", "returned"],
  returned: [],
  rejected: [],
};
const include = {
  items: { include: { equipment: { select: { name: true, code: true } } } },
  history: { orderBy: { createdAt: "asc" as const } },
};
function dto(l: Prisma.LoanGetPayload<{ include: typeof include }>) {
  return {
    id: l.id,
    code: l.code,
    institution: l.institution,
    pic: l.pic,
    phone: l.phone,
    email: l.email,
    start: l.start.toISOString().slice(0, 10),
    end: l.end.toISOString().slice(0, 10),
    purpose: l.purpose,
    event: l.event,
    collateral: l.collateral,
    collateralStatus: l.collateralStatus,
    status: l.status,
    notes: l.notes,
    originYear: l.originYear,
    managementYear: l.managementYear,
    penalty: Number(l.penalty),
    penaltyStatus: l.penaltyStatus,
    attachments: l.attachments,
    archived: !!l.archivedAt,
    createdAt: l.createdAt.toISOString(),
    items: loanItemsForHistory(l),
    history: l.history.map((h) => ({
      status: h.status,
      at: h.createdAt.toISOString(),
      note: h.note,
    })),
  };
}
export async function requestLoan(input: unknown, ctx: RequestContext, transaction?: Prisma.TransactionClient) {
  const v = loanRequestSchema.parse(input);
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const execute = async (tx: Prisma.TransactionClient) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('wapala:management'))::text`;
        await lockEquipment(
          tx,
          v.items.map((i) => i.equipmentId),
        );
        const eqs = await tx.equipment.findMany({
          where: { id: { in: v.items.map((i) => i.equipmentId) } },
        });
        const days = (Date.parse(v.end) - Date.parse(v.start)) / 86400000 + 1;
        for (const item of v.items) {
          const eq = eqs.find((e) => e.id === item.equipmentId);
          if (
            !eq ||
            eq.archivedAt ||
            !eq.available ||
            days > eq.maxDays ||
            item.requested > eq.maxQuantity
          )
            throw new DomainError(
              "EQUIPMENT_UNAVAILABLE",
              400,
              "Periksa alat, batas jumlah, dan durasi peminjaman.",
            );
        }
        const settings = await tx.siteSettings.findUniqueOrThrow({
          where: { id: 1 },
        });
        const code =
          "WPL" +
          Array.from(
            { length: 5 },
            () => alphabet[randomInt(alphabet.length)],
          ).join("");
        const row = await tx.loan.create({
          data: {
            institution: v.institution,
            pic: v.pic,
            phone: v.phone,
            email: v.email,
            start: new Date(v.start),
            end: new Date(v.end),
            purpose: v.purpose,
            event: v.event,
            collateral: v.collateral,
            code,
            phoneDigest: hmacToken(
              "loan-phone:" + v.phone.replace(/[^0-9]/g, ""),
              getConfig().securityKey,
            ),
            originYear: settings.managementYear,
            managementYear: settings.managementYear,
            items: { create: v.items },
            history: {
              create: { status: "requested", note: "Pengajuan diterima." },
            },
          },
        });
        await writeAudit(tx, {
          actorType: "ANONYMOUS",
          action: "LOAN_REQUESTED",
          entityId: row.id,
          context: ctx,
        });
        return { id: row.id, code: row.code, status: row.status };
      };
      return await (transaction ? execute(transaction) : getDb().$transaction(execute));
    } catch (e) {
      if (transaction) throw e;
      if (!(e && typeof e === "object" && "code" in e && e.code === "P2002"))
        throw e;
    }
  }
  throw new DomainError("CODE_UNAVAILABLE", 503);
}
export async function listLoans(principal: Principal) {
  requirePermission(principal, "loans:write");
  return getDb().$transaction(async (tx) => {
    await assertFresh(tx, principal, "loans:write");
    return (
      await tx.loan.findMany({
        include,
        orderBy: { createdAt: "desc" },
        take: 1000,
      })
    ).map(dto);
  }, { isolationLevel: "RepeatableRead" });
}
export async function transitionLoan(
  principal: Principal,
  id: string,
  input: unknown,
  ctx: RequestContext,
) {
  requirePermission(principal, "loans:write");
  z.uuid().parse(id);
  const v = transitionSchema.parse(input);
  return getDb().$transaction(async (tx) => {
    await assertFresh(tx, principal, "loans:write");
    await tx.$queryRaw`SELECT id FROM "Loan" WHERE id=${id}::uuid FOR UPDATE`;
    const loan = await tx.loan.findUnique({ where: { id }, include });
    if (!loan || loan.archivedAt) throw new DomainError("NOT_FOUND", 404);
    if (!transitions[loan.status]?.includes(v.status))
      throw new DomainError(
        "INVALID_TRANSITION",
        409,
        "Perubahan status tidak tersedia.",
      );
    if (v.status === "rejected" && !v.note)
      throw new DomainError("REASON_REQUIRED", 400);
    await lockEquipment(
      tx,
      loan.items.map((i) => i.equipmentId),
    );
    if (v.status === "approved") {
      if (
        !v.items ||
        v.items.length !== loan.items.length ||
        new Set(v.items.map((i) => i.equipmentId)).size !== loan.items.length ||
        !v.items.some((i) => i.approved > 0)
      )
        throw new DomainError("INVALID_APPROVAL", 400);
      for (const item of loan.items) {
        const approved = v.items.find(
          (i) => i.equipmentId === item.equipmentId,
        );
        if (
          !approved ||
          approved.approved > item.requested ||
          (approved.approved !== item.requested && !approved.reason)
        )
          throw new DomainError("INVALID_APPROVAL", 400);
        const eq = await tx.equipment.findUniqueOrThrow({
          where: { id: item.equipmentId },
        });
        const reserved = await reservedPeak(
          tx,
          eq.id,
          loan.start,
          loan.end,
          loan.id,
        );
        if (
          eq.archivedAt ||
          !eq.available ||
          approved.approved > eq.fit - reserved
        )
          throw new DomainError(
            "STOCK_UNAVAILABLE",
            409,
            "Stok layak pada jadwal ini tidak mencukupi.",
          );
        await tx.loanItem.update({
          where: { id: item.id },
          data: {
            approved: approved.approved,
            reason: approved.reason,
            outCondition: eq.condition,
          },
        });
      }
    }
    if (v.status === "returned") {
      const approved = loan.items.filter((i) => i.approved > 0);
      if (
        !v.returns ||
        v.returns.length !== approved.length ||
        new Set(v.returns.map((i) => i.equipmentId)).size !== approved.length ||
        !v.note
      )
        throw new DomainError("RETURN_VERIFICATION_REQUIRED", 400);
      for (const item of approved) {
        const returned = v.returns.find(
          (i) => i.equipmentId === item.equipmentId,
        );
        if (!returned) throw new DomainError("INVALID_RETURN", 400);
        await tx.loanItem.update({
          where: { id: item.id },
          data: { returnCondition: returned.condition },
        });
        if (
          ["Rusak Ringan", "Rusak Berat", "Hilang"].includes(returned.condition)
        ) {
          const eq = await tx.equipment.findUniqueOrThrow({
            where: { id: item.equipmentId },
          });
          await tx.equipment.update({
            where: { id: eq.id },
            data: {
              fit: Math.max(0, eq.fit - item.approved),
              condition: returned.condition,
              version: { increment: 1 },
            },
          });
        }
      }
    }
    await tx.loan.update({
      where: { id },
      data: {
        status: v.status,
        notes: v.note,
        ...(v.status === "borrowed" ? { collateralStatus: "held" } : {}),
        ...(v.status === "returned"
          ? {
              collateralStatus: "returned",
              penalty: v.penalty || 0,
              penaltyStatus: v.penalty ? v.penaltyStatus || "pending" : "none",
            }
          : {}),
      },
    });
    await tx.loanHistory.create({
      data: {
        loanId: id,
        status: v.status,
        note: v.note,
        actorId: principal.userId,
      },
    });
    await writeAudit(tx, {
      actorType: "USER",
      actorId: principal.userId,
      action: "LOAN_STATUS_CHANGED",
      entityId: id,
      summary: { from: loan.status, to: v.status },
      context: ctx,
    });
    return dto(await tx.loan.findUniqueOrThrow({ where: { id }, include }));
  });
}

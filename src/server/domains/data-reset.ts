import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { getDb } from "../db";
import { requirePermission, type Principal } from "../auth/policy";
import { assertFresh } from "../auth/sessions";
import { verifyPassword } from "../security/password";
import { takeThrottle } from "../security/throttle";
import { DomainError } from "../errors";
import { writeAudit } from "../audit";
import type { RequestContext } from "../security/request-context";
import { archivedLoanItems, snapshotLoanItems } from "./loan-history-items";

export const resetSelection = z
  .object({
    target: z.enum(["members", "inventory"]),
    mode: z.enum(["archive", "delete"]),
  })
  .strict();
export const resetSchema = resetSelection
  .extend({
    snapshot: z.string().regex(/^[a-f0-9]{64}$/),
    confirmation: z.string().max(100),
    password: z.string().min(1).max(1024),
  })
  .strict();
type Selection = z.infer<typeof resetSelection>;

async function inspect(tx: Prisma.TransactionClient, v: Selection) {
  const where = v.mode === "archive" ? { archivedAt: null } : {};
  const rows =
    v.target === "members"
      ? await tx.member.findMany({
          where,
          select: { id: true, version: true },
          orderBy: { id: "asc" },
        })
      : await tx.equipment.findMany({
          where,
          select: { id: true, version: true },
          orderBy: { id: "asc" },
        });
  const ids = rows.map((r) => r.id);
  let blocked = 0;
  if (v.target === "members" && v.mode === "delete") {
    blocked = await tx.member.count({
      where: {
        id: { in: ids },
        OR: [{ user: { isNot: null } }, { corrections: { some: {} } }],
      },
    });
  }
  if (v.target === "inventory") {
    blocked = await tx.equipment.count({
      where: {
        id: { in: ids },
        loanItems: {
          some: { loan: { status: { notIn: ["returned", "rejected"] } } },
        },
      },
    });
  }
  const confirmation = `${v.mode === "delete" ? "HAPUS PERMANEN" : "ARSIPKAN"} ${v.target === "members" ? "ANGGOTA" : "INVENTARIS"}`;
  return {
    count: rows.length,
    blocked,
    confirmation,
    snapshot: createHash("sha256")
      .update(JSON.stringify({ ...v, rows, blocked }))
      .digest("hex"),
  };
}

export async function previewDataReset(p: Principal, input: unknown) {
  requirePermission(p, "data:reset");
  const v = resetSelection.parse(input);
  return getDb().$transaction(async (tx) => {
    await assertFresh(tx, p, "data:reset");
    return inspect(tx, v);
  });
}

export async function resetData(
  p: Principal,
  input: unknown,
  ctx: RequestContext,
) {
  requirePermission(p, "data:reset");
  const v = resetSchema.parse(input);
  await takeThrottle("data-reset:" + p.userId, 5, 900000);
  const old = await getDb().user.findUniqueOrThrow({ where: { id: p.userId } });
  if (!(await verifyPassword(old.passwordHash, v.password)))
    throw new DomainError(
      "PASSWORD_INVALID",
      400,
      "Password Super User tidak sesuai.",
    );
  return getDb().$transaction(
    async (tx) => {
      // Match requestLoan/management reset: advisory lock precedes user/row locks.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('wapala:management'))::text`;
      const current = await assertFresh(tx, p, "data:reset");
      if (current.passwordHash !== old.passwordHash)
        throw new DomainError(
          "CONFLICT",
          409,
          "Kredensial berubah. Silakan login kembali.",
        );
      // Serialize master edits/imports and related writes while checking and executing.
      // Static identifiers only: never interpolate table names from request input.
      if (v.target === "members")
        await tx.$executeRaw`LOCK TABLE "Member", "MemberCorrection" IN EXCLUSIVE MODE`;
      else {
        // Loan transitions lock loan before equipment. EXCLUSIVE also excludes
        // SELECT FOR UPDATE, preventing row-lock/table-lock upgrade deadlocks.
        await tx.$executeRaw`LOCK TABLE "Loan" IN EXCLUSIVE MODE`;
        await tx.$executeRaw`LOCK TABLE "Equipment", "LoanItem" IN EXCLUSIVE MODE`;
      }
      const preview = await inspect(tx, { target: v.target, mode: v.mode });
      if (v.confirmation !== preview.confirmation)
        throw new DomainError(
          "CONFIRMATION_INVALID",
          400,
          "Ketik teks konfirmasi persis seperti yang ditampilkan.",
        );
      if (v.snapshot !== preview.snapshot)
        throw new DomainError(
          "CONFLICT",
          409,
          "Data berubah sejak diperiksa. Tutup dan periksa ulang sebelum reset.",
        );
      if (preview.blocked)
        throw new DomainError(
          "RESET_BLOCKED",
          409,
          v.target === "inventory"
            ? "Reset dibatalkan seluruhnya. Ada alat pada peminjaman yang belum selesai/ditolak. Selesaikan peminjaman dahulu; riwayat yang selesai tetap disimpan."
            : "Reset dibatalkan seluruhnya. Ada anggota terkait akun atau riwayat koreksi. Gunakan arsip agar riwayat tetap aman.",
        );
      const where = v.mode === "archive" ? { archivedAt: null } : {};
      let affected: number;
      if (v.target === "members") {
        affected =
          v.mode === "delete"
            ? (await tx.member.deleteMany({ where })).count
            : (
                await tx.member.updateMany({
                  where,
                  data: { archivedAt: new Date(), version: { increment: 1 } },
                })
              ).count;
      } else {
        if (v.mode === "delete") {
          // Tables are exclusively locked above, and inspect established every
          // linked loan is terminal. Copy before detaching, in this transaction.
          const loans = await tx.loan.findMany({
            where: { items: { some: {} } },
            include: {
              items: {
                include: { equipment: { select: { code: true, name: true } } },
              },
            },
          });
          for (const loan of loans) {
            await tx.loan.update({
              where: { id: loan.id },
              data: {
                archivedItems: [
                  ...archivedLoanItems.parse(loan.archivedItems),
                  ...snapshotLoanItems(loan.items),
                ],
              },
            });
          }
          await tx.loanItem.deleteMany({});
        }
        affected =
          v.mode === "delete"
            ? (await tx.equipment.deleteMany({ where })).count
            : (
                await tx.equipment.updateMany({
                  where,
                  data: {
                    archivedAt: new Date(),
                    available: false,
                    version: { increment: 1 },
                  },
                })
              ).count;
      }
      await writeAudit(tx, {
        actorType: "USER",
        actorId: p.userId,
        action: "DATA_RESET",
        summary: { target: v.target, mode: v.mode, affected },
        context: ctx,
      });
      return { affected };
    },
    { timeout: 15000 },
  );
}

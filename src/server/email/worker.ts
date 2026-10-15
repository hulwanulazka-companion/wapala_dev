import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "../db";
import { getConfig } from "../config";
import { decryptPayload } from "./encryption";
import { envelopeSchema, type MailTransport } from "./outbox";
export async function deliverOutbox(transport: MailTransport, batchSize = 5) {
  if (getConfig().emailMode === "disabled")
    return { delivered: 0, failed: 0, disabled: true };
  const db = getDb(),
    now = new Date();
  await db.emailOutbox.updateMany({
    where: { payload: { not: null }, expiresAt: { lte: now } },
    data: { payload: null, lastError: "EXPIRED" },
  });
  await db.securityThrottle.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 86400000) } },
  });
  let delivered = 0,
    failed = 0;
  for (let i = 0; i < Math.min(Math.max(batchSize, 1), 20); i++) {
    const leaseToken = randomUUID();
    const item = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM "EmailOutbox" WHERE payload IS NOT NULL AND "deliveredAt" IS NULL AND attempts < 5 AND "nextAttemptAt"<=${now} AND "expiresAt">${now} AND ("leaseUntil" IS NULL OR "leaseUntil"<${now}) ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!rows.length) return null;
      return tx.emailOutbox.update({
        where: { id: rows[0].id },
        data: {
          leaseToken,
          leaseUntil: new Date(Date.now() + 120000),
          attempts: { increment: 1 },
        },
      });
    });
    if (!item) break;
    try {
      const envelope = envelopeSchema.parse(
        JSON.parse(decryptPayload(item.payload!, getConfig().securityKey)),
      );
      await transport.send(envelope, item.id);
      await db.emailOutbox.updateMany({
        where: { id: item.id, leaseToken },
        data: {
          deliveredAt: new Date(),
          payload: null,
          leaseToken: null,
          leaseUntil: null,
          lastError: null,
        },
      });
      delivered++;
    } catch {
      await db.emailOutbox.updateMany({
        where: { id: item.id, leaseToken },
        data: {
          leaseToken: null,
          leaseUntil: null,
          lastError: "DELIVERY_FAILED",
          nextAttemptAt: new Date(Date.now() + 30000 * 2 ** item.attempts),
          ...(item.attempts >= 5 ? { payload: null } : {}),
        },
      });
      failed++;
    }
  }
  return { delivered, failed };
}

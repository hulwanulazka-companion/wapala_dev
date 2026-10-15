import "server-only";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { getConfig } from "../config";
import { encryptPayload } from "./encryption";
export const envelopeSchema = z
  .object({
    to: z.email(),
    subject: z
      .string()
      .max(200)
      .regex(/^[^\r\n]+$/),
    text: z.string().max(20000),
  })
  .strict();
export type MailEnvelope = z.infer<typeof envelopeSchema>;
export interface MailTransport {
  send(envelope: MailEnvelope, idempotencyKey: string): Promise<void>;
}
export async function enqueueEmail(
  tx: Prisma.TransactionClient,
  envelope: MailEnvelope,
  expiresAt: Date,
) {
  if (getConfig().emailMode === "disabled") return null;
  const validated = envelopeSchema.parse(envelope);
  return tx.emailOutbox.create({
    data: {
      payload: encryptPayload(
        JSON.stringify(validated),
        getConfig().securityKey,
      ),
      expiresAt,
    },
  });
}

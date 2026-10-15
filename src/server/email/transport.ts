import "server-only";
import nodemailer from "nodemailer";
import { z } from "zod";
import { getConfig } from "../config";
import { DomainError } from "../errors";
import type { MailTransport } from "./outbox";
export function createMailTransport(): MailTransport {
  const config = getConfig();
  if (config.emailMode === "disabled")
    throw new DomainError(
      "EMAIL_DISABLED",
      409,
      "Email dinonaktifkan. Pemulihan akun melalui pengelola server (SSH).",
    );
  if (config.emailMode === "sink") return { send: async () => {} };
  const options = z
    .object({
      SMTP_HOST: z.string().min(1),
      SMTP_PORT: z.coerce.number().int().min(1).max(65535),
      SMTP_USER: z.string().min(1),
      SMTP_PASSWORD: z.string().min(1),
      SMTP_FROM: z.email(),
    })
    .safeParse(process.env);
  if (!options.success)
    throw new DomainError(
      "SMTP_CONFIG_INVALID",
      503,
      "Konfigurasi SMTP belum valid.",
    );
  const s = options.data,
    transport = nodemailer.createTransport({
      host: s.SMTP_HOST,
      port: s.SMTP_PORT,
      secure: s.SMTP_PORT === 465,
      requireTLS: s.SMTP_PORT !== 465,
      auth: { user: s.SMTP_USER, pass: s.SMTP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 45000,
    });
  return {
    send: async (envelope, id) => {
      await transport.sendMail({
        ...envelope,
        from: s.SMTP_FROM,
        messageId: `<${id}@${new URL(config.appOrigin).hostname}>`,
      });
    },
  };
}

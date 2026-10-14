import "server-only";
import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Prisma } from "../../generated/prisma/client";
import { getDb } from "../db";
import { DomainError } from "../errors";
import {
  requirePermission,
  type Permission,
  type Principal,
} from "../auth/policy";
import { assertFresh } from "../auth/sessions";
import { writeAudit } from "../audit";
import type { RequestContext } from "../security/request-context";
import { mediaRoot, mediaPath } from "./paths";
import { sanitizeImage, sanitizeBook } from "./validation";
import { scanMedia } from "./scanner";
export const purposeSchema = z.enum([
  "generation-photo",
  "content",
  "campaign",
  "inventory",
  "branding",
  "book",
  "donation-proof",
  "applicant-photo",
  "loan-proof",
  "member-photo",
  "event-cover",
  "event-poster",
  "event-upload",
]);
export type MediaPurpose = z.infer<typeof purposeSchema>;
const writePermissions: Record<MediaPurpose, Permission> = {
  "generation-photo": "generations:write",
  "event-cover": "events:write",
  "event-poster": "events:write",
  "event-upload": "events:write",
  content: "content:write",
  campaign: "campaigns:write",
  inventory: "inventory:write",
  branding: "settings:write",
  book: "content:write",
  "donation-proof": "campaigns:write",
  "applicant-photo": "recruitment:write",
  "loan-proof": "loans:write",
  "member-photo": "members:write",
};
const readPermissions: Record<MediaPurpose, Permission> = {
  ...writePermissions,
  "applicant-photo": "recruitment:read",
  "member-photo": "members:read",
};
const publicPurposes = new Set<MediaPurpose>([
  "generation-photo",
  "event-cover",
  "event-poster",
  "content",
  "campaign",
  "inventory",
  "branding",
]);
export const mediaWritePermission = (purpose: MediaPurpose) =>
  writePermissions[purpose];
type StorageOptions = {
  root?: string;
  scan?: (path: string) => Promise<number>;
};
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
let processing = false;
export async function mediaSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (processing)
    throw new DomainError(
      "MEDIA_BUSY",
      429,
      "Ada berkas yang sedang diperiksa. Coba beberapa saat lagi.",
    );
  processing = true;
  try {
    return await fn();
  } finally {
    processing = false;
  }
}
export async function registerMedia(
  principal: Principal,
  input: { bytes: Buffer; mime: string; purpose: MediaPurpose },
  ctx: RequestContext,
  options: StorageOptions = {},
) {
  const purpose = purposeSchema.parse(input.purpose),
    permission = writePermissions[purpose];
  requirePermission(principal, permission);
  return mediaSlot(async () => {
    const result =
      purpose === "book"
        ? await sanitizeBook(input.bytes, input.mime)
        : await sanitizeImage(input.bytes, input.mime);
    const root = options.root || mediaRoot(),
      id = randomUUID(),
      quarantine = join(root, "quarantine", id + ".bin"),
      final = mediaPath(root, id, result.extension);
    await mkdir(dirname(quarantine), { recursive: true, mode: 0o700 });
    let written = false;
    try {
      await writeFile(quarantine, input.bytes, { flag: "wx", mode: 0o600 });
      await scanMedia(quarantine, options.scan);
      await mkdir(dirname(final), { recursive: true, mode: 0o700 });
      await writeFile(final, result.bytes, { flag: "wx", mode: 0o600 });
      written = true;
      await getDb().$transaction(async (tx) => {
        await assertFresh(tx, principal, permission);
        await tx.media.create({
          data: {
            id,
            purpose,
            visibility: publicPurposes.has(purpose) ? "public" : "private",
            mime: result.mime,
            extension: result.extension,
            checksum: hash(result.bytes),
            originalHash: hash(input.bytes),
            size: result.bytes.length,
            width: result.width,
            height: result.height,
            ownerId: principal.userId,
            scannedAt: new Date(),
          },
        });
        await writeAudit(tx, {
          actorType: "USER",
          actorId: principal.userId,
          action: "MEDIA_REGISTERED",
          entityId: id,
          summary: { purpose, bytes: result.bytes.length },
          context: ctx,
        });
      });
      return {
        id,
        url: "/api/media/" + id,
        width: result.width,
        height: result.height,
      };
    } catch (e) {
      if (written) await unlink(final).catch(() => {});
      throw e;
    } finally {
      await unlink(quarantine).catch(() => {});
    }
  });
}
export async function readMedia(
  id: string,
  principal: Principal | null,
  options: Pick<StorageOptions, "root"> = {},
) {
  z.uuid().parse(id);
  const media = await getDb().$transaction(async (tx) => {
    const row = await tx.media.findUnique({ where: { id } });
    if (!row) throw new DomainError("NOT_FOUND", 404);
    if (row.visibility !== "public") {
      if (!principal) throw new DomainError("NOT_FOUND", 404);
      const permission = readPermissions[purposeSchema.parse(row.purpose)];
      await assertFresh(tx, principal, permission);
    }
    return row;
  });
  const path = mediaPath(
    options.root || mediaRoot(),
    media.id,
    media.extension as "webp" | "pdf" | "epub",
  );
  const bytes = await readFile(path);
  if (hash(bytes) !== media.checksum)
    throw new DomainError("MEDIA_CORRUPT", 503);
  return {
    bytes,
    mime: media.mime,
    width: media.width,
    height: media.height,
    checksum: media.checksum,
    visibility: media.visibility,
  };
}
export async function assertMediaReferences(
  tx: Prisma.TransactionClient,
  urls: string[],
  purposes: MediaPurpose[],
  visibility: "public" | "private",
) {
  for (const url of [...new Set(urls.filter(Boolean))]) {
    const id = /^\/api\/media\/([a-f0-9-]{36})$/.exec(url)?.[1];
    if (!id) throw new DomainError("INVALID_MEDIA", 400);
    const media = await tx.media.findUnique({ where: { id } });
    if (
      !media ||
      media.visibility !== visibility ||
      !purposes.includes(media.purpose as MediaPurpose)
    )
      throw new DomainError(
        "INVALID_MEDIA",
        400,
        "Pilih berkas terdaftar dengan akses yang sesuai.",
      );
  }
}

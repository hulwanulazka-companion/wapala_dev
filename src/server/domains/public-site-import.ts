import "server-only";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile, lstat, realpath } from "node:fs/promises";
import { join, relative, isAbsolute, dirname } from "node:path";
import { getDb } from "../db";
import { writeAudit } from "../audit";
import { mediaRoot, mediaPath } from "../media/paths";
import { sanitizeImage } from "../media/validation";
import { scanMediaDirectory } from "../media/scanner";
import { contentFields } from "./records";
import sharp from "sharp";

const source = "https://www.wapalatelkomuniversity.org";
const sourceUrl = z.url().refine((value) => {
  const u = new URL(value);
  return (
    u.protocol === "https:" &&
    [
      "www.wapalatelkomuniversity.org",
      "dskozecjuuogndcaqguc.supabase.co",
    ].includes(u.hostname) &&
    !u.username &&
    !u.password &&
    !u.port
  );
});
const asset = z.object({
  sourceUrl,
  file: z.string().regex(/^assets\/[a-f0-9]{64}\.(png|jpg|webp)$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
  bytes: z
    .number()
    .int()
    .min(1)
    .max(20 * 1024 * 1024),
});
export const publicSiteManifestSchema = z.object({
  version: z.literal(1),
  source: z.literal(source),
  fetchedAt: z.iso.datetime(),
  coverage: z.object({
    generations: z.number().int(),
    albums: z.number().int(),
    expectedAlbums: z.number().int(),
    pages: z.number().int(),
    photos: z.number().int(),
  }),
  generations: z
    .array(
      z.object({
        sourceKey: z.string().regex(/^generation:\d+$/),
        number: z.string().regex(/^\d+$/),
        name: z.string().min(1).max(300),
        label: z.string().max(300),
        year: z.number().int().nullable(),
        description: z.string().max(10000),
        sourceUrl,
        imageUrl: sourceUrl,
      }),
    )
    .max(500),
  albums: z
    .array(
      z.object({
        sourceKey: z.string().regex(/^album:[a-z0-9-]+$/),
        sourceId: z.string().regex(/^[a-z0-9-]+$/),
        sourceUrl,
        title: z.string().min(1).max(300),
        description: z.string().max(10000),
        category: z.string().max(300),
        location: z.string().max(300),
        activityDate: z.union([z.literal(""), z.iso.date()]),
        uploadedAt: z.union([z.literal(""), z.iso.date()]),
        year: z.number().int().nullable(),
        expectedPhotos: z.number().int().min(1).max(500),
        coverUrl: sourceUrl,
        photos: z
          .array(z.object({ url: sourceUrl, caption: z.string().max(10000) }))
          .max(500),
      }),
    )
    .max(1000),
  assets: z.array(asset).max(5000),
});
const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
const mediaId = (checksum: string) => {
  const h = hash("wapala-public-source-image:" + checksum);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
async function checkedPath(root: string, path: string) {
  const full = join(root, path);
  const stat = await lstat(full);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw Error("Invalid bundle file");
  const resolved = await realpath(full),
    rel = relative(root, resolved);
  if (!rel || rel.startsWith("..") || isAbsolute(rel))
    throw Error("Bundle path escaped root");
  return resolved;
}
export async function importPublicSite(bundleRoot: string, apply = false) {
  const root = await realpath(bundleRoot);
  const raw = await readFile(await checkedPath(root, "manifest.json"));
  if (raw.length > 10 * 1024 * 1024) throw Error("Manifest too large");
  const checksum = (
    await readFile(await checkedPath(root, "manifest.sha256"), "utf8")
  ).trim();
  if (hash(raw) !== checksum) throw Error("Manifest checksum mismatch");
  const manifest = publicSiteManifestSchema.parse(
    JSON.parse(raw.toString("utf8")),
  );
  if (manifest.assets.reduce((n, a) => n + a.bytes, 0) > 500 * 1024 * 1024)
    throw Error("Bundle exceeds 500 MB import budget");
  if (
    manifest.coverage.generations !== manifest.generations.length ||
    manifest.coverage.albums !== manifest.albums.length ||
    (manifest.coverage.expectedAlbums &&
      manifest.coverage.expectedAlbums !== manifest.albums.length) ||
    manifest.coverage.photos !==
      manifest.albums.reduce((n, a) => n + a.photos.length, 0)
  )
    throw Error("Incomplete source coverage");
  if (
    new Set(manifest.generations.map((g) => Number(g.number))).size !==
      manifest.generations.length ||
    new Set(manifest.albums.map((a) => a.sourceId)).size !==
      manifest.albums.length ||
    new Set(manifest.assets.map((a) => a.sourceUrl)).size !==
      manifest.assets.length
  )
    throw Error("Duplicate source identifiers");
  for (const album of manifest.albums)
    if (
      album.expectedPhotos !== album.photos.length ||
      !album.photos.some((p) => p.url === album.coverUrl)
    )
      throw Error("Incomplete album photos");
  const assets = new Map(manifest.assets.map((a) => [a.sourceUrl, a]));
  const requested = [
    ...manifest.generations.map((g) => g.imageUrl),
    ...manifest.albums.flatMap((a) => [
      a.coverUrl,
      ...a.photos.map((p) => p.url),
    ]),
  ];
  for (const url of requested)
    if (!assets.has(url)) throw Error("Referenced photo absent from bundle");
  const db = getDb();
  const [existingGenerations, existingAlbums] = await Promise.all([
    db.generation.findMany(),
    db.contentRecord.findMany({
      where: { kind: "galeri", sourceId: { not: null } },
      select: { id: true, sourceId: true },
    }),
  ]);
  for (const row of manifest.generations) {
    const old = existingGenerations.find(
      (g) => g.number === Number(row.number),
    );
    if (old && old.sourceKey !== source + "#" + row.sourceKey)
      throw Error("Generation number already belongs to another source");
  }
  const generations = manifest.generations.filter(
    (g) => !existingGenerations.some((e) => e.number === Number(g.number)),
  );
  const albums = manifest.albums.filter(
    (a) =>
      !existingAlbums.some(
        (e) => e.sourceId === source + "/album#" + a.sourceId,
      ),
  );
  const report = {
    apply,
    manifestSha256: checksum,
    generations: {
      add: generations.length,
      skip: manifest.generations.length - generations.length,
    },
    albums: {
      add: albums.length,
      skip: manifest.albums.length - albums.length,
    },
    media: { add: 0, reuse: 0 },
    photos: manifest.coverage.photos,
  };
  const needed = [
    ...new Set([
      ...generations.map((g) => g.imageUrl),
      ...albums.flatMap((a) => [a.coverUrl, ...a.photos.map((p) => p.url)]),
    ]),
  ];
  const prepared = new Map<
    string,
    Awaited<ReturnType<typeof sanitizeImage>> & {
      id: string;
      originalHash: string;
    }
  >();
  const scannedHashes = new Set<string>();
  for (const url of needed) {
    const item = assets.get(url)!,
      path = await checkedPath(root, item.file),
      bytes = await readFile(path);
    if (bytes.length !== item.bytes || hash(bytes) !== item.sha256)
      throw Error("Image checksum mismatch: " + item.file);
    const id = mediaId(item.sha256),
      old = await db.media.findUnique({ where: { id } });
    if (old) {
      if (
        old.purpose !== "content" ||
        old.visibility !== "public" ||
        old.originalHash !== item.sha256
      )
        throw Error("Imported media identity conflict");
      const file = await readFile(mediaPath(mediaRoot(), id, "webp"));
      if (hash(file) !== old.checksum)
        throw Error("Existing media checksum mismatch");
      report.media.reuse++;
      continue;
    }
    if (scannedHashes.has(item.sha256)) continue;
    scannedHashes.add(item.sha256);
    let imageBytes = bytes,
      imageMime: string = item.mime;
    // Trusted operator bundles may retain larger source originals; public upload
    // limits stay unchanged. Originals are still scanned before any data write.
    if (bytes.length > 5 * 1024 * 1024) {
      const image = sharp(bytes, {
        limitInputPixels: 24000000,
        failOn: "error",
      });
      const metadata = await image.metadata();
      if ((metadata.pages || 1) > 1)
        throw Error("Animated source image unsupported");
      imageBytes = await image
        .rotate()
        .resize({
          width: 2400,
          height: 2400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 90 })
        .toBuffer();
      imageMime = "image/webp";
    }
    const result = await sanitizeImage(imageBytes, imageMime);
    prepared.set(url, { ...result, id, originalHash: item.sha256 });
    report.media.add++;
  }
  // No media, database, or audit writes occur during dry-run.
  if (!apply) return report;
  if (prepared.size) {
    const assetFolder = await realpath(join(root, "assets"));
    if (relative(root, assetFolder) !== "assets")
      throw Error("Invalid asset directory");
    await scanMediaDirectory(assetFolder);
  }
  const ctx = {
    ipDigest: "server-operator",
    userAgent: "WAPALA public-site import",
    requestId: randomUUID(),
  };
  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('wapala:public-site-import'))::text`;
      for (const entry of prepared.values()) {
        const old = await tx.media.findUnique({ where: { id: entry.id } });
        if (old) continue;
        const path = mediaPath(mediaRoot(), entry.id, "webp");
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        // A previous interrupted run may have left identical bytes before commit.
        try {
          await writeFile(path, entry.bytes, { flag: "wx", mode: 0o600 });
        } catch (error) {
          if (!(
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "EEXIST"
          ))
            throw error;
          if (hash(await readFile(path)) !== hash(entry.bytes))
            throw Error("Media storage collision");
        }
        await tx.media.create({
          data: {
            id: entry.id,
            purpose: "content",
            visibility: "public",
            mime: entry.mime,
            extension: entry.extension,
            checksum: hash(entry.bytes),
            originalHash: entry.originalHash,
            size: entry.bytes.length,
            width: entry.width,
            height: entry.height,
            scannedAt: new Date(),
          },
        });
      }
      const url = (value: string) =>
        "/api/media/" + mediaId(assets.get(value)!.sha256);
      for (const row of generations) {
        const old = await tx.generation.findUnique({
          where: { number: Number(row.number) },
        });
        if (old) {
          if (old.sourceKey !== source + "#" + row.sourceKey)
            throw Error("Generation source conflict");
          continue;
        }
        await tx.generation.create({
          data: {
            number: Number(row.number),
            name: row.name,
            label: row.label,
            year: row.year,
            description: row.description,
            photo: url(row.imageUrl),
            sourceUrl: row.sourceUrl,
            sourceKey: source + "#" + row.sourceKey,
          },
        });
      }
      for (const row of albums) {
        const sourceId = source + "/album#" + row.sourceId;
        if (
          await tx.contentRecord.findUnique({
            where: { kind_sourceId: { kind: "galeri", sourceId } },
          })
        )
          continue;
        const photos = [...row.photos].sort(
          (a, b) =>
            Number(b.url === row.coverUrl) - Number(a.url === row.coverUrl),
        );
        const fields = contentFields.galeri.parse({
          judul: row.title,
          kategori: row.category,
          lokasi: row.location,
          deskripsi: row.description,
          sampul: url(row.coverUrl),
          gambar: photos.map((p) => url(p.url)),
          keterangan_foto: photos.map((p) => p.caption),
          sumber: row.sourceUrl,
          tahun_sumber: row.year ? String(row.year) : "",
          tanggal: row.activityDate,
          tanggal_upload: row.uploadedAt,
          status: "Publik",
          highlight: "Tidak",
        });
        await tx.contentRecord.create({
          data: { kind: "galeri", sourceId, published: true, fields },
        });
      }
      if (generations.length || albums.length || prepared.size)
        await writeAudit(tx, {
          actorType: "SERVER_OPERATOR",
          action: "PUBLIC_SOURCE_IMPORTED",
          summary: {
            generations: generations.length,
            albums: albums.length,
            media: prepared.size,
          },
          context: ctx,
        });
    },
    { timeout: 60000 },
  );
  return report;
}

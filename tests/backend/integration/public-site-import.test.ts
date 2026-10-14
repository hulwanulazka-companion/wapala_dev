import test, { beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { clean } from "./helpers";
import { getDb } from "../../../src/server/db";
import { importPublicSite } from "../../../src/server/domains/public-site-import";
const hash = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
let folder: string;
beforeEach(async () => {
  await clean();
  folder = await mkdtemp(join(tmpdir(), "wapala-public-import-"));
  process.env.MEDIA_ROOT = join(folder, "media");
  await mkdir(join(folder, "assets"));
  const bytes = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "#225544" },
  })
    .png()
    .toBuffer();
  const sha = hash(bytes),
    image = "https://www.wapalatelkomuniversity.org/image/test.png",
    source = "https://www.wapalatelkomuniversity.org";
  await writeFile(join(folder, "assets", sha + ".png"), bytes);
  const manifest = {
    version: 1,
    source,
    fetchedAt: new Date().toISOString(),
    coverage: {
      generations: 1,
      albums: 1,
      expectedAlbums: 1,
      pages: 1,
      photos: 1,
    },
    generations: [
      {
        sourceKey: "generation:1",
        number: "01",
        name: "Uji",
        label: "Angkatan I",
        year: null,
        description: "",
        sourceUrl: source + "/profil",
        imageUrl: image,
      },
    ],
    albums: [
      {
        sourceKey: "album:uji",
        sourceId: "uji",
        sourceUrl: source + "/album",
        title: "Album uji",
        description: "Cerita",
        category: "Gunung Hutan",
        location: "",
        activityDate: "",
        uploadedAt: "",
        year: 2025,
        expectedPhotos: 1,
        coverUrl: image,
        photos: [{ url: image, caption: "Keterangan asli" }],
      },
    ],
    assets: [
      {
        sourceUrl: image,
        file: "assets/" + sha + ".png",
        sha256: sha,
        mime: "image/png",
        bytes: bytes.length,
      },
    ],
  };
  const raw = JSON.stringify(manifest);
  await writeFile(join(folder, "manifest.json"), raw);
  await writeFile(join(folder, "manifest.sha256"), hash(raw));
});
afterEach(async () => {
  if (folder) await rm(folder, { recursive: true, force: true });
});
after(() => getDb().$disconnect());
test("public source dry-run never writes records or media and detects tampering", async () => {
  const report = await importPublicSite(folder);
  assert.equal(report.generations.add, 1);
  assert.equal(report.albums.add, 1);
  assert.equal(await getDb().generation.count(), 0);
  assert.equal(await getDb().media.count(), 0);
  await writeFile(join(folder, "manifest.sha256"), "0".repeat(64));
  await assert.rejects(importPublicSite(folder), /checksum/);
});
test(
  "native scanned import persists captions/year/photos, preserves edits and is idempotent",
  { skip: process.env.WAPALA_TEST_NATIVE_SCANNER !== "1" },
  async () => {
    const first = await importPublicSite(folder, true);
    assert.equal(first.media.add, 1);
    assert.equal(await getDb().media.count(), 1);
    const generation = await getDb().generation.findFirstOrThrow();
    assert.match(generation.photo, /^\/api\/media\//);
    assert.equal(generation.year, null);
    const album = await getDb().contentRecord.findFirstOrThrow();
    const fields = album.fields as {
      keterangan_foto: string[];
      tahun_sumber: string;
      lokasi: string;
    };
    assert.deepEqual(fields.keterangan_foto, ["Keterangan asli"]);
    assert.equal(fields.tahun_sumber, "2025");
    assert.equal(fields.lokasi, "");
    await getDb().generation.update({
      where: { number: 1 },
      data: { name: "Manual", archivedAt: new Date() },
    });
    const second = await importPublicSite(folder, true);
    assert.equal(second.generations.add, 0);
    assert.equal(second.albums.add, 0);
    assert.equal(second.media.add, 0);
    assert.equal((await getDb().generation.findFirstOrThrow()).name, "Manual");
    assert.equal(await getDb().contentRecord.count(), 1);
  },
);

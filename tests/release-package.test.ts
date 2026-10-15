import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const load = () => import(pathToFileURL(join(process.cwd(), "scripts/release-package.mjs")).href);
test("source ZIP carries the Linux build workflow and operator instructions", async () => {
  const api=await load();
  const root=await mkdtemp(join(tmpdir(),"wapala-workflow-test-"));
  try {
    for(const name of [".github/workflows/linux-runtime.yml","docs/linux-runtime-build.md"]){
      await mkdir(join(root,name,".."),{recursive:true});await writeFile(join(root,name),"build instructions");
    }
    assert.deepEqual((await api.collectSource(root)).map((x:{name:string})=>x.name),[".github/workflows/linux-runtime.yml","docs/linux-runtime-build.md"]);
  } finally {await rm(root,{recursive:true,force:true});}
});
test("code release includes VPS service and staging import operations guide, not public data bundles", async () => {
  const api = await load();
  assert.equal(api.allowedEntry("docs/vps-operations.md"), true);
  assert.equal(api.allowedEntry("import-packages/wapala-public-site/manifest.json"), false);
  assert.equal(api.allowedEntry("import-packages/wapala-public-site/assets/photo.png"), false);
});
test("source release selects code and rejects secrets, generated files and organization assets", async () => {
  const api = await load();
  const allowed = ["package.json", "package-lock.json", ".env.example", ".env.production.example", "src/app/page.tsx", "src/server/auth/users.ts", "tests/backend/integration/auth-http.test.ts", "prisma/migrations/001/migration.sql", "scripts/bootstrap-token.ts", "scripts/loan-overdue.ts", "deploy/wapala.service", "deploy/wapala-loans-overdue.service", "deploy/wapala-loans-overdue.timer", "docs/deployment-ubuntu.md", "public/assets/placeholder.svg"];
  for (const path of allowed) assert.equal(api.allowedEntry(path), true, path);
  const blocked = [".env", ".env.local", "src/.env", ".local/backend.env", "Src/secret.csv", "src/generated/prisma/client.ts", "src/output/private.ts", "src/private/member-list.ts", "src/lib/live-albums.ts", "docs/backend-operations-ledger.md", "docs/codegraph-map.md", "public/images/logo.png", "public/books/sar.pdf", "public/assets/logo.svg", "public/assets/album.jpg", "node_modules/next/package.json", ".next/server.js", "output/package.zip", "src/data/import.csv", "../package.json", "src/../../secret.ts", "src\\server.ts", "src/config.pem"];
  for (const path of blocked) assert.equal(api.allowedEntry(path), false, path);
});
test("packaging fails while application imports excluded album fixtures", async () => {
  const api = await load();
  const root = await mkdtemp(join(tmpdir(), "wapala-import-test-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "content.ts"), 'export { liveAlbums } from "./lib/live-albums";');
    await assert.rejects(api.collectSource(root), /excluded source import/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("source tree junction cannot pull private files into package", async () => {
  const api = await load();
  const root = await mkdtemp(join(tmpdir(), "wapala-link-test-"));
  try {
    await mkdir(join(root, "src"));
    await mkdir(join(root, "private"));
    await writeFile(join(root, "private", "secret.ts"), "private data");
    await symlink(join(root, "private"), join(root, "src", "linked"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(api.collectSource(root), /symlink forbidden/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("archive is deterministic, audited, refuses stale overwrite and never follows symlinks", async () => {
  const api = await load();
  const root = await mkdtemp(join(tmpdir(), "wapala-package-test-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "package.json"), "{}");
    await writeFile(join(root, "src", "index.ts"), "export const clean = true;\n");
    await writeFile(join(root, ".env"), "DO_NOT_INCLUDE=secret");
    const one = join(root, "one.zip"), two = join(root, "two.zip");
    const report = await api.createSourceZip(root, one);
    await api.createSourceZip(root, two);
    assert.deepEqual(await readFile(one), await readFile(two));
    assert.deepEqual(report.entries, ["package.json", "src/index.ts"]);
    await assert.rejects(api.createSourceZip(root, one), /exist/i);
    assert.throws(() => api.auditEntries(["package.json", "package.json"]), /duplicate/i);
    assert.throws(() => api.auditEntries(["../secret"]), /forbidden/i);
    assert.throws(() => api.auditZip(Buffer.from("not a zip")), /ZIP/i);
    const corrupted = Buffer.from(await readFile(one));
    corrupted["package.json".length + 30] ^= 1;
    assert.throws(() => api.auditZip(corrupted), /CRC/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

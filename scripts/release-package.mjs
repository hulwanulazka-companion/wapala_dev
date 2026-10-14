import { readdir, lstat, readFile, writeFile, realpath } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const rootFiles = new Set(["package.json", "package-lock.json", "next.config.ts", "next-env.d.ts", "prisma.config.ts", "tsconfig.json", "eslint.config.mjs", ".gitignore", ".env.example", ".env.production.example"]);
const docs = new Set(["docs/deployment-ubuntu.md", "docs/branch-workflow.md", "docs/member-access.md", "docs/vps-operations.md"]);
const neutralAssets = new Set(["public/assets/placeholder.svg", "public/assets/empty-state.svg"]);
const forbiddenSegments = /(^|\/)(?:generated|node_modules|output|imports?|private|credentials?|\.local|\.next[^/]*|\.git|\.codegraph)(\/|$)/i;
export function allowedEntry(name) {
  if (!name || name.includes("\\") || name.startsWith("/") || name.includes(":") || name.split("/").some((x) => x === ".." || x === "." || !x)) return false;
  if (forbiddenSegments.test(name)) return false;
  if (rootFiles.has(name) || docs.has(name) || neutralAssets.has(name)) return true;
  if (name === "public/pdf.worker.min.mjs") return true;
  if (name === "src/lib/live-albums.ts") return false;
  return /^(?:src|tests)\/.+\.(?:ts|tsx|js|mjs|css)$/.test(name)
    || /^prisma\/(?:schema\.prisma|seed\.ts|migrations\/(?:migration_lock\.toml|[a-zA-Z0-9_-]+\/migration\.sql))$/.test(name)
    || /^scripts\/(?:release-[a-zA-Z0-9-]+\.mjs|(?:backend-dev|backend-integration|bootstrap-token|recover-superuser|terminal-password|email-worker|loan-overdue|event-media-cleanup|local-postgres|import-public-site)\.ts)$/.test(name)
    || /^deploy\/[a-zA-Z0-9_.-]+\.(?:service|timer|conf|sh)$/.test(name);
}
export function auditEntries(entries) {
  const seen = new Set();
  for (const name of entries) {
    if (!allowedEntry(name)) throw new Error(`Forbidden release entry: ${name}`);
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate release entry: ${name}`);
    seen.add(key);
  }
}
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export async function collectSource(root) {
  root = await realpath(root);
  const entries = [];
  async function walk(folder, prefix = "") {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const name = prefix + item.name;
      if (item.isSymbolicLink()) throw new Error(`Symlink forbidden: ${name}`);
      if (item.isDirectory()) {
        // Only descend into known code/config roots; never read private trees.
        if ((!prefix && ["src", "tests", "prisma", "scripts", "deploy", "docs", "public"].includes(item.name)) || (prefix && !forbiddenSegments.test(name))) await walk(join(folder, item.name), name + "/");
      } else if (allowedEntry(name)) {
        const path = join(folder, item.name);
        if (!(await lstat(path)).isFile()) throw new Error(`Not a regular file: ${name}`);
        const bytes = await readFile(path);
        if (name.startsWith("src/") && /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)["'][^"']*(?:live-albums|\.local\/|\/Src\/)[^"']*["']/.test(bytes.toString("utf8"))) throw new Error(`Excluded source import in ${name}; remove or replace the runtime dependency before release`);
        entries.push({ name, bytes });
      }
    }
  }
  await walk(root);
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  auditEntries(entries.map((x) => x.name));
  return entries;
}
function encodeZip(entries) {
  const local = [], central = [];
  let offset = 0;
  for (const { name, bytes } of entries) {
    const file = Buffer.from(name), crc = crc32(bytes);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6);
    h.writeUInt16LE(33, 12); // Fixed 1980-01-01, store method: reproducible without platform compressors.
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(bytes.length, 18); h.writeUInt32LE(bytes.length, 22); h.writeUInt16LE(file.length, 26);
    local.push(h, file, bytes);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(33, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(bytes.length, 20); c.writeUInt32LE(bytes.length, 24); c.writeUInt16LE(file.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, file); offset += h.length + file.length + bytes.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  if (entries.length > 65535 || offset + directory.length >= 0xffffffff) throw new Error("ZIP64 unsupported; source package unexpectedly large");
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
export function auditZip(zip) {
  try {
    if (zip.length < 22) throw new Error("Invalid ZIP");
    const end = zip.length - 22;
    if (zip.readUInt32LE(end) !== 0x06054b50 || zip.readUInt16LE(end + 20) !== 0 || zip.readUInt32LE(end + 4) !== 0) throw new Error("Invalid ZIP end");
    const count = zip.readUInt16LE(end + 10), start = zip.readUInt32LE(end + 16), names = [];
    if (zip.readUInt16LE(end + 8) !== count || start + zip.readUInt32LE(end + 12) !== end) throw new Error("Invalid ZIP directory");
    let at = start, nextLocal = 0;
    for (let i = 0; i < count; i++) {
      if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error("Invalid ZIP central entry");
      const length = zip.readUInt16LE(at + 28), extra = zip.readUInt16LE(at + 30), comment = zip.readUInt16LE(at + 32), size = zip.readUInt32LE(at + 24), offset = zip.readUInt32LE(at + 42);
      const nameBytes = zip.subarray(at + 46, at + 46 + length), name = nameBytes.toString("utf8");
      if (zip.readUInt16LE(at + 8) !== 0x800 || zip.readUInt16LE(offset + 6) !== 0x800 || zip.readUInt16LE(at + 34) !== 0 || zip.readUInt32LE(at + 38) !== 0) throw new Error("Invalid ZIP flags or attributes");
      if (offset !== nextLocal || zip.readUInt32LE(offset) !== 0x04034b50 || zip.readUInt16LE(at + 10) !== 0 || zip.readUInt16LE(offset + 8) !== 0 || extra || comment || zip.readUInt16LE(offset + 28) !== 0 || zip.readUInt16LE(offset + 26) !== length || zip.readUInt32LE(at + 20) !== size || zip.readUInt32LE(offset + 18) !== size || zip.readUInt32LE(offset + 22) !== size) throw new Error("Invalid ZIP entry layout");
      if (!zip.subarray(offset + 30, offset + 30 + length).equals(nameBytes)) throw new Error("ZIP name mismatch");
      const dataStart = offset + 30 + length;
      nextLocal = dataStart + size;
      if (nextLocal > start) throw new Error("Invalid ZIP data bounds");
      const crc = crc32(zip.subarray(dataStart, nextLocal));
      if (crc !== zip.readUInt32LE(at + 16) || crc !== zip.readUInt32LE(offset + 14)) throw new Error("ZIP CRC mismatch");
      names.push(name); at += 46 + length;
    }
    if (at !== end || nextLocal !== start) throw new Error("Invalid ZIP unlisted data");
    auditEntries(names);
    return names;
  } catch (error) { if (error instanceof RangeError) throw new Error("Invalid ZIP bounds"); throw error; }
}
export async function createSourceZip(root, destination) {
  const entries = await collectSource(root), zip = encodeZip(entries);
  const names = auditZip(zip);
  await writeFile(resolve(destination), zip, { flag: "wx", mode: 0o600 });
  const persisted = await readFile(resolve(destination));
  auditZip(persisted);
  return { entries: names, bytes: persisted.length, sha256: createHash("sha256").update(persisted).digest("hex") };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, destination] = process.argv.slice(2);
  try {
    if (command === "list") console.log((await collectSource(process.cwd())).map((x) => x.name).join("\n"));
    else if (command === "audit" && destination) console.log(JSON.stringify({ entries: auditZip(await readFile(resolve(destination))) }, null, 2));
    else if (command === "create" && destination) console.log(JSON.stringify(await createSourceZip(process.cwd(), destination), null, 2));
    else throw new Error("Usage: node scripts/release-package.mjs list | create NEW.zip | audit FILE.zip");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

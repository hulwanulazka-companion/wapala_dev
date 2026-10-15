import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareLinuxRuntime } from "../scripts/release-linux.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "wapala-runtime-test-"));
  for (const name of [
    ".next/standalone/.next",
    "public",
    "node_modules",
    "src",
    "prisma",
    "scripts",
    "deploy",
  ])
    await mkdir(join(root, name), { recursive: true });
  for (const [name, body] of Object.entries({
    ".next/BUILD_ID": "build-test",
    ".next/standalone/server.js": "server",
    ".next/static/chunk.js": "chunk",
    "public/logo.png": "logo",
    "package.json": "{}",
    "package-lock.json": "{}",
    "prisma.config.ts": "config",
    "tsconfig.json": "{}",
    "node_modules/native.node": "linux-native",
  })) {
    await mkdir(join(root, name, ".."), { recursive: true });
    await writeFile(join(root, name), body);
  }
  return root;
}
test("Linux runtime includes standalone static/public assets and operator dependencies, excludes local data and env files", async () => {
  const root = await fixture(),
    dest = join(root, "out");
  try {
    await writeFile(join(root, ".next/standalone/.env.production"), "secret");
    await mkdir(join(root, "import-packages"));
    await writeFile(join(root, "import-packages/data.csv"), "private");
    await prepareLinuxRuntime(root, dest, "a".repeat(40));
    assert.equal(
      await readFile(
        join(dest, ".next/standalone/.next/static/chunk.js"),
        "utf8",
      ),
      "chunk",
    );
    assert.equal(
      await readFile(join(dest, ".next/standalone/public/logo.png"), "utf8"),
      "logo",
    );
    assert.equal(
      await readFile(join(dest, "node_modules/native.node"), "utf8"),
      "linux-native",
    );
    await assert.rejects(
      access(join(dest, ".next/standalone/.env.production")),
    );
    await assert.rejects(access(join(dest, "import-packages")));
    assert.equal(
      JSON.parse(await readFile(join(dest, "release.json"), "utf8")).commit,
      "a".repeat(40),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Linux runtime refuses incomplete builds and invalid commit identity", async () => {
  const root = await fixture();
  try {
    await assert.rejects(
      prepareLinuxRuntime(root, join(root, "out"), "main"),
      /commit/i,
    );
    await rm(join(root, ".next/BUILD_ID"));
    await assert.rejects(
      prepareLinuxRuntime(root, join(root, "out"), "b".repeat(40)),
      /build/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Linux runtime rejects a source symlink escaping the checkout", async () => {
  const root = await fixture(),
    outside = await mkdtemp(join(tmpdir(), "wapala-outside-test-"));
  try {
    await symlink(outside, join(root, "public/escape"), "junction");
    await assert.rejects(
      prepareLinuxRuntime(root, join(root, "out"), "c".repeat(40)),
      /symlink/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

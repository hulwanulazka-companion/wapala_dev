import {
  access,
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { resolve, relative, join, basename, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

const excluded = (name) =>
  /^\.env(?:\.|$)/i.test(name) ||
  [".local", ".git", "import-packages", "Src"].includes(name);
const roots = [
  ".next/standalone",
  "node_modules",
  "src",
  "prisma",
  "scripts",
  "deploy",
  "package.json",
  "package-lock.json",
  "prisma.config.ts",
  "tsconfig.json",
];

export async function prepareLinuxRuntime(source, destination, commit) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Invalid release commit");
  const root = await realpath(source),
    out = resolve(destination);
  await access(join(root, ".next/standalone/server.js"));
  const buildId = (await readFile(join(root, ".next/BUILD_ID"), "utf8")).trim();
  if (!buildId) throw new Error("Missing build identity");
  try {
    await access(out);
    throw new Error("Release destination already exists");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const paths = [...roots, ".next/static", "public"];
  // Check all source trees before copying; never follow links outside checkout.
  async function audit(path) {
    if (excluded(basename(path))) return;
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) {
      const target = await realpath(path),
        rel = relative(root, target);
      if (
        rel === ".." ||
        rel.startsWith(".." + (process.platform === "win32" ? "\\" : "/")) ||
        isAbsolute(rel)
      )
        throw new Error("Release symlink escapes checkout");
      return;
    }
    if (stat.isDirectory())
      for (const name of await readdir(path)) await audit(join(path, name));
  }
  for (const path of paths) await audit(join(root, path));
  await mkdir(out, { recursive: true });
  const options = {
    recursive: true,
    verbatimSymlinks: true,
    filter: (path) => !excluded(basename(path)),
  };
  for (const path of roots)
    await cp(join(root, path), join(out, path), options);
  await cp(
    join(root, ".next/static"),
    join(out, ".next/standalone/.next/static"),
    options,
  );
  await cp(join(root, "public"), join(out, ".next/standalone/public"), options);
  await writeFile(
    join(out, "release.json"),
    JSON.stringify(
      { commit, buildId, platform: "linux", arch: "x64", nodeMajor: 24 },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  return { commit, buildId };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const run = async () => {
    if (process.platform !== "linux" || process.arch !== "x64")
      throw new Error("Runtime package must be built on Linux x64");
    console.log(
      JSON.stringify(
        await prepareLinuxRuntime(
          process.cwd(),
          process.argv[2],
          process.env.GITHUB_SHA,
        ),
      ),
    );
  };
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

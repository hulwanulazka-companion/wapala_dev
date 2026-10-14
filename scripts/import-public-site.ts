import { config } from "dotenv";
config({
  path: [".env.local", ".env", ".local/backend.env", ".local/scanner.env"],
  quiet: true,
});
import { resolve } from "node:path";
import { importPublicSite } from "../src/server/domains/public-site-import";
import { getDb } from "../src/server/db";
async function main() {
  const args = process.argv.slice(2),
    bundle = args.find((a) => !a.startsWith("--"));
  if (
    !bundle ||
    args.filter((a) => !a.startsWith("--")).length !== 1 ||
    args.some(
      (a) =>
        a.startsWith("--") && !["--apply", "--allow-production"].includes(a),
    )
  )
    throw Error(
      "Usage: tsx --conditions=react-server scripts/import-public-site.ts BUNDLE_FOLDER [--apply] [--allow-production]",
    );
  if (
    process.env.NODE_ENV === "production" &&
    args.includes("--apply") &&
    !args.includes("--allow-production")
  )
    throw Error("Production import requires --allow-production");
  const report = await importPublicSite(
    resolve(bundle),
    args.includes("--apply"),
  );
  console.log(JSON.stringify(report, null, 2));
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "Import failed");
    process.exitCode = 1;
  })
  .finally(() => getDb().$disconnect());

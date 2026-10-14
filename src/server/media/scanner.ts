import "server-only";
import { spawn } from "node:child_process";
import { DomainError } from "../errors";
import { isAbsolute, normalize } from "node:path";
const unavailableMessage =
  "Pemeriksaan keamanan berkas belum tersedia. Coba kembali setelah pengelola menyiapkannya.";
type Scanner = (path: string) => Promise<number>;
const nativeScanner = (path: string, recursive = false): Promise<number> =>
  new Promise((resolve, reject) => {
    const database = process.env.MEDIA_SCANNER_DATABASE;
    if (database && !isAbsolute(database)) {
      reject(new DomainError("SCANNER_UNAVAILABLE", 503, unavailableMessage));
      return;
    }
    // The scanner is an operator-provided executable outside the standalone
    // bundle. Do not trace its environment-derived path into the application.
    const child = spawn(
      /* turbopackIgnore: true */
      process.env.MEDIA_SCANNER || "clamscan",
      [
        "--no-summary",
        "--infected",
        ...(recursive ? ["--recursive"] : []),
        ...(database ? ["--database", normalize(database)] : []),
        "--",
        path,
      ],
      { stdio: "ignore", shell: false, windowsHide: true },
    );
    const timeout = setTimeout(() => {
      child.kill();
      reject(new DomainError("SCANNER_UNAVAILABLE", 503, unavailableMessage));
    }, recursive ? 180000 : 45000);
    child.once("error", () => {
      clearTimeout(timeout);
      reject(new DomainError("SCANNER_UNAVAILABLE", 503, unavailableMessage));
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code ?? 2);
    });
  });
export async function scanMedia(
  path: string,
  scanner: Scanner = nativeScanner,
) {
  const code = await scanner(path);
  if (code === 1)
    throw new DomainError(
      "MALWARE_DETECTED",
      400,
      "Berkas ditolak oleh pemeriksaan keamanan.",
    );
  if (code !== 0)
    throw new DomainError("SCANNER_UNAVAILABLE", 503, unavailableMessage);
}
export async function scanMediaDirectory(path: string) {
  await scanMedia(path, (target) => nativeScanner(target, true));
}

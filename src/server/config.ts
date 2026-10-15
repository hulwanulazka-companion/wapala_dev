import { DomainError } from "./errors";
export interface ServerConfig {
  appOrigin: string;
  databaseUrl: string;
  securityKey: Buffer;
  production: boolean;
  trustProxy: boolean;
  emailMode: "sink" | "smtp" | "disabled";
  mode: "backend" | "preview";
}
function validateDatabaseParameters(url: URL, allowSchema: boolean) {
  const seen = new Set<string>();
  for (const [key, value] of url.searchParams) {
    if (seen.has(key)) throw new Error();
    seen.add(key);
    if (
      key === "schema" &&
      allowSchema &&
      /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(value)
    )
      continue;
    if (
      key === "sslmode" &&
      ["disable", "require", "verify-ca", "verify-full"].includes(value)
    )
      continue;
    throw new Error();
  }
}
export function parseConfig(
  input: Record<string, string | undefined>,
): ServerConfig {
  try {
    const production = input.NODE_ENV === "production";
    const app = new URL(input.APP_URL || "");
    const db = new URL(input.DATABASE_URL || "");
    validateDatabaseParameters(db, true);
    const encoded = input.SECURITY_KEY || "";
    const securityKey = Buffer.from(encoded, "base64");
    const mode = input.WAPALA_MODE || "backend",
      emailMode = input.EMAIL_MODE || (production ? "smtp" : "sink");
    if (
      !["http:", "https:"].includes(app.protocol) ||
      app.username ||
      app.password ||
      app.pathname !== "/" ||
      app.search ||
      app.hash ||
      (production && app.protocol !== "https:")
    )
      throw new Error();
    if (
      !["postgres:", "postgresql:"].includes(db.protocol) ||
      db.pathname.length < 2 ||
      securityKey.length !== 32 ||
      securityKey.toString("base64") !== encoded
    )
      throw new Error();
    if (
      !["backend", "preview"].includes(mode) ||
      !["sink", "smtp", "disabled"].includes(emailMode) ||
      (production && (mode === "preview" || emailMode === "sink"))
    )
      throw new Error();
    if (input.TRUST_PROXY && !["true", "false"].includes(input.TRUST_PROXY))
      throw new Error();
    return {
      appOrigin: app.origin,
      databaseUrl: db.toString(),
      securityKey,
      production,
      trustProxy: input.TRUST_PROXY === "true",
      emailMode: emailMode as ServerConfig["emailMode"],
      mode: mode as ServerConfig["mode"],
    };
  } catch {
    throw new DomainError(
      "CONFIG_INVALID",
      503,
      "Konfigurasi server belum valid.",
    );
  }
}
export const getConfig = () => parseConfig(process.env);
export function validateTestDatabaseUrl(
  testUrl: string,
  productionUrl?: string,
): URL {
  try {
    const url = new URL(testUrl);
    validateDatabaseParameters(url, false);
    if (
      !["postgresql:", "postgres:"].includes(url.protocol) ||
      !/^\/[a-zA-Z0-9_]+_test$/.test(url.pathname)
    )
      throw new Error();
    if (productionUrl) {
      const production = new URL(productionUrl);
      if (
        url.hostname === production.hostname &&
        (url.port || "5432") === (production.port || "5432") &&
        url.pathname === production.pathname
      )
        throw new Error();
    }
    if (process.env.NODE_ENV === "production") throw new Error();
    return url;
  } catch {
    throw new DomainError(
      "TEST_DATABASE_UNSAFE",
      503,
      "Database test harus terisolasi dan bernama akhiran _test.",
    );
  }
}

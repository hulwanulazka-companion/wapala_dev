import test from "node:test";
import assert from "node:assert/strict";
const config = () => import("../../src/server/config").catch(() => null);
const fixture = {
  APP_URL: "http://127.0.0.1:3000",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/wapala_test",
  SECURITY_KEY: Buffer.alloc(32, 7).toString("base64"),
};
test("production permits explicit disabled email without relaxing HTTPS or allowing sink", async () => {
  const m = await config();
  assert.ok(m);
  assert.equal(
    m.parseConfig({
      ...fixture,
      NODE_ENV: "production",
      APP_URL: "https://wapala.my.id",
      EMAIL_MODE: "disabled",
    }).emailMode,
    "disabled",
  );
  assert.throws(() =>
    m.parseConfig({
      ...fixture,
      NODE_ENV: "production",
      EMAIL_MODE: "disabled",
    }),
  );
});
test("configuration rejects missing environment without echoing secrets", async () => {
  const m = await config();
  assert.ok(m, "configuration service must exist");
  assert.throws(() => m.parseConfig({}), /konfigurasi/i);
  assert.throws(
    () => m.parseConfig({ ...fixture, SECURITY_KEY: "sensitive-invalid-key" }),
    (e: unknown) =>
      e instanceof Error && !e.message.includes("sensitive-invalid-key"),
  );
});
test("production requires HTTPS and cannot run preview/sink modes", async () => {
  const m = await config();
  assert.ok(m);
  assert.throws(() => m.parseConfig({ ...fixture, NODE_ENV: "production" }));
  assert.throws(() =>
    m.parseConfig({
      ...fixture,
      APP_URL: "https://example.org",
      NODE_ENV: "production",
      WAPALA_MODE: "preview",
    }),
  );
  assert.throws(() =>
    m.parseConfig({
      ...fixture,
      APP_URL: "https://example.org",
      NODE_ENV: "production",
      EMAIL_MODE: "sink",
    }),
  );
  assert.equal(
    m.parseConfig({
      ...fixture,
      APP_URL: "https://example.org",
      NODE_ENV: "production",
    }).appOrigin,
    "https://example.org",
  );
});
test("configuration rejects credentials/path/query origins and non-PostgreSQL URLs", async () => {
  const m = await config();
  assert.ok(m);
  for (const APP_URL of [
    "https://u:p@example.org",
    "https://example.org/path",
    "https://example.org?x=1",
    "ftp://example.org",
  ])
    assert.throws(() => m.parseConfig({ ...fixture, APP_URL }));
  assert.throws(() =>
    m.parseConfig({ ...fixture, DATABASE_URL: "file:local.db" }),
  );
  assert.equal(m.parseConfig(fixture).trustProxy, false);
});
test("integration database gate rejects production targets before schema creation", async () => {
  const m = await config();
  assert.ok(m);
  assert.throws(() =>
    m.validateTestDatabaseUrl(fixture.DATABASE_URL, fixture.DATABASE_URL),
  );
  assert.throws(() =>
    m.validateTestDatabaseUrl("postgresql://test@localhost/wapala"),
  );
  assert.throws(() => m.validateTestDatabaseUrl("file:local_test"));
  assert.equal(
    m.validateTestDatabaseUrl(fixture.DATABASE_URL).pathname,
    "/wapala_test",
  );
});
test("database URL options cannot redirect schema cleanup or override the validated host", async () => {
  const m = await config();
  assert.ok(m);
  for (const query of [
    "options=-c%20search_path%3Dpublic",
    "host=other.example.org",
    "database=wapala",
    "schema=public",
    "sslmode=disable&sslmode=require",
  ]) {
    assert.throws(() =>
      m.validateTestDatabaseUrl(fixture.DATABASE_URL + "?" + query),
    );
  }
  assert.throws(() =>
    m.parseConfig({
      ...fixture,
      DATABASE_URL: fixture.DATABASE_URL + "?options=-c%20search_path%3Dpublic",
    }),
  );
  assert.equal(
    m
      .validateTestDatabaseUrl(fixture.DATABASE_URL + "?sslmode=require")
      .searchParams.get("sslmode"),
    "require",
  );
});

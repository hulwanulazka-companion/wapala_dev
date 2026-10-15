import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BackendInventory } from "../src/components/backend/inventory";
import { BackendRecords } from "../src/components/backend/records";
test("reset controls are absent unless server grants superuser capability", () => {
  for (const canReset of [false, true]) {
    const inventory = renderToStaticMarkup(
      createElement(BackendInventory, {
        initialEquipment: [],
        csrfToken: "csrf",
        canReset,
      }),
    );
    const members = renderToStaticMarkup(
      createElement(BackendRecords, {
        kind: "anggota",
        initialRecords: [],
        csrfToken: "csrf",
        canReset,
      }),
    );
    assert.equal(inventory.includes("Reset inventaris"), canReset);
    assert.equal(members.includes("Reset anggota"), canReset);
  }
  const content = renderToStaticMarkup(
    createElement(BackendRecords, {
      kind: "konten",
      initialRecords: [],
      csrfToken: "csrf",
      canReset: true,
    }),
  );
  assert.equal(content.includes("Reset anggota"), false);
});

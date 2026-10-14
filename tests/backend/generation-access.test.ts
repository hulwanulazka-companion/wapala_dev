import test from "node:test";
import assert from "node:assert/strict";
import {
  requirePermission,
  type Principal,
  type Permission,
} from "../../src/server/auth/policy";
const principal = (role: string) =>
  ({
    userId: "test",
    sessionId: "test",
    role,
    mustChangePassword: false,
  }) as Principal;
test("generation editors are Super User, Multimedia and POH only", () => {
  for (const role of ["SUPER_USER", "MULTIMEDIA", "POH"])
    assert.doesNotThrow(() =>
      requirePermission(principal(role), "generations:write" as Permission),
    );
  for (const role of ["ANGGOTA", "INVENTARIS"])
    assert.throws(() =>
      requirePermission(principal(role), "generations:write" as Permission),
    );
});
test("member role can read directory and request own correction, not mutate admin records", () => {
  for (const permission of ["members:directory", "members:correct"])
    assert.doesNotThrow(() =>
      requirePermission(principal("ANGGOTA"), permission as Permission),
    );
  for (const permission of [
    "members:write",
    "members:read",
    "users:write",
    "corrections:review",
    "content:write",
  ])
    assert.throws(() =>
      requirePermission(principal("ANGGOTA"), permission as Permission),
    );
  for (const role of ["SUPER_USER", "MULTIMEDIA", "POH"])
    assert.doesNotThrow(() =>
      requirePermission(principal(role), "corrections:review" as Permission),
    );
});

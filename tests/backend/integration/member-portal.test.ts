import test, { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../../../src/server/db";
import { clean, ctx } from "./helpers";
import {
  bootstrap,
  createBootstrapToken,
} from "../../../src/server/auth/bootstrap";
import { login } from "../../../src/server/auth/login";
import type { Principal } from "../../../src/server/auth/policy";
let su: Principal;
beforeEach(async () => {
  await clean();
  const t = await createBootstrapToken(ctx);
  await bootstrap({ token: t.token, password: "member-portal-test-pass" }, ctx);
  su = (
    await login(
      { email: "superuser@wapala.org", password: "member-portal-test-pass" },
      ctx,
    )
  ).principal;
});
after(() => getDb().$disconnect());
test("Angkatan persists edits, conflicts on stale version and can archive/restore", async () => {
  const m = await import("../../../src/server/domains/generations").catch(
    () => null,
  );
  assert.ok(m);
  const row = await m.saveGeneration(
    su,
    {
      number: 22,
      name: "Uji",
      label: "Angkatan XXII",
      year: null,
      description: "",
      photo: "",
    },
    ctx,
  );
  assert.equal((await m.listGenerations(su))[0].name, "Uji");
  const updated = await m.saveGeneration(
    su,
    { ...row, name: "Nama Baru", archived: true },
    ctx,
  );
  assert.equal(updated.version, 2);
  await assert.rejects(m.saveGeneration(su, { ...row, name: "Stale" }, ctx));
  await m.saveGeneration(su, { ...updated, archived: false }, ctx);
  assert.equal((await m.listGenerations(su))[0].archived, false);
});
test("member correction binds to account, cannot touch others, requires review and respects concurrent edits", async () => {
  const m = await import("../../../src/server/domains/member-portal").catch(
    () => null,
  );
  assert.ok(m);
  const { saveMember } = await import("../../../src/server/domains/records");
  const fields = {
    nama: "Pemilik",
    nia: "01234",
    nim: "",
    prodi: "Teknik",
    angkatan: "2004",
    jenis_kelamin: "Laki-laki",
    kontak: "",
    nomor: "",
    status: "AB",
    foto: "",
  };
  const member = await saveMember(su, { fields }, ctx);
  const other = await saveMember(
    su,
    { fields: { ...fields, nia: "05678", nama: "Orang Lain" } },
    ctx,
  );
  const { createAdmin } = await import("../../../src/server/auth/users");
  const result = await createAdmin(
    su,
    {
      email: "member@example.org",
      name: "Pemilik",
      role: "ANGGOTA",
      memberId: member.id,
    },
    ctx,
  );
  await getDb().user.update({
    where: { id: result.user.id },
    data: { mustChangePassword: false },
  });
  const p = (
    await login(
      { email: result.user.email, password: result.temporaryPassword },
      ctx,
    )
  ).principal;
  const view = await m.memberPortal(p);
  assert.equal(view.profile?.id, member.id);
  assert.ok(view.directory.every((r) => !("kontak" in r) && !("nim" in r)));
  await assert.rejects(
    m.requestCorrection(
      p,
      {
        memberId: other.id,
        version: member.version,
        changes: { nama: "Hacked" },
      },
      ctx,
    ),
  );
  const request = await m.requestCorrection(
    p,
    { version: member.version, changes: { nama: "Diperbaiki" } },
    ctx,
  );
  assert.equal(
    (
      (await getDb().member.findUniqueOrThrow({ where: { id: member.id } }))
        .fields as { nama: string }
    ).nama,
    "Pemilik",
  );
  await assert.rejects(
    m.reviewCorrection(
      p,
      { id: request.id, decision: "approved", note: "" },
      ctx,
    ),
  );
  await m.reviewCorrection(
    su,
    { id: request.id, decision: "approved", note: "Sesuai" },
    ctx,
  );
  const row = await getDb().member.findUniqueOrThrow({
    where: { id: member.id },
  });
  assert.equal((row.fields as { nama: string }).nama, "Diperbaiki");
  await assert.rejects(
    m.reviewCorrection(
      su,
      { id: request.id, decision: "approved", note: "" },
      ctx,
    ),
  );
  const pending = await m.requestCorrection(
    p,
    { version: row.version, changes: { nama: "Usulan lain" } },
    ctx,
  );
  await saveMember(
    su,
    {
      id: member.id,
      version: row.version,
      fields: { ...fields, nama: "Edit Admin" },
    },
    ctx,
  );
  await assert.rejects(
    m.reviewCorrection(
      su,
      { id: pending.id, decision: "approved", note: "" },
      ctx,
    ),
  );
  await m.reviewCorrection(
    su,
    { id: pending.id, decision: "rejected", note: "Data berubah" },
    ctx,
  );
  for (const role of ["MULTIMEDIA", "POH"] as const) {
    const reviewer = await createAdmin(
      su,
      { email: role.toLowerCase() + "@example.org", name: role, role },
      ctx,
    );
    await getDb().user.update({
      where: { id: reviewer.user.id },
      data: { mustChangePassword: false },
    });
    const admin = (
      await login(
        { email: reviewer.user.email, password: reviewer.temporaryPassword },
        ctx,
      )
    ).principal;
    const current = await getDb().member.findUniqueOrThrow({
      where: { id: member.id },
    });
    const correction = await m.requestCorrection(
      p,
      { version: current.version, changes: { nama: "Disetujui " + role } },
      ctx,
    );
    await m.reviewCorrection(
      admin,
      { id: correction.id, decision: "approved", note: "" },
      ctx,
    );
  }
  const { updateAdmin } = await import("../../../src/server/auth/users");
  const current = await getDb().member.findUniqueOrThrow({
    where: { id: member.id },
  });
  await saveMember(
    su,
    {
      id: member.id,
      version: current.version,
      fields: { ...fields, nama: "Arsip" },
      archived: true,
    },
    ctx,
  );
  await updateAdmin(su, result.user.id, { active: false }, ctx);
  await assert.rejects(m.memberPortal(p));
});
test("pending corrections are not hidden behind a completed review history", async () => {
  const m = await import("../../../src/server/domains/member-portal");
  const { saveMember } = await import("../../../src/server/domains/records");
  const fields = {
    nama: "Pemilik",
    nia: "123",
    nim: "",
    prodi: "Teknik",
    angkatan: "2004",
    jenis_kelamin: "Laki-laki",
    kontak: "",
    nomor: "",
    status: "AB",
    foto: "",
  };
  const member = await saveMember(su, { fields }, ctx);
  const pending = await getDb().memberCorrection.create({
    data: {
      memberId: member.id,
      requesterId: su.userId,
      baseVersion: 1,
      proposed: fields,
      createdAt: new Date(0),
    },
  });
  await getDb().memberCorrection.createMany({
    data: Array.from({ length: 501 }, () => ({
      memberId: member.id,
      requesterId: su.userId,
      baseVersion: 1,
      proposed: fields,
      status: "approved",
    })),
  });
  const queue = await m.listCorrections(su);
  assert.ok(queue.some((r) => r.id === pending.id));
});

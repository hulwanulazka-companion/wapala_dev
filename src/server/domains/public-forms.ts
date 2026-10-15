import "server-only";
import { loanItemsForHistory } from "./loan-history-items";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { getDb } from "../db";
import { getConfig } from "../config";
import { DomainError } from "../errors";
import { constantEqual, hmacToken } from "../security/tokens";
import { assertPreAuth, readCookie } from "../http/auth-handler";
import { takeThrottle } from "../security/throttle";
import type { RequestContext } from "../security/request-context";
import { applicantFields, applicantSchema, submitApplicant } from "./recruitment";
import { loanRequestSchema, requestLoan } from "./loans";
import { donationSchema, submitDonation } from "./campaigns";
import { publicUploadOwner } from "../media/public-upload";
import { writeAudit } from "../audit";
import { enqueueEmail } from "../email/outbox";

export const formOwnerCookieName = () => (getConfig().production ? "__Host-" : "") + "wapala.form-owner";
const signed = (purpose: string, value: object) => {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return body + "." + hmacToken(purpose + ":" + body, getConfig().securityKey);
};
function decoded(purpose: string, token: string) {
  if (token.length > 2048) throw new DomainError("CAPABILITY_DENIED", 403);
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra || !constantEqual(signature, hmacToken(purpose + ":" + body, getConfig().securityKey)))
    throw new DomainError("CAPABILITY_DENIED", 403);
  try { return JSON.parse(Buffer.from(body, "base64url").toString("utf8")); }
  catch { throw new DomainError("CAPABILITY_DENIED", 403); }
}
const ownerSchema = z.object({ id: z.uuid(), expires: z.number().int() }).strict();
export function issueFormOwner() { return signed("public-owner", { id: randomUUID(), expires: Date.now() + 30 * 86400000 }); }
export function verifyFormOwner(cookie: string) {
  const value = ownerSchema.parse(decoded("public-owner", cookie));
  if (value.expires <= Date.now()) throw new DomainError("CAPABILITY_DENIED", 403);
  return hmacToken("public-owner-id:" + value.id, getConfig().securityKey);
}
export async function publicFormRequest(request: Request, ctx: RequestContext, action: string) {
  assertPreAuth(request);
  const owner = verifyFormOwner(readCookie(request, formOwnerCookieName()) || "");
  await takeThrottle(`public-forms:${action}:ip:${ctx.ipDigest}`, action === "lookup" ? 15 : 30, 3600000);
  await takeThrottle(`public-forms:${action}:owner:${owner}`, action === "lookup" ? 8 : 15, 3600000);
  return owner;
}
const kindSchema = z.enum(["loan", "recruitment", "donation"]);
export const publicSubmitSchema = z.object({
  kind: kindSchema, idempotencyKey: z.uuid(), consent: z.literal(true),
  payload: z.unknown(),
}).strict();
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => JSON.stringify(key) + ":" + canonical(v)).join(",") + "}";
  return JSON.stringify(value);
}
async function bindUpload(tx: Prisma.TransactionClient, url: string, purpose: "applicant-photo" | "donation-proof", scope: string, owner: string, record: string) {
  if (!url) return;
  const id = /^\/api\/media\/([a-f0-9-]{36})$/.exec(url)?.[1];
  if (!id) throw new DomainError("INVALID_MEDIA", 400);
  await tx.$queryRaw`SELECT id FROM "Media" WHERE id=${id}::uuid FOR UPDATE`;
  const media = await tx.media.findUnique({ where: { id } });
  if (!media || media.purpose !== purpose || media.visibility !== "private" || media.boundTo || !constantEqual(media.ownerDigest || "", publicUploadOwner(purpose, scope, owner)) || media.createdAt.getTime() < Date.now() - 86400000)
    throw new DomainError("INVALID_MEDIA", 400, "Unggah berkas melalui formulir ini.");
  await tx.media.update({ where: { id }, data: { boundTo: record } });
}
export async function submitPublicForm(
  input: unknown,
  owner: string,
  ctx: RequestContext,
  _obsoleteVerifier?: unknown,
) {
  const v = publicSubmitSchema.parse(input);
  // Hash the submitted payload before time-sensitive business validation so an
  // accepted request can still be replayed after its start date or period closes.
  const payloadDigest = hmacToken("public-payload:" + canonical(v.payload), getConfig().securityKey);
  return getDb().$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"public-receipt:" + v.kind + ":" + v.idempotencyKey}))::text`;
    const old = await tx.publicFormReceipt.findUnique({ where: { kind_idempotencyKey: { kind: v.kind, idempotencyKey: v.idempotencyKey } } });
    if (old) {
      if (!constantEqual(old.ownerDigest, owner) || !constantEqual(old.payloadDigest, payloadDigest)) throw new DomainError("IDEMPOTENCY_CONFLICT", 409);
      return old.response;
    }
    const payload = v.kind === "loan" ? loanRequestSchema.parse(v.payload) : v.kind === "recruitment" ? applicantSchema.parse(v.payload) : donationSchema.parse(v.payload);
    const receiptId = randomUUID();
    let response: Prisma.InputJsonObject;
    let email = "";
    if (v.kind === "loan") {
      const value = loanRequestSchema.parse(payload);
      response = await requestLoan(value, ctx, tx);
      email = value.email;
    } else if (v.kind === "recruitment") {
      const value = applicantSchema.parse(payload);
      await bindUpload(tx, value.photo, "applicant-photo", String(value.year), owner, receiptId);
      response = await submitApplicant(value, ctx, tx);
      email = value.fields.email;
    } else {
      const value = donationSchema.parse(payload);
      if (!value.proof) throw new DomainError("PROOF_REQUIRED", 400, "Unggah bukti transfer.");
      await bindUpload(tx, value.proof, "donation-proof", value.campaignId, owner, receiptId);
      const result = await submitDonation(value, ctx, tx);
      response = { accepted: true, id: result.id };
    }
    await tx.publicFormReceipt.create({ data: { id: receiptId, kind: v.kind, idempotencyKey: v.idempotencyKey, ownerDigest: owner, payloadDigest, response } });
    if (email) await enqueueEmail(tx, {
      to: email, subject: "WAPALA — pengajuan diterima",
      text: `Pengajuan Anda diterima. Kode: ${response.code}. Simpan kode ini dan gunakan nomor telepon pengajuan untuk melihat status.`,
    }, new Date(Date.now() + 7 * 86400000));
    return response;
  }, { timeout: 20000 });
}
const capabilitySchema = z.object({ kind: z.enum(["loan", "recruitment"]), id: z.uuid(), owner: z.string().length(43), expires: z.number().int() }).strict();
export function issuePublicCapability(kind: "loan" | "recruitment", id: string, owner: string) {
  return signed("public-capability", { kind, id, owner, expires: Date.now() + 10 * 60000 });
}
export function verifyPublicCapability(token: string, owner: string, kind: "loan" | "recruitment") {
  const value = capabilitySchema.parse(decoded("public-capability", token));
  if (value.kind !== kind || !constantEqual(value.owner, owner) || value.expires <= Date.now()) throw new DomainError("CAPABILITY_DENIED", 403);
  return value;
}
export const publicLookupSchema = z.object({ kind: z.enum(["loan", "recruitment"]), code: z.string().trim().min(1).max(100), phone: z.string().regex(/^\+?[0-9 -]{8,20}$/) }).strict();
export async function lookupPublicForm(
  input: unknown,
  owner: string,
  ctx: RequestContext,
  _obsoleteVerifier?: unknown,
) {
  const v = publicLookupSchema.parse(input);
  await takeThrottle(`public-lookup-code:${v.kind}:${v.code}`, 10, 3600000);
  const row = v.kind === "loan" ? await getDb().$transaction(tx => tx.loan.findUnique({ where: { code: v.code.toUpperCase() }, include: { items: { include: { equipment: { select: { name: true, code: true } } } }, history: { orderBy: { createdAt: "asc" } } } }), { isolationLevel: "RepeatableRead" }) : await getDb().applicant.findUnique({ where: { code: v.code.toUpperCase() } });
  const phoneDigest = hmacToken((v.kind === "loan" ? "loan-phone:" : "applicant-phone:") + v.phone.replace(/[^0-9]/g, ""), getConfig().securityKey);
  if (!row || row.archivedAt || !constantEqual(row.phoneDigest, phoneDigest)) throw new DomainError("NOT_FOUND", 404, "Kode atau nomor telepon tidak sesuai.");
  const record = "items" in row ? {
    code: row.code, status: row.status, institution: row.institution, pic: row.pic,
    start: row.start.toISOString().slice(0,10), end: row.end.toISOString().slice(0,10),
    penalty: Number(row.penalty), penaltyStatus: row.penaltyStatus, notes: row.notes,
    items: loanItemsForHistory(row).map(i => ({ name: i.name, requested: i.requested, approved: i.approved, reason: i.reason })),
    history: row.history.map(h => ({ status: h.status, at: h.createdAt.toISOString(), note: h.note })),
  } : { code: row.code, year: row.year, fields: applicantFields.parse(row.fields), revisions: row.revisions };
  await writeAudit(getDb(), { actorType: "ANONYMOUS", action: "PUBLIC_RECORD_LOOKED_UP", entityId: row.id, context: ctx });
  return { record, capability: issuePublicCapability(v.kind, row.id, owner) };
}
export const publicRevisionSchema = z.object({ capability: z.string().max(2048), revisions: z.number().int().min(0), fields: applicantFields }).strict();
export async function revisePublicApplicant(input: unknown, owner: string, ctx: RequestContext) {
  const v = publicRevisionSchema.parse(input), cap = verifyPublicCapability(v.capability, owner, "recruitment");
  return getDb().$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Applicant" WHERE id=${cap.id}::uuid FOR UPDATE`;
    const row = await tx.applicant.findUnique({ where: { id: cap.id } });
    if (!row || row.archivedAt) throw new DomainError("NOT_FOUND", 404);
    await tx.$queryRaw`SELECT year FROM "RecruitmentPeriod" WHERE year=${row.year} FOR UPDATE`;
    if (!(await tx.recruitmentPeriod.findUnique({ where: { year: row.year } }))?.active) throw new DomainError("PERIOD_CLOSED", 409);
    if (row.revisions !== v.revisions) throw new DomainError("CONFLICT", 409);
    const previous = applicantFields.parse(row.fields);
    // Identity and lookup credentials cannot be replaced using a revision capability.
    if (v.fields.nim !== previous.nim || v.fields.telepon !== previous.telepon || v.fields.email !== previous.email) throw new DomainError("IDENTITY_IMMUTABLE", 400, "NIM, telepon, dan email tidak dapat diubah melalui revisi.");
    await tx.applicantRevision.create({ data: { applicantId: row.id, number: row.revisions, fields: row.fields as Prisma.InputJsonValue, photo: row.photo } });
    const updated = await tx.applicant.update({ where: { id: row.id }, data: { fields: v.fields, revisions: { increment: 1 } } });
    await writeAudit(tx, { actorType: "ANONYMOUS", action: "APPLICANT_REVISED", entityId: row.id, context: ctx });
    return { code: row.code, year: row.year, revisions: updated.revisions };
  });
}
export const publicReturnSchema = z.object({ capability: z.string().max(2048), note: z.string().trim().max(2000) }).strict();
export async function requestPublicReturn(input: unknown, owner: string, ctx: RequestContext) {
  const v = publicReturnSchema.parse(input), cap = verifyPublicCapability(v.capability, owner, "loan");
  return getDb().$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Loan" WHERE id=${cap.id}::uuid FOR UPDATE`;
    const row = await tx.loan.findUnique({ where: { id: cap.id } });
    if (!row || row.archivedAt) throw new DomainError("NOT_FOUND", 404);
    if (row.status === "awaiting_return") return { status: row.status };
    if (row.status !== "borrowed" && row.status !== "late") throw new DomainError("INVALID_TRANSITION", 409);
    await tx.loan.update({ where: { id: row.id }, data: { status: "awaiting_return", history: { create: { status: "awaiting_return", note: v.note || "Pengembalian diajukan peminjam." } } } });
    await writeAudit(tx, { actorType: "ANONYMOUS", action: "PUBLIC_RETURN_REQUESTED", entityId: row.id, context: ctx });
    return { status: "awaiting_return" };
  });
}

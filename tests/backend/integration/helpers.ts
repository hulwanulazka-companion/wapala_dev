import { getDb } from "../../../src/server/db";
export const ctx = {
  ipDigest: "test-pseudonym",
  userAgent: "node-test",
  requestId: "test-request",
};
export async function clean() {
  const db = getDb();
  const schema = new URL(process.env.DATABASE_URL!).searchParams.get("schema");
  if (
    process.env.NODE_ENV !== "test" ||
    !schema ||
    !/^wapala_test_[a-f0-9]{32}$/.test(schema)
  )
    throw new Error("Unsafe test cleanup");
  await db.$executeRawUnsafe(
    'TRUNCATE "MemberCorrection", "Generation", "EventRegistration", "EventFormRevision", "Event", "Media", "Loan", "Equipment", "Member", "ContentRecord", "RecruitmentPeriod", "Campaign", "Session", "PasswordResetToken", "AuditLog", "EmailOutbox", "SecurityThrottle", "User", "BootstrapState", "SiteSettings" CASCADE',
  );
}

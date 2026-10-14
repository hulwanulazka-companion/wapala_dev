ALTER TYPE "Role" ADD VALUE 'ANGGOTA';
ALTER TABLE "Generation" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "User" ADD COLUMN "memberId" UUID;
CREATE UNIQUE INDEX "User_memberId_key" ON "User"("memberId");
ALTER TABLE "User" ADD CONSTRAINT "User_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "MemberCorrection" (
 "id" UUID NOT NULL, "memberId" UUID NOT NULL, "requesterId" UUID NOT NULL,
 "baseVersion" INTEGER NOT NULL, "proposed" JSONB NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'pending', "note" TEXT NOT NULL DEFAULT '',
 "reviewerId" UUID, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "reviewedAt" TIMESTAMP(3), CONSTRAINT "MemberCorrection_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "MemberCorrection_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "MemberCorrection_status_check" CHECK ("status" IN ('pending','approved','rejected'))
);
CREATE INDEX "MemberCorrection_status_createdAt_idx" ON "MemberCorrection"("status", "createdAt");
CREATE UNIQUE INDEX "MemberCorrection_one_pending" ON "MemberCorrection"("memberId") WHERE "status"='pending';

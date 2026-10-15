-- Additive: existing loans retain their live items until an authorized reset.
-- Completed item details are copied here atomically before master deletion.
ALTER TABLE "Loan" ADD COLUMN "archivedItems" JSONB NOT NULL DEFAULT '[]';

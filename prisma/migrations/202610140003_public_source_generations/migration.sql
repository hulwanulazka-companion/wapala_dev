CREATE TABLE "Generation" (
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "year" INTEGER,
    "description" TEXT NOT NULL DEFAULT '',
    "photo" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Generation_pkey" PRIMARY KEY ("number")
);
CREATE UNIQUE INDEX "Generation_sourceKey_key" ON "Generation"("sourceKey");

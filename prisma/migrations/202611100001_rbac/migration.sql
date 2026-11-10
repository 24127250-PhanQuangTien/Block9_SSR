-- Block 9 phase 1: RBAC/ABAC fields.
ALTER TABLE "User" ADD COLUMN "chefId" INTEGER;
ALTER TABLE "dishes" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'published';

-- Existing dishes remain visible in the public menu after the migration.
UPDATE "dishes" SET "status" = 'published' WHERE "status" IS NULL OR "status" = '';

ALTER TABLE "User"
  ADD CONSTRAINT "User_chefId_fkey"
  FOREIGN KEY ("chefId") REFERENCES "chefs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_chefId_idx" ON "User"("chefId");

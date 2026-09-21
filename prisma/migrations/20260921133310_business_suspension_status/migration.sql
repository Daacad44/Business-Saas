-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "status" "BusinessStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedReason" TEXT;

-- CreateIndex
CREATE INDEX "Business_status_idx" ON "Business"("status");


-- Backfill: promote any pre-existing suspension flag stored in BusinessSettings.extra
-- (the JSON blob written by the earlier, non-enforced suspend implementation) into the
-- new first-class Business.status/suspendedAt/suspendedReason columns, so that no
-- currently-suspended business is silently reactivated by this migration.
-- Guarded by "status = 'ACTIVE'" so it is safe to re-run and never overwrites a value
-- already set by the new code path.
UPDATE "Business" b
SET
  "status" = 'SUSPENDED',
  "suspendedAt" = COALESCE((bs."extra"->>'suspendedAt')::timestamp(3), now()),
  "suspendedReason" = bs."extra"->>'suspendedReason'
FROM "BusinessSettings" bs
WHERE bs."businessId" = b."id"
  AND (bs."extra"->>'suspended') = 'true'
  AND b."status" = 'ACTIVE';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'chef_revoked';

-- AlterTable
ALTER TABLE "chefs" ADD COLUMN     "rejected_at" TIMESTAMP(3),
ADD COLUMN     "verified_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "chefs_is_verified_latitude_longitude_idx" ON "chefs"("is_verified", "latitude", "longitude");

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'SUPER_ADMIN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER';

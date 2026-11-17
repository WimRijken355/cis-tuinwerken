-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SUPERUSER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'ADMIN';

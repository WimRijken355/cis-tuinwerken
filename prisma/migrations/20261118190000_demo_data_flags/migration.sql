-- AlterTable
ALTER TABLE "ChecklistItem" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;


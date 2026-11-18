-- DropForeignKey
ALTER TABLE "Todo" DROP CONSTRAINT "Todo_customerId_fkey";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "confirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reservation" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Todo" ALTER COLUMN "customerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "RateUnit" AS ENUM ('HOUR', 'DAY');

-- AlterTable
ALTER TABLE "LaborEntry" ADD COLUMN     "invoicedDays" DECIMAL(4,2),
ADD COLUMN     "rateUnit" "RateUnit" NOT NULL DEFAULT 'HOUR';

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "rateUnit" "RateUnit" NOT NULL DEFAULT 'HOUR';


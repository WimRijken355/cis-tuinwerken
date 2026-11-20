-- CreateEnum
CREATE TYPE "RecurrenceKind" AS ENUM ('PERIODS', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "MonthlyMode" AS ENUM ('DAY_OF_MONTH', 'NTH_WEEKDAY');

-- AlterTable
ALTER TABLE "RecurringTemplate" ADD COLUMN     "endDate" DATE,
ADD COLUMN     "interval" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "maxOccurrences" INTEGER,
ADD COLUMN     "monthDay" INTEGER,
ADD COLUMN     "monthWeek" INTEGER,
ADD COLUMN     "monthWeekday" INTEGER,
ADD COLUMN     "monthlyMode" "MonthlyMode",
ADD COLUMN     "recurrence" "RecurrenceKind" NOT NULL DEFAULT 'PERIODS',
ADD COLUMN     "seasonEndMonth" INTEGER,
ADD COLUMN     "seasonStartMonth" INTEGER,
ADD COLUMN     "startDate" DATE,
ADD COLUMN     "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "Todo" ADD COLUMN     "occurrenceDate" DATE,
ADD COLUMN     "recurringTemplateId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Todo_recurringTemplateId_occurrenceDate_key" ON "Todo"("recurringTemplateId", "occurrenceDate");

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_recurringTemplateId_fkey" FOREIGN KEY ("recurringTemplateId") REFERENCES "RecurringTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Registration per resource with registered vs invoiced hours, multi-day invoices,
-- and "extra done" checklist tasks. Written by hand to keep existing data:
-- the old LaborEntry.hours was the invoiced amount, so it is renamed and also
-- copied into registeredHours.

-- AlterTable: LaborEntry
ALTER TABLE "LaborEntry" RENAME COLUMN "hours" TO "invoicedHours";
ALTER TABLE "LaborEntry" ADD COLUMN "registeredHours" DECIMAL(5,2);
UPDATE "LaborEntry" SET "registeredHours" = "invoicedHours";
ALTER TABLE "LaborEntry" ALTER COLUMN "registeredHours" SET NOT NULL;
ALTER TABLE "LaborEntry" ADD COLUMN "resourceId" INTEGER,
ADD COLUMN "resourceType" "ResourceType";

-- AlterTable: Completion (which invoice charged this registration)
ALTER TABLE "Completion" ADD COLUMN "invoiceId" INTEGER;
UPDATE "Completion" c SET "invoiceId" = i."id" FROM "Invoice" i WHERE i."completionId" = c."id";

-- AlterTable: TodoTask
ALTER TABLE "TodoTask" ADD COLUMN "unplanned" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Completion_invoiceId_idx" ON "Completion"("invoiceId");
CREATE INDEX "LaborEntry_resourceId_idx" ON "LaborEntry"("resourceId");

-- AddForeignKey
ALTER TABLE "Completion" ADD CONSTRAINT "Completion_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LaborEntry" ADD CONSTRAINT "LaborEntry_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

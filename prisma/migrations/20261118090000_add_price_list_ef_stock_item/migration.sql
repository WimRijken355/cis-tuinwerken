-- AlterTable
ALTER TABLE "PriceListItem" ADD COLUMN     "efStockItemId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "PriceListItem_efStockItemId_key" ON "PriceListItem"("efStockItemId");

-- CreateTable
CREATE TABLE "EfQuote" (
    "id" SERIAL NOT NULL,
    "efQuoteId" INTEGER NOT NULL,
    "efClientId" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "reference" TEXT,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "totalExclVat" DECIMAL(10,2) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EfQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EfQuoteLine" (
    "id" SERIAL NOT NULL,
    "quoteId" INTEGER NOT NULL,
    "efItemId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "taxRate" DECIMAL(4,2) NOT NULL,

    CONSTRAINT "EfQuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TodoQuoteLine" (
    "id" SERIAL NOT NULL,
    "todoId" INTEGER NOT NULL,
    "quoteLineId" INTEGER NOT NULL,
    "invoiceId" INTEGER,

    CONSTRAINT "TodoQuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EfQuote_efQuoteId_key" ON "EfQuote"("efQuoteId");

-- CreateIndex
CREATE INDEX "EfQuote_efClientId_idx" ON "EfQuote"("efClientId");

-- CreateIndex
CREATE UNIQUE INDEX "EfQuoteLine_efItemId_key" ON "EfQuoteLine"("efItemId");

-- CreateIndex
CREATE INDEX "EfQuoteLine_quoteId_idx" ON "EfQuoteLine"("quoteId");

-- CreateIndex
CREATE INDEX "TodoQuoteLine_quoteLineId_idx" ON "TodoQuoteLine"("quoteLineId");

-- CreateIndex
CREATE INDEX "TodoQuoteLine_invoiceId_idx" ON "TodoQuoteLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "TodoQuoteLine_todoId_quoteLineId_key" ON "TodoQuoteLine"("todoId", "quoteLineId");

-- AddForeignKey
ALTER TABLE "EfQuoteLine" ADD CONSTRAINT "EfQuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "EfQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoQuoteLine" ADD CONSTRAINT "TodoQuoteLine_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoQuoteLine" ADD CONSTRAINT "TodoQuoteLine_quoteLineId_fkey" FOREIGN KEY ("quoteLineId") REFERENCES "EfQuoteLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoQuoteLine" ADD CONSTRAINT "TodoQuoteLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TodoTask" (
    "id" SERIAL NOT NULL,
    "todoId" INTEGER NOT NULL,
    "checklistItemId" INTEGER,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TodoTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringTemplateTask" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "checklistItemId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecurringTemplateTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringTemplateResource" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "RecurringTemplateResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TodoTask_todoId_idx" ON "TodoTask"("todoId");

-- CreateIndex
CREATE INDEX "TodoTask_checklistItemId_idx" ON "TodoTask"("checklistItemId");

-- CreateIndex
CREATE INDEX "RecurringTemplateTask_checklistItemId_idx" ON "RecurringTemplateTask"("checklistItemId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringTemplateTask_templateId_checklistItemId_key" ON "RecurringTemplateTask"("templateId", "checklistItemId");

-- CreateIndex
CREATE INDEX "RecurringTemplateResource_resourceId_idx" ON "RecurringTemplateResource"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringTemplateResource_templateId_resourceId_key" ON "RecurringTemplateResource"("templateId", "resourceId");

-- AddForeignKey
ALTER TABLE "TodoTask" ADD CONSTRAINT "TodoTask_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoTask" ADD CONSTRAINT "TodoTask_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "ChecklistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplateTask" ADD CONSTRAINT "RecurringTemplateTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RecurringTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplateTask" ADD CONSTRAINT "RecurringTemplateTask_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "ChecklistItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplateResource" ADD CONSTRAINT "RecurringTemplateResource_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RecurringTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplateResource" ADD CONSTRAINT "RecurringTemplateResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


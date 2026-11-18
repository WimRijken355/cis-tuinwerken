-- Rename Worker → Resource (keeps existing rows, ids and audit references).
ALTER TABLE "Worker" RENAME TO "Resource";
ALTER TABLE "Resource" RENAME CONSTRAINT "Worker_pkey" TO "Resource_pkey";
ALTER SEQUENCE "Worker_id_seq" RENAME TO "Resource_id_seq";

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('PERSON', 'MACHINE');

-- AlterTable: existing workers are people.
ALTER TABLE "Resource" ADD COLUMN     "type" "ResourceType" NOT NULL DEFAULT 'PERSON';

-- CreateTable
CREATE TABLE "TodoResource" (
    "id" SERIAL NOT NULL,
    "todoId" INTEGER NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "TodoResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TodoResource_resourceId_idx" ON "TodoResource"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TodoResource_todoId_resourceId_key" ON "TodoResource"("todoId", "resourceId");

-- AddForeignKey
ALTER TABLE "TodoResource" ADD CONSTRAINT "TodoResource_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoResource" ADD CONSTRAINT "TodoResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

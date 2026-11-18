-- AlterTable
ALTER TABLE "Todo" ADD COLUMN     "contactCity" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPostalCode" TEXT,
ADD COLUMN     "contactStreet" TEXT;

-- CreateTable
CREATE TABLE "LooseTodoPreset" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LooseTodoPreset_pkey" PRIMARY KEY ("id")
);


-- Default quick picks (previously hard-coded in the planning dialog).
INSERT INTO "LooseTodoPreset" ("name", "sortOrder") VALUES
  ('Vakantie', 0),
  ('Doktersafspraak', 1),
  ('Opleiding', 2),
  ('Administratie', 3),
  ('Onderhoud machines', 4);

-- Project todos: hours registered, invoiced directly in EenvoudigFactureren.
ALTER TABLE "Todo" ADD COLUMN "isProject" BOOLEAN NOT NULL DEFAULT false;

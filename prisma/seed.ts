import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Seed voor een verse database:
 * - beheerdersaccount uit ADMIN_USERNAME / ADMIN_PASSWORD (alleen als die nog niet bestaat)
 * - standaard prijslijst-items
 * - standaard instellingen
 * - in development: een demoklant
 *
 * Het script is idempotent: nogmaals draaien maakt geen duplicaten.
 */
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  // --- Beheerder -----------------------------------------------------------
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error("ADMIN_USERNAME en ADMIN_PASSWORD moeten in .env staan om te seeden");
  }

  const existingUser = await db.user.findUnique({ where: { username } });
  if (!existingUser) {
    await db.user.create({
      data: { username, passwordHash: await bcrypt.hash(password, 12) },
    });
    console.log(`✔ Beheerder "${username}" aangemaakt (2FA wordt bij eerste login ingesteld)`);
  } else {
    console.log(`– Beheerder "${username}" bestaat al`);
  }

  // --- Prijslijst ----------------------------------------------------------
  const priceListDefaults = [
    { name: "Machinegebruik", unit: "uur", unitPrice: 25, vatRate: 21, sortOrder: 1 },
    { name: "Afvoer groenafval", unit: "m³", unitPrice: 35, vatRate: 21, sortOrder: 2 },
  ];
  for (const item of priceListDefaults) {
    const exists = await db.priceListItem.findFirst({ where: { name: item.name } });
    if (!exists) {
      await db.priceListItem.create({ data: item });
      console.log(`✔ Prijslijst-item "${item.name}" aangemaakt`);
    }
  }

  // --- Instellingen --------------------------------------------------------
  const settingDefaults: Record<string, unknown> = {
    own_hourly_rate: 45,
    labor_vat_rate: 21,
    reminder_send_hour: 18,
    invoice_days_due: 30,
    reminder_email_subject: "Afspraak morgen — Tuinwerken Cis",
    reminder_email_body:
      "Beste {{naam}},\n\nMorgen, {{datum}} om {{uur}}, komen wij bij u langs voor: {{werk}}.\n\n" +
      "Kan de afspraak niet doorgaan? Laat het ons gerust weten.\n\nMet vriendelijke groeten\nTuinwerken Cis",
  };
  for (const [key, value] of Object.entries(settingDefaults)) {
    await db.setting.upsert({
      where: { key },
      update: {}, // bestaande waarden nooit overschrijven
      create: { key, value: value as object },
    });
  }
  console.log("✔ Standaardinstellingen aanwezig");

  // --- Demoklant (alleen buiten productie) ---------------------------------
  if (process.env.NODE_ENV !== "production") {
    const demo = await db.customer.findFirst({ where: { name: "Demo Klant" } });
    if (!demo) {
      await db.customer.create({
        data: {
          name: "Demo Klant",
          email: "demo@example.com",
          street: "Dorpsstraat 1",
          postalCode: "2000",
          city: "Antwerpen",
          notes: "Voorbeeldklant — mag verwijderd worden.",
        },
      });
      console.log("✔ Demoklant aangemaakt");
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

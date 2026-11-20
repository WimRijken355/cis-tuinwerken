# Tuinwerken Cis — Planningsapp

Eén webapplicatie voor het plannen, uitvoeren en factureren van tuinwerken:

- **Todo's per klant** met geschatte uren, ook terugkerend werk (bv. haag scheren 2×/jaar)
- **Weekplanning** op desktop, dagplanning met Waze-navigatie op de telefoon (PWA)
- **Automatische herinneringsmail** naar de klant, 1 dag vóór de afspraak
- **Urenregistratie** na het werk (eigen uren + medewerkers + extra's zoals machines en afvoer)
- **Automatische conceptfactuur** in [EenvoudigFactureren](https://eenvoudigfactureren.be/)

Volledige documentatie staat in [docs/](docs/):
[architectuur](docs/architectuur.md) · [API-referentie](docs/api.md) ·
[integratie EenvoudigFactureren](docs/integratie-eenvoudigfactureren.md) ·
[jobs & mail](docs/jobs-en-mail.md) · [deployment-runbook](docs/deployment.md) ·
[functionele handleiding](docs/handleiding.md).

## Vereisten

- Node.js 22+
- Docker Desktop (voor de lokale PostgreSQL-database)

## Lokaal starten

```powershell
# 1. Dependencies installeren (genereert ook de Prisma-client)
npm install

# 2. Omgevingsvariabelen instellen
Copy-Item .env.example .env
#    → vul minstens SESSION_SECRET (32+ tekens) en ADMIN_PASSWORD in

# 3. Database starten (PostgreSQL in Docker, hostpoort 5433)
npm run db:up

# 4. Schema aanmaken + basisgegevens laden (beheerder, prijslijst, instellingen)
npm run db:migrate
npm run db:seed

# 5. App starten
npm run dev
```

Open <http://localhost:3000> en meld je aan met de gebruikersnaam/het wachtwoord
uit je `.env`. Bij de **eerste login** stel je verplicht tweestapsverificatie in:
scan de QR-code met een authenticator-app (Google/Microsoft Authenticator) en
bewaar de getoonde herstelcodes op een veilige plek.

## Handige commando's

| Commando | Doet |
|---|---|
| `npm run dev` | Dev-server op poort 3000 |
| `npm run build` / `npm start` | Productie-build maken / draaien |
| `npm run db:up` | PostgreSQL- en pgAdmin-container starten |
| `npm run db:migrate` | Schemawijzigingen doorvoeren (Prisma Migrate) |
| `npm run db:seed` | Basisgegevens laden (idempotent) |
| `npm run db:studio` | Prisma Studio: database bekijken in de browser |
| `npm run db:admin` | Enkel pgAdmin (her)starten op http://localhost:5050 (geen login, server "Tuinwerken (dev)" staat klaar; start ook mee met `db:up`) |

## Projectstatus

| Fase | Inhoud | Status |
|---|---|---|
| 0 | Skelet: Next.js, database, login + 2FA, app-shell | ✅ |
| 1 | Klanten & todo's + import uit EenvoudigFactureren | ✅ |
| 2 | Planning (weekkalender, Vandaag + Waze, herschikken) | ✅ |
| 3 | Herinneringsmails | ✅ |
| 4 | Urenregistratie + conceptfacturen | ✅ |
| 5 | Terugkerende todo's | ✅ |
| 6 | PWA + deployment op Hetzner | ✅ gebouwd — uitrol volgens [docs/deployment.md](docs/deployment.md) |

**Nog te doen door de beheerder (eenmalig):**
1. API-key aanmaken in EenvoudigFactureren + in `.env` zetten, en de
   auth-header verifiëren ([docs/integratie-eenvoudigfactureren.md](docs/integratie-eenvoudigfactureren.md))
2. Brevo-account + SMTP-gegevens in `.env` ([docs/jobs-en-mail.md](docs/jobs-en-mail.md))
3. Domein + Hetzner-VM en uitrollen ([docs/deployment.md](docs/deployment.md))

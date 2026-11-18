# CLAUDE.md

Richtlijnen voor Claude (en andere bijdragers) bij het werken aan Tuinwerken Cis.

## Taal- en naamgevingsconventie

- **Folders en bestandsnamen: Engels.** Alle routes, componenten, modules, etc. hebben Engelse namen. De route-folders onder `src/app/(app)/` zijn dit: `invoices`, `customers`, `today` (incl. `today/[id]/register`), `upcoming-days`, `planning`, `audit-log`, en in de route-group `(settings)/` (URL ongewijzigd, gedeelde layout met mobiele tabbladen): `settings` ("Algemeen"), `products` ("Artikels"), `resources` ("Resources": personen + machines, model `Resource`, vroeger `Worker`), `checklist` en `users` ("Gebruikers", ADMIN-only). Nieuwe folders/bestanden volgen dezelfde regel.
- **Navigatie**: alle menu-items staan in `src/components/nav-items.ts` (`MAIN_ITEMS` + `SETTINGS_ITEMS`). Alles wat de app configureert hoort in `SETTINGS_ITEMS` (submenu "Instellingen" in de sidebar; op gsm via "Meer" + tabbladen bovenaan).
- **UI-teksten: Nederlands.** Alle captions, labels, veldnamen, knoppen, foutmeldingen en andere tekst die de gebruiker ziet, zijn in het Nederlands. Code (variabelen, functies, types, comments) blijft Engels.
- Technische documentatie inline in de code moet ook altijd in het Engels

## Versiebeheer

- De app houdt een **versienummer** bij (`package.json` → `version`, semver). `src/lib/version.ts` exporteert dit als `APP_VERSION` (leest rechtstreeks uit `package.json`, dus altijd in sync).
- Zichtbaar in de UI: onderaan de desktop-sidebar (`src/components/app-nav.tsx`) en onderaan de Instellingen-pagina (`src/app/(app)/settings/page.tsx`).
- **Bij elke wijziging die Claude doorvoert, wordt het versienummer in `package.json` opgehoogd** (patch voor bugfixes/kleine aanpassingen, minor voor nieuwe functionaliteit, major voor breaking changes) vóórdat de wijziging als afgerond wordt beschouwd.
- **Commit altijd onmiddellijk**: zodra een wijziging afgerond is (versie opgehoogd, test toegevoegd, `npm test` slaagt), maakt Claude meteen een commit op de huidige branch — zonder eerst toestemming te vragen. Dit is een expliciete keuze van de gebruiker. Pushen gebeurt **niet** automatisch, enkel op vraag.

## Audittrail

- Elke wijziging (create/update/upsert/delete, ook de `*Many`-varianten) op een zakelijke tabel wordt automatisch gelogd in `AuditLog`, via een Prisma Client Extension in `src/lib/db.ts` (bouwstenen in `src/lib/audit.ts`). Er is dus **geen aparte aanroep per route nodig** — dit geldt automatisch voor nieuwe code die via `db` schrijft.
- Gelogd per wijziging: tabel, record-id, actie (CREATE/UPDATE/DELETE), de volledige rij vóór en na de wijziging, de aangemelde gebruiker (`userId`, via `src/lib/audit-context.ts` — gezet door `requireUser()` in `src/lib/api.ts`; `null` = achtergrondjob zonder ingelogde gebruiker) en het tijdstip.
- **Bewust uitgesloten** van de audittrail: `User`, `RecoveryCode`, `TrustedDevice` (zouden wachtwoord-hashes/2FA-geheimen in de audittrail zetten) en `EmailLog`/`AuditLog` zelf (zijn al logtabellen resp. zouden oneindig recursief loggen). Zie `AUDITED_MODELS` in `src/lib/audit.ts` voor de volledige lijst.
- **Bekende beperking**: de AuditLog-insert gebeurt niet gegarandeerd in dezelfde databasetransactie als de echte wijziging (uitgeprobeerd en verworpen: `this` binnen een Prisma `$allOperations`-hook en een `$transaction`-override — geen van beide gaf betrouwbare, tx-gebonden toegang tot andere modellen). Alleen een procescrash exact tussen de echte schrijfactie en de audit-insert zou een audit-rij kunnen missen — aanvaardbaar voor deze app. Zie de uitgebreide toelichting in `src/lib/db.ts`.
- Nieuwe modellen die wijzigbaar zijn via de app horen standaard in `AUDITED_MODELS`, tenzij ze (zoals hierboven) gevoelige/interne data bevatten.
- **UI**: `/audit-log` (menu-item "Audittrail" — enkel desktop-sidebar, bewust niet in de mobiele bottom-tabs, zie `desktopOnly` in `src/components/nav-items.ts`) toont de audittrail als tabel met filters op tabel/actie/gebruiker (incl. "Systeem")/record-id/periode, de gedeelde paginering (`src/components/pagination.tsx`) en een detailweergave met de gewijzigde velden + de volledige rij vóór/na. Filterlogica: `buildAuditLogWhere()`/`changedFields()` in `src/lib/schemas/audit-log.ts`.
- **Valkuil audit-gebruiker**: `requireUser()` moet `beginAuditScope()` synchroon vóór de eerste `await` aanroepen — `AsyncLocalStorage.enterWith()` ná een `await` bereikt de aanroepende route niet (vóór v0.9.0 werd daardoor alles als "Systeem" gelogd). Daarnaast moet de `AsyncLocalStorage` een **procesbrede singleton via `globalThis`** zijn: Next.js laadt de module apart voor `instrumentation.ts` (cron-jobs) en voor de routes, en de op `globalThis` gecachte Prisma-client las anders de verkeerde kopie (tot v0.13.1 stond daardoor nog steeds alles op "Systeem"). Zie `src/lib/audit-context.ts`. Controleer zulk servergedrag altijd met een échte, ingelogde request tegen `npm run dev`, niet enkel met een unittest. API: `GET /api/audit-log` (`src/app/api/audit-log/route.ts`, contract in `src/lib/schemas/audit-log.ts`).
- **Enkel zichtbaar/bereikbaar voor rol ADMIN** (zie Rollen hieronder) — zowel het menu-item als `GET /api/audit-log` zijn ADMIN-only via `requireAdmin()`.

## Rollen & gebruikersbeheer

- Twee rollen (`Role`-enum in `prisma/schema.prisma`, kolom `User.role`): **ADMIN** (mag alles, inclusief gebruikersbeheer en de audittrail) en **SUPERUSER** (mag alles behalve de audittrail bekijken; gebruikersbeheer is bewust ADMIN-only, ook voor superusers — dit was een expliciete keuze van de gebruiker, geen aanname).
- `requireAdmin()` in `src/lib/api.ts` is de guard voor ADMIN-only endpoints (bovenop `requireUser()`, dus altijd eerst ingelogd zijn). Client-side bepaalt `useCurrentUser()` (`src/lib/auth-client.ts`, roept `/api/auth/me` op) of ADMIN-only menu-items/pagina's getoond worden.
- **UI**: `/users` (submenu Instellingen → "Gebruikers", ADMIN-only; op gsm via de instellingen-tabbladen) — lijst van alle gebruikers, nieuwe gebruiker aanmaken (gebruikersnaam/wachtwoord/rol), rol wijzigen, gebruiker verwijderen. Een nieuwe gebruiker doorloopt zelf de 2FA-setup bij de eerste aanmelding (bestaande flow, niets aangepast).
- API: `GET`/`POST /api/users`, `PATCH`/`DELETE /api/users/:id` (contract + DTO-mapper in `src/lib/schemas/users.ts`).
- **Guards tegen lock-out** (pure logica in `src/lib/users-guard.ts` → `wouldRemoveLastAdmin()`, los getest): de laatste ADMIN kan niet gedegradeerd of verwijderd worden, en een gebruiker kan zichzelf niet verwijderen.
- `User` zelf staat bewust **niet** in `AUDITED_MODELS` (zou wachtwoord-hashes/2FA-geheimen loggen) — de routes in `src/app/api/users/` schrijven daarom zelf een geredigeerde `AuditLog`-entry (enkel `username`/`role`, nooit `passwordHash`/`totpSecret`) bij aanmaken/rol-wijziging/verwijderen.

## Schema-valkuil: PATCH zonder defaults

- Zod `.partial()` behoudt `.default(...)`: een PATCH die een veld weglaat, zet het dan stil terug op de default (bv. `active` → true). Gebruik voor PATCH-schemas `partialWithoutDefaults()` uit `src/lib/schemas/partial.ts` of een expliciet schema zonder defaults (zie `recurringTemplateUpdateSchema`).

## Planning

- Pagina `/planning` (FullCalendar v7, weekraster 06:00–24:00). Pure regels in `src/lib/planning.ts` (getest in `planning.test.ts`).
- **Resterende tijd wordt nooit opgeslagen** maar afgeleid: `todo.estimatedHours − som(niet-geannuleerde afspraken)`. Droppen zonder duur → server plant `dropDurationMinutes()` (max. 8 u = `WORKDAY_MINUTES`, nooit over middernacht); de rest blijft in de zijbalk (`GET /api/todos?plannable=1` = todo's met resterende tijd). Inkorten van een blok verhoogt de rest dus vanzelf.
- "x/y" per blok: `partNumbers()` (chronologisch; y = geplande blokken + resterende werkdagen). Elke todo heeft een vaste kleur (`todoColor()`).
- `Appointment.confirmed` / `reservation` sluiten elkaar uit (`applyPlanningFlags()`, ook server-side).
- **Losse todo** = `Todo.customerId = NULL` (vakantie, dokter, …): wel inplannen + resources, nooit registreren/factureren/mailen. Code die `todo.customer` gebruikt moet `null` afhandelen.
- In v7 heten event-kleuren `color`/`className` (geen `backgroundColor`); de blokken worden volledig getekend door `PlanningEventContent` (`src/components/planning/`).

## Demodata

- Aan/uit via **Instellingen → Algemeen → Demodata** (ADMIN-only, `/api/demo-data`) of `npm run demo:on` / `demo:off` / `demo:status`. Dataset: `src/lib/demo/dataset.ts` (pure data, getest), laden/verwijderen: `src/lib/demo/demo-data.ts`.
- Demoklanten hebben `Customer.isDemo = true`; demo-machines en -checklist-taken `isDemo = true`. Personen (Cis/Wim/Ken) zijn échte resources: hergebruikt, nooit verwijderd. Uitzetten verwijdert de demoklanten met álles eraan (todo's, afspraken, registraties, facturen, terugkerend werk).
- **Veiligheid**: demoklanten gaan nooit naar EenvoudigFactureren (`initialSyncAction`/`canSendToEf` + guard in `pushInvoiceToEf` en `/api/customers/:id/push-ef`), krijgen nooit herinneringsmails, en doen niet mee aan de EF-klantenimport (naam-matching). Nieuwe code die naar EF stuurt of mailt, moet `isDemo` ook respecteren.

## Testen

- Testrunner: **Vitest** (`vitest.config.mts`). Testbestanden staan naast de code als `*.test.ts` (bv. `src/lib/time.test.ts`).
- Run alle tests met `npm test` (eenmalig, voor CI/commit-checks) of `npm run test:watch` tijdens het ontwikkelen.
- **Bij elke gevraagde wijziging moet minstens 1 test toegevoegd of aangepast worden** die de wijziging dekt, vóórdat de wijziging als afgerond wordt beschouwd.
- **`npm test` moet slagen** vóór een wijziging als afgerond wordt beschouwd — dit is de controle dat de applicatie nog werkt.
- Focus op pure/losstaande logica (geen database of netwerk nodig): `src/lib/time.ts`, `src/lib/schemas/*`, `src/lib/services/invoice-builder.ts`, `src/lib/auth/*`, `src/lib/audit.ts`. Voor code die wél de database/EF/mail nodig heeft: mock die afhankelijkheid, zet geen tests op tegen de echte dev-database.
  - **Uitzondering**: `src/lib/db.audit.integration.test.ts` test de audittrail-extension (zie hierboven) wél tegen een échte Postgres — dat gedrag (Prisma-transacties) is niet zinvol te mocken. Vereist `npm run db:up` + een `.env`; is de database onbereikbaar (bv. in CI), dan slaat de test zichzelf over (`describe.skipIf`) i.p.v. te falen.

## Overig

Zie ook de technische afspraken/valkuilen die in projectgeheugen zijn vastgelegd (Prisma 7-config, TS 5.9-pin, FullCalendar v7-imports, dev-poort 5433, `.next`-conflict tussen dev/build, 2FA-reset-SQL).

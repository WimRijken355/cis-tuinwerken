# CLAUDE.md

Richtlijnen voor Claude (en andere bijdragers) bij het werken aan Tuinwerken Cis.

## Taal- en naamgevingsconventie

- **Folders en bestandsnamen: Engels.** Nieuwe routes, componenten, modules, etc. krijgen Engelse namen (bv. `invoices`, `customers`, `settings`, `today`, `upcoming-days`, `planning`).
  - Uitzondering/bekende technische schuld: een deel van de bestaande route-folders onder `src/app/(app)/` staat nog in het Nederlands (`facturen`, `klanten`, `instellingen`, `komende-dagen`, `vandaag`). Dit bepaalt de URL-structuur van de app; migreer dit alleen bewust (met redirects) en niet terloops bij een ongerelateerde wijziging.
- **UI-teksten: Nederlands.** Alle captions, labels, veldnamen, knoppen, foutmeldingen en andere tekst die de gebruiker ziet, zijn in het Nederlands. Code (variabelen, functies, types, comments) blijft Engels.

## Versiebeheer

- De app houdt een **versienummer** bij (`package.json` → `version`, semver) en toont dit zichtbaar in de UI (bv. in de footer of instellingenpagina).
- **Bij elke wijziging die Claude doorvoert, wordt het versienummer opgehoogd** (patch voor bugfixes/kleine aanpassingen, minor voor nieuwe functionaliteit, major voor breaking changes) vóórdat de wijziging als afgerond wordt beschouwd.
- Het getoonde versienummer in de UI moet overeenkomen met `package.json`.

## Overig

Zie ook de technische afspraken/valkuilen die in projectgeheugen zijn vastgelegd (Prisma 7-config, TS 5.9-pin, FullCalendar v7-imports, dev-poort 5433, `.next`-conflict tussen dev/build, 2FA-reset-SQL).

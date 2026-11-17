# CLAUDE.md

Richtlijnen voor Claude (en andere bijdragers) bij het werken aan Tuinwerken Cis.

## Taal- en naamgevingsconventie

- **Folders en bestandsnamen: Engels.** Alle routes, componenten, modules, etc. hebben Engelse namen. De route-folders onder `src/app/(app)/` zijn dit: `invoices`, `customers`, `settings`, `today` (incl. `today/[id]/register`), `upcoming-days`, `planning`. Nieuwe folders/bestanden volgen dezelfde regel.
- **UI-teksten: Nederlands.** Alle captions, labels, veldnamen, knoppen, foutmeldingen en andere tekst die de gebruiker ziet, zijn in het Nederlands. Code (variabelen, functies, types, comments) blijft Engels.

## Versiebeheer

- De app houdt een **versienummer** bij (`package.json` → `version`, semver). `src/lib/version.ts` exporteert dit als `APP_VERSION` (leest rechtstreeks uit `package.json`, dus altijd in sync).
- Zichtbaar in de UI: onderaan de desktop-sidebar (`src/components/app-nav.tsx`) en onderaan de Instellingen-pagina (`src/app/(app)/settings/page.tsx`).
- **Bij elke wijziging die Claude doorvoert, wordt het versienummer in `package.json` opgehoogd** (patch voor bugfixes/kleine aanpassingen, minor voor nieuwe functionaliteit, major voor breaking changes) vóórdat de wijziging als afgerond wordt beschouwd.

## Overig

Zie ook de technische afspraken/valkuilen die in projectgeheugen zijn vastgelegd (Prisma 7-config, TS 5.9-pin, FullCalendar v7-imports, dev-poort 5433, `.next`-conflict tussen dev/build, 2FA-reset-SQL).

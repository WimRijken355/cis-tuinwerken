# API-referentie

Alle endpoints geven JSON terug. Fouten hebben altijd de vorm
`{ "error": "boodschap" }` met een passende HTTP-status
(400 validatie · 401 niet aangemeld · 404 niet gevonden · 409 conflict ·
429 te veel pogingen · 502 fout bij EenvoudigFactureren · 500 onverwacht).

Alle endpoints behalve `/api/auth/login`, `/api/auth/totp/*` en `/api/health`
vereisen een geldige sessiecookie (`tc_session`). Zonder sessie: 401.

## Auth

### POST /api/auth/login
```json
{ "username": "wim", "password": "•••" }
```
Respons, afhankelijk van de situatie:
- `{ "ok": true }` — volledig aangemeld (vertrouwd toestel)
- `{ "ok": false, "needsTotp": true }` — TOTP-code vereist (→ verify)
- `{ "ok": false, "needsTotpSetup": true }` — eerste keer: 2FA instellen (→ setup)
- 401 bij foute login, 429 na 10 foute pogingen binnen 15 min (per IP)

### POST /api/auth/totp/setup
Start de 2FA-setup (vereist een pending of volledige sessie).
→ `{ "otpauthUrl": "otpauth://…", "qrDataUrl": "data:image/png;base64,…" }`

### POST /api/auth/totp/confirm
```json
{ "code": "123456" }
```
Bevestigt de setup. → `{ "ok": true, "recoveryCodes": ["AB12-CD34", …] }`
De herstelcodes worden **één keer** teruggegeven. Een nieuwe setup maakt alle
oude herstelcodes en vertrouwde toestellen ongeldig.

### POST /api/auth/totp/verify
```json
{ "code": "123456", "trustDevice": true, "deviceLabel": "iPhone" }
```
`code` mag ook een herstelcode zijn (eenmalig bruikbaar). Bij `trustDevice`
wordt een `tc_trusted_device`-cookie (30 dagen) gezet. → `{ "ok": true }`

### POST /api/auth/logout · GET /api/auth/me
Afmelden (vertrouwd toestel blijft) · huidige gebruiker opvragen.

### GET /api/auth/trusted-devices · DELETE /api/auth/trusted-devices
Actieve vertrouwde toestellen bekijken · ze allemaal intrekken (daarna is
overal opnieuw een TOTP-code nodig bij het aanmelden).

## Klanten

### GET /api/customers?page=&pageSize=&name=&address=&postalCode=&city=&includeInactive=1
Gepagineerde lijst, gesorteerd op naam. Antwoord `{ items, total, page, pageSize }`
(standaard `page=1`, `pageSize=25`, max 100). Filters (allemaal optioneel, AND,
hoofdletterongevoelig): `name`, `address` (straat) en `city` bevatten de tekst,
`postalCode` begint ermee. Elke klant bevat `openTodoCount` (open + ingeplande todo's).

### POST /api/customers
```json
{ "name": "Jan Peeters", "email": "jan@example.com", "street": "Kerkstraat 10",
  "postalCode": "9000", "city": "Gent", "vatNumber": "", "notes": "" }
```
Alleen `name` is verplicht. → 201 met de klant.

### GET /api/customers/:id
Detail inclusief `todos[]` (met `windowLabel` voor terugkerend werk) en
`recurringTemplates[]`.

### PATCH /api/customers/:id
Gedeeltelijke update; zelfde velden als POST, alles optioneel.

### DELETE /api/customers/:id
- Klant **met** historiek (todo's/facturen/terugkerend werk) → gearchiveerd:
  `{ "archived": true }`
- Klant **zonder** historiek → echt verwijderd: `{ "deleted": true }`

### POST /api/customers/import-ef
Importeert alle klanten uit EenvoudigFactureren (idempotent; zie
[integratie-eenvoudigfactureren.md](integratie-eenvoudigfactureren.md)).
→ `{ "totalInEf": 42, "created": 30, "linked": 10, "skipped": 2 }`

### POST /api/customers/:id/push-ef
Maakt of synchroniseert deze klant in EenvoudigFactureren.
→ `{ "efClientId": 123, "created": true }` of `{ …, "updated": true }`

## Todo's

### GET /api/todos?customerId=&status=&plannable=1
- `plannable=1`: alleen `OPEN`, gesorteerd op voorkeursvenster (voor de planning).
- Elke todo bevat `customerName` en `windowLabel`.

### POST /api/todos
```json
{ "customerId": 7, "title": "Haag scheren", "estimatedHours": 3.5, "description": "",
  "resources": [{ "resourceId": 2, "hours": 3.5 }, { "resourceId": 5, "hours": 1 }],
  "taskIds": [4, 1] }
```
`estimatedHours` is de totale tijd; `resources` (optioneel) zijn de in te plannen
personen/machines met elk hun eigen uren. De som hoeft niet gelijk te zijn aan het
totaal. Elke resource max. één keer per todo. `taskIds` (optioneel) zijn de
checklist-taken (ids uit `/api/checklist-items`), in volgorde. Todo-antwoorden
bevatten `resources: [{ resourceId, name, type, hours }]` en
`tasks: [{ id, checklistItemId, label, done }]` (`label` = momentopname van de
taaknaam).

### GET /api/todos/:id — detail incl. afspraken
### PATCH /api/todos/:id — `title`, `description`, `estimatedHours`, `resources`, `taskIds`, `status`
`resources` / `taskIds` vervangen (indien meegegeven) de volledige set; `[]` = geen.
Taken die blijven, behouden hun afgevinkte status.
### PATCH /api/todos/:id/tasks/:taskId — `{ "done": true }`
Vinkt een checklist-taak af (of terug aan).
`status: "DONE"` zet `completedAt`; `"OPEN"` wist het weer.
### DELETE /api/todos/:id
409 zodra er afspraken aan hangen — dan annuleren i.p.v. verwijderen.

## Planning (afspraken)

### GET /api/appointments?from=ISO&to=ISO
Afspraken (niet-geannuleerd) binnen het bereik — gebruikt door de weekkalender
en "Komende dagen". Elke afspraak is verrijkt met `todoTitle`, `customerName`,
`address` (voor Waze) en `customerEmail`.

### GET /api/appointments/today
De afspraken van vandaag (Brusselse kalenderdag), gesorteerd op startuur.

### POST /api/appointments
```json
{ "todoId": 12, "startAt": "2026-11-18T08:00:00.000Z", "durationMinutes": 120, "note": "" }
```
Zet de todo automatisch op `PLANNED`. 409 als de todo al afgerond/geannuleerd is.

### PATCH /api/appointments/:id
Velden: `startAt`, `durationMinutes`, `note`, `status` (`PLANNED`/`CANCELLED`).
**Herinneringsregel:** verschuift de afspraak naar een andere Brusselse dag,
dan wordt `reminderSentAt` gereset → de klant krijgt een nieuwe herinnering.
409 op afgeronde afspraken.

### DELETE /api/appointments/:id
Haalt de afspraak uit de planning. De todo springt terug naar `OPEN` als er
geen andere geplande afspraken meer zijn.

### POST /api/appointments/:id/send-reminder
Verstuurt de herinnering handmatig (ook vóór het automatische uur, of als
retry). 400 als de klant geen e-mailadres heeft, 409 als de afspraak niet
`PLANNED` is, 502 als het versturen faalt.

## Registratie & facturen

### POST /api/appointments/:id/complete
Werk afronden (mobiele flow). Lokaal wordt alles in één transactie bewaard;
daarna volgt de (niet-blokkerende) push naar EenvoudigFactureren als concept.
```json
{
  "ownHours": 3,
  "workers": [{ "name": "Jef", "hours": 2, "hourlyRate": 20 }],
  "extras": [{ "priceListItemId": 2, "description": "Afvoer groenafval",
               "quantity": 2, "unit": "m³", "unitPrice": 35, "vatRate": 21 }],
  "note": ""
}
```
→ 201:
```json
{ "completed": true, "invoiceId": 1, "totalExclVat": 245,
  "efPush": { "ok": false, "error": "…" } }
```
409 als de afspraak al geregistreerd of niet `PLANNED` is.
Tarieven (eigen uurtarief, btw op arbeid) komen uit Instellingen en worden als
snapshot bewaard.

### GET /api/invoices?status=
Overzicht (nieuwste eerst, max 200) met `pushStatus`
(`PENDING`/`CONCEPT_CREATED`/`FAILED`), `totalExclVat`, `workTitle`, `workDate`.

### POST /api/invoices/:id/retry-push
Mislukte EF-push opnieuw proberen. 409 zodra er al een `efInvoiceId` is
(nooit dubbele concepten), 502 als het opnieuw faalt.

## Catalogus

### GET/POST /api/resources · PATCH/DELETE /api/resources/:id
Resources `{ name, type (PERSON|MACHINE), hourlyRate, active }` — beheerd via de
pagina **Resources** (`/resources`). Zonder `page`: platte array van actieve
resources (`?type=PERSON` = picklist van de registratieflow,
`?includeInactive=1` ook inactieve). Mét `page`: gepagineerd
`{ items, total, page, pageSize }` met filters `name`, `type` en `status`.
Verwijderen geeft 409 zolang een todo of terugkerend werk de resource nog
gebruikt. Verder veilig: geregistreerde uren zijn snapshots.

### GET/POST /api/checklist-items · PATCH/DELETE /api/checklist-items/:id
Checklist-taken `{ name, active, sortOrder }`, beheerd in **Instellingen →
Checklist**. `GET` geeft ze in volgorde, enkel actieve tenzij
`?includeInactive=1`. `POST` zet een nieuwe taak achteraan. Hernoemen wijzigt
bestaande todo's niet (die bewaren hun eigen label). Verwijderen geeft 409
zolang een todo of terugkerend werk de taak gebruikt — dan deactiveren.

### POST /api/checklist-items/:id/move — `{ "direction": -1 | 1 }`
Schuift een taak één plaats omhoog/omlaag.

### GET/POST /api/price-list · PATCH/DELETE /api/price-list/:id
Prijslijst `{ name, unit (≤10 tekens), unitPrice, vatRate (0/6/12/21), active,
sortOrder, efStockItemId }`. Zonder `page`: platte array van actieve items
(picklist in de registratieflow); `?includeInactive=1` toont ook gedeactiveerde.
Mét `page`: gepagineerd `{ items, total, page, pageSize }` met filters `name`
(bevat), `vatRate` (0/6/12/21), `status` (`active`|`inactive`|`all`) en
`source` (`ef`|`manual`|`all`).
Beheerd via de pagina **Artikels** (`/products`).

### POST /api/price-list/import-ef
Haalt alle artikels (`GET /stockitems`) uit EenvoudigFactureren op en zet ze in
de prijslijst. Al gekoppeld → overslaan; zelfde naam → enkel koppelen (lokale
data blijft leidend); anders aanmaken. Prijzen incl. btw worden omgerekend naar
excl. btw, eenheden afgekapt op 10 tekens (leeg → "stuk"). Btw-mapping
`tax_category` (niet gedocumenteerd door EF, geverifieerd tegen echte
factuurlijnen): 1 → 21%, 3 → 6%, 0 → geen vast tarief → 21% (0% enkel bij een
vrijstellingscode), 2 → 12% (aanname). Let op: EF geeft `tax_included` terug als
"yes"/"no", niet als boolean. Antwoord:
`{ totalInEf, created, linked, skipped }`.

## Instellingen & jobs

### GET /api/settings
Alle zakelijke instellingen + configuratiestatus:
```json
{ "ownHourlyRate": 45, "laborVatRate": 21, "reminderSendHour": 18,
  "invoiceDaysDue": 30, "reminderEmailSubject": "…", "reminderEmailBody": "…",
  "mailConfigured": false, "efConfigured": false }
```

### PUT /api/settings
Werkt een of meer instellingen bij (zelfde velden, alles optioneel).
`laborVatRate` accepteert alleen 6 of 21; `reminderSendHour` 16–21.

### POST /api/jobs/reminders
Draait de reminder-job onmiddellijk (beheer/test). Respons:
`{ "candidates": 2, "sent": 1, "failed": 0, "skippedNoEmail": 1 }`

## Terugkerend werk

### GET /api/recurring-templates?customerId=
Sjablonen met hun periodes (`windows[]`, elk met `label`, `startMonth/Day`,
`endMonth/Day`; `endMonth < startMonth` = over de jaargrens).

### POST /api/recurring-templates
```json
{ "customerId": 7, "title": "Haag scheren", "estimatedHours": 4,
  "leadTimeDays": 30,
  "windows": [
    { "label": "Mei", "startMonth": 5, "startDay": 1, "endMonth": 5, "endDay": 31 },
    { "label": "Sep–Okt", "startMonth": 9, "startDay": 1, "endMonth": 10, "endDay": 31 }
  ],
  "resources": [{ "resourceId": 2, "hours": 4 }],
  "taskIds": [4, 1] }
```
`resources` en `taskIds` (optioneel) worden bij elke gegenereerde todo
meegekopieerd; antwoorden bevatten `resources[]` en `tasks: [{ checklistItemId, name }]`.

### PATCH /api/recurring-templates/:id
Zelfde velden, allemaal optioneel (weggelaten = ongewijzigd). Windows worden
gereconcilieerd: met `id` = bijwerken, zonder `id` = nieuw, weggelaten =
verwijderd. Zo ontstaan er nooit dubbele beurten voor al bestaande periodes.
`resources` / `taskIds` vervangen de set; dat geldt voor todo's die vanaf dan
gegenereerd worden — bestaande todo's houden hun eigen set.

### DELETE /api/recurring-templates/:id
Al gegenereerde todo's blijven staan; er komen geen nieuwe beurten meer bij.

### POST /api/jobs/recurring
Draait de generatie onmiddellijk (idempotent).
→ `{ "windowsChecked": 4, "todosCreated": 1 }`

## Overig

### GET /api/health
`{ "status": "ok", "database": "ok" }` of 503 als de database onbereikbaar is.

---

*Endpoints voor planning (afspraken), registratie/facturen, prijslijst,
medewerkers en instellingen volgen in Fase 2–5 en worden hier aangevuld.*

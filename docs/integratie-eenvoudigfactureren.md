# Integratie met EenvoudigFactureren

De app praat rechtstreeks met de [EenvoudigFactureren REST API](https://eenvoudigfactureren.be/api-docs/index.html)
(`https://eenvoudigfactureren.be/api/v1`). Twee koppelpunten:

1. **Klanten** — eenmalige import + synchronisatie (app is daarna leidend)
2. **Facturen** — na elke werkregistratie wordt automatisch een **conceptfactuur**
   aangemaakt (Fase 4); jij controleert en finaliseert ze in EenvoudigFactureren zelf

## API-key instellen

1. Meld je aan op EenvoudigFactureren en genereer API-credentials
   (instellingen → API / koppelingen).
2. Zet ze in `.env`:

```ini
EF_AUTH_MODE="apikey"          # of "basic"
EF_API_KEY="…"                 # bij apikey
EF_API_KEY_HEADER="X-API-Key"  # headernaam; zie "Eerste test" hieronder
EF_BASIC_USER="…"              # bij basic
EF_BASIC_PASS="…"
EF_ACCOUNT_ID=""               # alleen bij meerdere EF-accounts
```

3. Herstart de app (env-wijzigingen worden alleen bij het opstarten gelezen).

### Eerste test (de "auth-spike")

De exacte headernaam voor API-key-auth staat niet in het leesbare deel van de
EF-docs. Test hem zo:

```powershell
curl.exe -s -H "Accept: application/json" -H "X-API-Key: JOUW_KEY" `
  "https://eenvoudigfactureren.be/api/v1/clients?take=1"
```

- JSON-lijst terug → headernaam klopt.
- 401 → probeer `Authorization: Bearer JOUW_KEY`, of zet `EF_AUTH_MODE="basic"`
  met je API-gebruiker/wachtwoord. Pas daarna `EF_API_KEY_HEADER` of de
  basic-variabelen aan — de code hoeft niet te wijzigen.

## Gedrag van de klantenimport (`POST /api/customers/import-ef`)

Voor elke klant in EenvoudigFactureren:

| Situatie | Actie |
|---|---|
| EF-id is al gekoppeld aan een lokale klant | overslaan |
| Zelfde btw-nummer of zelfde naam (hoofdletterongevoelig) bij een nog niet gekoppelde lokale klant | koppelen; alleen **lege** lokale velden worden aangevuld |
| Geen match | nieuwe lokale klant aanmaken met de EF-gegevens |

De import is idempotent en kan dus veilig opnieuw gedraaid worden.

## Synchronisatie daarna (app = master)

- Nieuwe/gewijzigde klanten stuur je door met de knop **"→ Naar EF" / "↻ Sync EF"**
  op de klantfiche (`POST /api/customers/:id/push-ef`). Vóór een factuurpush
  gebeurt dit automatisch voor klanten zonder koppeling.
- Updates gaan altijd via **POST** `/clients/{id}` (partial update). Nooit PUT:
  dat reset velden die je niet meestuurt.
- Bij het aanmaken zetten we `external_client_id` op ons eigen klant-id, zodat de
  koppeling ook vanuit EF zichtbaar is.

## Technische afspraken (zie `src/lib/ef/client.ts`)

- Altijd `Accept: application/json` — anders antwoordt de API in **XML**.
- Fouten worden als `EfApiError` gegooid (status + eerste 2000 tekens van het
  antwoord) en komen als 502 met duidelijke boodschap in de UI.
- Paginatie met `skip`/`take` (100 per pagina) bij het ophalen van klanten.
- Geen agressieve polling: de app roept EF alleen aan bij een expliciete actie
  (import, sync, factuurpush).

## Facturen (automatische conceptfacturen)

Na elke werkregistratie (zie `src/lib/services/invoices.ts` en
`invoice-builder.ts`):

1. De regels worden gebouwd: eigen uren → "Tuinwerken – \<titel\> (\<datum\>)",
   per medewerker → "Medewerker \<naam\> – uren", per extra een regel met de
   prijslijst-snapshot. Elke regel draagt zijn eigen `tax_rate`.
2. De factuur wordt **eerst lokaal** bewaard (tabel `Invoice`, met de exacte
   `items`-payload als `linesJson`-audittrail en het totaal excl. btw).
3. Daarna de push: ontbreekt de EF-koppeling van de klant, dan wordt die eerst
   aangemaakt; vervolgens `POST /invoices` met `status: "concept"`,
   `language: "nl"`, `tax_included: "no"` en `days_due` uit Instellingen.
4. Slaagt de push → status `CONCEPT_CREATED` + `efInvoiceId`. Faalt hij →
   `FAILED` + foutboodschap, zichtbaar op de Facturen-pagina met een
   retry-knop. **De registratie zelf is dan al veilig bewaard** — een
   EF-storing blokkeert de mobiele flow nooit.
5. Retry kan alleen zolang er geen `efInvoiceId` is → nooit dubbele concepten.

Afgedwongen EF-limieten: `quantity` max 2 decimalen, `unit` max 10 tekens,
btw-tarieven beperkt tot 0/6/12/21, geldrekenwerk in centen.

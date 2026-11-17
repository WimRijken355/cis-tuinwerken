# Achtergrondjobs & e-mail

## Overzicht van de jobs

De jobs draaien **in het appproces** (croner, gestart via `src/instrumentation.ts`
→ `src/lib/jobs.ts`). Dat is bewust: de app draait op precies één instance.
Schaal de app-container dus nooit naar meer dan 1 replica.

| Job | Schema (Europe/Brussels) | Doet |
|---|---|---|
| Herinneringen | elk uur 16:00–21:00 + inhaalrun bij het opstarten | mails voor de afspraken van **morgen** |
| Terugkerende todo's | dagelijks 02:00 + bij het opstarten | genereert todo's uit terugkerend werk |

Alle patronen krijgen expliciet `timezone: "Europe/Brussels"` — ook bij
zomer-/wintertijd vertrekken de mails dus op het juiste lokale uur.

## Hoe de herinneringen werken

1. Elk uur (16–21u) checkt de job of het ingestelde **verzenduur** (Instellingen,
   standaard 18:00) bereikt is.
2. Kandidaten = afspraken van **morgen** (Brusselse kalenderdag, berekend met
   Luxon) met status `PLANNED` en `reminderSentAt IS NULL`, bij klanten mét
   e-mailadres.
3. Per kandidaat wordt het sjabloon ingevuld
   (`{{naam}} {{datum}} {{uur}} {{werk}}`) en verstuurd.
   - Succes → `reminderSentAt` gezet + `EmailLog(SENT)`
   - Fout → `reminderError` op de afspraak + `EmailLog(FAILED)`; omdat
     `reminderSentAt` leeg blijft, probeert het volgende uur het automatisch
     opnieuw (tot 21:00)
4. **Verplaatsing naar een andere dag** reset `reminderSentAt` → de klant
   krijgt een nieuwe, correcte herinnering. Binnen dezelfde dag blijft de
   verstuurde mail gewoon geldig.
5. Handmatig versturen kan altijd: knop in de afspraakdialoog (Planning) of
   `POST /api/appointments/:id/send-reminder`. De hele job manueel draaien:
   knop op Instellingen of `POST /api/jobs/reminders`.

**Opstart-inhaalrun:** stond de server uit om 18:00, dan draait de job alsnog
meteen bij het opstarten (als het verzenduur al gepasseerd is die dag).

## Hoe de terugkerende todo's werken

Een sjabloon ("Haag scheren, ± 4 u") heeft één of meer **periodes** per jaar
(bv. "Mei" en "Sep–Okt"). De dagelijkse job (02:00) bekijkt voor elk actief
sjabloon dit jaar én volgend jaar:

- Vanaf `leadTimeDays` vóór het begin van een periode (standaard 30 dagen)
  wordt de todo aangemaakt met status "in te plannen" en de concrete
  voorkeursperiode (badge in de planning-zijbalk, gesorteerd op startdatum).
- Een periode mag over de jaargrens lopen (bv. 15 dec – 31 jan).
- **Idempotent by design:** de unieke databasesleutel (periode, jaar) maakt
  dubbele beurten onmogelijk, hoe vaak de job ook draait. Bij het bewerken van
  een sjabloon blijven bestaande periodes hun identiteit houden, dus ook dan
  geen duplicaten.
- Een sjabloon verwijderen laat al aangemaakte todo's staan; er komen alleen
  geen nieuwe beurten meer bij. Gearchiveerde klanten krijgen geen nieuwe beurten.
- Na het aanmaken/bewerken van een sjabloon in de UI draait de generatie
  meteen, zodat een lopende periode direct zichtbaar is.

## SMTP instellen (Brevo)

Er is nog geen eigen domein, dus we starten met de gratis tier van
[Brevo](https://www.brevo.com) (300 mails/dag, geen domein vereist):

1. Maak een Brevo-account en verifieer het e-mailadres waarvan je wil versturen
   (Senders & IP → Senders → "Add a sender").
2. Ga naar **SMTP & API → SMTP** en noteer login + SMTP-key.
3. Vul in `.env` in en herstart de app:

```ini
SMTP_HOST="smtp-relay.brevo.com"
SMTP_PORT="587"
SMTP_USER="<jouw brevo-login>"
SMTP_PASS="<jouw smtp-key>"
MAIL_FROM="Tuinwerken Cis <jouw-geverifieerd-adres>"
```

4. Test: plan een afspraak voor morgen bij een klant met jouw eigen e-mailadres
   en klik op Instellingen → "Herinneringen voor morgen nu versturen".

**Zonder SMTP-configuratie:** in development worden mails naar de console
gelogd (en als SENT geregistreerd) zodat je de flow kan testen; in productie
faalt verzenden met een duidelijke fout die als badge op de afspraak en in de
EmailLog verschijnt. Herinneringen zijn bewust geen blokkerende stap: de
planning zelf werkt altijd door.

**Latere verbetering:** eigen domein (bv. tuinwerkencis.be) + SPF/DKIM-records
in Brevo instellen → aanzienlijk betere afleverbaarheid (minder spamfolder).

## Sjabloon aanpassen

Instellingen → "Herinneringsmail naar klanten". Beschikbare placeholders:

| Placeholder | Wordt |
|---|---|
| `{{naam}}` | naam van de klant |
| `{{datum}}` | bv. "dinsdag 17 november" |
| `{{uur}}` | bv. "09:30" |
| `{{werk}}` | titel van de todo |

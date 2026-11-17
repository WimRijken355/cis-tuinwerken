# Handleiding Tuinwerken Cis

*Geschreven voor de gebruiker van de app — geen technische voorkennis nodig.*

## Wat doet de app?

Je beheert er je klanten en hun werk (todo's), plant dat werk in op de
kalender, en na elk werk geef je op je telefoon snel je uren in. De app maakt
dan vanzelf een **conceptfactuur** aan in EenvoudigFactureren, en je klanten
krijgen automatisch een **herinneringsmail** de dag vóór je langskomt.

## Aanmelden & beveiliging

- Meld aan met je gebruikersnaam en wachtwoord. De **eerste keer** stel je
  tweestapsverificatie in: scan de QR-code met een authenticator-app
  (Google of Microsoft Authenticator) en **bewaar de herstelcodes** op papier
  of in een wachtwoordkluis — ze worden maar één keer getoond.
- Vink "Vertrouw dit toestel 30 dagen" aan op je eigen telefoon/pc, dan hoef
  je niet elke keer een code in te tikken.
- Authenticator kwijt? Log in met een herstelcode, en stel daarna 2FA opnieuw
  in via **Instellingen → Beveiliging**.

## Op je telefoon installeren

Open de app in je browser → Delen → **"Zet op beginscherm"**. De app opent
dan als een echte app, zonder adresbalk.

## De dagelijkse werkflow

1. **'s Morgens — Vandaag:** je ziet je afspraken van vandaag. Tik op
   **🧭 Waze** en de navigatie start naar het adres van de klant.
2. **Na het werk — ✓ Klaar:** tik op "Klaar — uren ingeven" en doorloop de
   vier stapjes:
   - *Uren:* jouw gewerkte uren (vooraf ingevuld met de schatting; pas aan met + / −)
   - *Medewerkers:* vink aan wie meewerkte en zet hun uren
   - *Extra's:* tik aan wat je extra aanrekent (machine, afvoer, …) + hoeveelheid
   - *Overzicht:* controleer en bevestig
3. **Klaar!** Het werk staat afgevinkt en de conceptfactuur staat in
   EenvoudigFactureren. Daar kijk je ze na en maak je ze definitief.
   Lukte de push niet (bv. geen internet bij EenvoudigFactureren)? Geen
   probleem: je registratie is bewaard — ga later naar **Facturen** en tik
   **↻ Opnieuw**.

## Een nieuwe klant aanmaken

**Klanten → + Nieuwe klant.** Vul zeker in:
- **Adres** — anders werkt de Waze-knop niet
- **E-mailadres** — anders kan de klant geen herinneringsmail krijgen
  (de klantfiche waarschuwt met ⚠ als iets ontbreekt)

Had je al klanten in EenvoudigFactureren? Importeer ze in één keer via
**Instellingen → Importeer klanten uit EF**.

## Werk plannen

1. Zet het werk als **todo op de klantfiche** ("Haag scheren, ± 3 u").
2. Ga naar **Planning** (op de computer): links staat alles wat ingepland
   moet worden. Klik een todo aan, kies dag + uur (de duur is al ingevuld met
   je schatting) en klaar.
3. Verslepen in de kalender = verplaatsen; aan de rand trekken = langer/korter.
4. Onderweg herplannen doe je via **Komende dagen** op je telefoon: tik een
   afspraak aan en kies een nieuwe dag/uur — handig bij slecht weer.

De klant krijgt **automatisch een e-mail op de avond vóór de afspraak**
(standaard rond 18u — aanpasbaar in Instellingen, net als de tekst van de
mail). Verplaats je een afspraak naar een andere dag, dan krijgt de klant
vanzelf een nieuwe herinnering. In de afspraak zie je of de mail verstuurd is
(✓) of mislukt (⚠), en je kan er altijd handmatig één sturen.

## Terugkerend werk (bv. haag 2×/jaar)

Op de klantfiche → **Terugkerend werk → + Toevoegen**:
- wat er moet gebeuren + geschatte uren
- de **periodes**: bv. "Mei" en "Sep–Okt" = 2 beurten per jaar
- hoeveel dagen vooraf het in je planning moet verschijnen (standaard 30)

De app maakt dan elk jaar vanzelf de todo's aan, op tijd, met een badge zoals
*"Voorkeur: Mei"* in de planningslijst. Je hoeft er nooit meer zelf aan te
denken.

## Facturen

**Facturen** toont alles wat de app heeft aangemaakt, met status:
- **Concept in EF** — staat klaar in EenvoudigFactureren om na te kijken
- **Push mislukt** — tik ↻ Opnieuw (de foutoorzaak staat erbij)

Bedragen zijn excl. btw. Definitief maken en versturen doe je altijd in
EenvoudigFactureren zelf — zo hou je de controle.

## Instellingen

| Onderdeel | Wat je er regelt |
|---|---|
| Tarieven | je eigen uurtarief, btw op arbeid (21% of 6%), betaaltermijn |
| Prijslijst | de extra's die je kan aanrekenen (naam, eenheid, prijs, btw) |
| Medewerkers | vaste werkmensen + hun uurtarief (picklist bij het registreren) |
| Herinneringsmail | verzenduur en de teksten (met {{naam}}, {{datum}}, {{uur}}, {{werk}}) |
| EF-import | bestaande klanten uit EenvoudigFactureren binnenhalen |
| Beveiliging | vertrouwde toestellen bekijken/intrekken, 2FA opnieuw instellen |

Goed om te weten: tarieven worden **vastgeklikt per registratie**. Verhoog je
later je uurtarief of een prijs, dan veranderen oude registraties en facturen
dus niet mee.

## Veelgestelde vragen

**De klant kreeg geen herinnering.** Heeft de klant een e-mailadres op zijn
fiche? Stond de afspraak er al vóór het verzenduur? Check de afspraak in
Planning: een ⚠ toont wat er misliep; met ✉ stuur je er meteen één.

**Ik heb verkeerde uren ingegeven.** De factuur is een concept: pas ze aan in
EenvoudigFactureren vóór je ze definitief maakt.

**Kan ik iets aanrekenen dat niet in de prijslijst staat?** Voeg het item eerst
toe via Instellingen → Prijslijst (dat is 10 seconden werk) en registreer dan.

**Werkt de app zonder internet?** De app opent wel, maar plannen en
registreren vereisen verbinding. Je krijgt dan een duidelijke melding —
er gaat niets verloren, probeer gewoon opnieuw zodra je bereik hebt.

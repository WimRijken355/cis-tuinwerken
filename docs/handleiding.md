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
  in via **Instellingen → Algemeen → Beveiliging**.

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
**Instellingen → Algemeen → Importeer klanten uit EF**.

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
- de **checklist**: welke standaardtaken erbij horen
- de **resources**: welke personen/machines nodig zijn, met hun uren

De app maakt dan elk jaar vanzelf de todo's aan, op tijd, met een badge zoals
*"Voorkeur: Mei"* in de planningslijst — inclusief checklist en resources. Je
hoeft er nooit meer zelf aan te denken.

## Checklist

De standaardtaken (bv. "Haag scheren", "Snoeiafval afvoeren") beheer je in
**Instellingen → Checklist** (eigen pagina): toevoegen, hernoemen, volgorde (▲▼),
deactiveren. Bij een todo of terugkerend werk vink je aan welke taken van
toepassing zijn. Op de klantfiche vink je ze af zodra ze gedaan zijn
(*Checklist 2/5*).

## Facturen

**Facturen** toont alles wat de app heeft aangemaakt, met status:
- **Concept in EF** — staat klaar in EenvoudigFactureren om na te kijken
- **Push mislukt** — tik ↻ Opnieuw (de foutoorzaak staat erbij)
- **Niet gesynchroniseerd** — gemaakt terwijl de synchronisatie uit stond
  (Instellingen → Algemeen → *Facturen synchroniseren naar EenvoudigFactureren*).
  Zet je de schakelaar weer aan, dan stuur je ze met **→ Naar EF sturen** alsnog door.

Bedragen zijn excl. btw. Definitief maken en versturen doe je altijd in
EenvoudigFactureren zelf — zo hou je de controle.

## Instellingen

Alles wat de app configureert staat onder **Instellingen**: in de zijbalk een
uitklapbaar submenu, op je gsm via **Meer** en dan de tabbladen bovenaan.

| Submenu | Wat je er regelt |
|---|---|
| Algemeen | tarieven (eigen uurtarief, btw op arbeid 21% of 6%, betaaltermijn), herinneringsmail (verzenduur + teksten met {{naam}}, {{datum}}, {{uur}}, {{werk}}), klanten importeren uit EenvoudigFactureren, beveiliging (vertrouwde toestellen, 2FA opnieuw instellen) |
| Artikels | de extra's die je kan aanrekenen (naam, eenheid, prijs, btw) + import uit EenvoudigFactureren |
| Resources | personen en machines + hun uurtarief. Personen zijn de picklist bij het registreren; bij een todo of terugkerend werk kies je welke resources nodig zijn en hoeveel uren elk |
| Checklist | de standaardtaken die je bij een todo of terugkerend werk aanvinkt |
| Gebruikers | wie mag aanmelden en met welke rol (enkel voor beheerders) |

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
toe via Artikels (dat is 10 seconden werk) en registreer dan.

**Werkt de app zonder internet?** De app opent wel, maar plannen en
registreren vereisen verbinding. Je krijgt dan een duidelijke melding —
er gaat niets verloren, probeer gewoon opnieuw zodra je bereik hebt.

## Demodata (uitproberen)

In **Instellingen → Algemeen → Demodata** (enkel voor beheerders) zet je met
één schakelaar fictieve klanten aan of uit: 10 klanten in de Kempen met
todo's van 2 uur tot 6 werkdagen, met de resources Cis (altijd), Wim en Ken en
enkele machines. Handig om de planning uit te proberen. Demoklanten hebben een
gele **Demo**-badge, gaan nooit naar EenvoudigFactureren en krijgen nooit
mails. Uitzetten verwijdert ze met alles wat eraan hangt; je echte klanten,
Cis/Wim/Ken en je eigen checklist blijven staan.

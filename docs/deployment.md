# Deployment op Hetzner (runbook)

De hele productieomgeving draait met Docker Compose op één Hetzner-VM:
**app** (Next.js, standalone) · **postgres** (database + volume) ·
**caddy** (automatische HTTPS) · **postgres-backup** (nachtelijkse dumps).

> ⚠ Schaal de app-container nooit naar meer dan 1 replica: de cronjobs
> (herinneringsmails, terugkerend werk) draaien in het appproces zelf.

## 1. Eenmalige serverinstallatie

1. **VM aanmaken** in de [Hetzner Cloud Console](https://console.hetzner.cloud):
   type CX22 (2 vCPU / 4 GB) volstaat ruim; OS Ubuntu 24.04; voeg je SSH-sleutel toe.
2. **DNS**: maak een A-record (bv. `app.tuinwerkencis.be`) dat naar het IP van
   de VM wijst. Zonder domein geen automatische HTTPS.
3. **Server klaarzetten** (via `ssh root@<ip>`):

```bash
apt update && apt upgrade -y

# Docker (officiële repo)
curl -fsSL https://get.docker.com | sh

# Firewall: alleen SSH en web
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Werkmap
mkdir -p /opt/tuinwerken && cd /opt/tuinwerken
```

4. **Project op de server zetten.** Via git (aanbevolen — maak een privé-repo):

```bash
cd /opt/tuinwerken && git clone <jouw-repo-url> .
```

   Of eenmalig kopiëren vanaf je pc (PowerShell):
   `scp -r . root@<ip>:/opt/tuinwerken` (sluit `node_modules`, `.next` en `.env` uit).

5. **`.env` aanmaken op de server** (`nano /opt/tuinwerken/.env`) — gebruik
   `.env.example` als basis en vul in:

```ini
APP_DOMAIN="app.tuinwerkencis.be"
POSTGRES_PASSWORD="<lang willekeurig wachtwoord>"
SESSION_SECRET="<64 hex-tekens — genereer: openssl rand -hex 32>"
ADMIN_USERNAME="wim"
ADMIN_PASSWORD="<sterk wachtwoord>"
SMTP_HOST="smtp-relay.brevo.com"
SMTP_PORT="587"
SMTP_USER="…"
SMTP_PASS="…"
MAIL_FROM="Tuinwerken Cis <geverifieerd@adres.be>"
EF_AUTH_MODE="apikey"
EF_API_KEY="…"
EF_API_KEY_HEADER="X-API-Key"
```

   `DATABASE_URL` hoef je in productie **niet** te zetten — compose bouwt hem
   zelf op met `POSTGRES_PASSWORD`.

6. **Starten:**

```bash
cd /opt/tuinwerken
docker compose -f docker-compose.prod.yml up -d --build
```

   De app-container draait bij het opstarten zelf de migraties en de
   (idempotente) seed. Controleer:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app   # "🚀 Server starten…"
curl -s https://app.tuinwerkencis.be/api/health          # {"status":"ok",...}
```

7. **Eerste login:** surf naar je domein, meld aan met `ADMIN_USERNAME`/
   `ADMIN_PASSWORD` en doorloop de verplichte 2FA-setup (QR-code scannen,
   herstelcodes veilig bewaren).

8. **PWA installeren op je telefoon:** open de site in Safari/Chrome →
   Delen → "Zet op beginscherm".

## 2. Een update uitrollen

```bash
cd /opt/tuinwerken
git pull                                            # of nieuwe bestanden kopiëren
docker compose -f docker-compose.prod.yml up -d --build app
```

Migraties draaien automatisch mee bij het opstarten. De database en Caddy
blijven gewoon doorlopen.

## 3. Backups

- De `postgres-backup`-container maakt **elke nacht** een `pg_dump` en bewaart
  7 dagelijkse, 4 wekelijkse en 6 maandelijkse dumps in het `backups`-volume.
- Bekijken: `docker compose -f docker-compose.prod.yml exec postgres-backup ls /backups/daily`
- **Off-site kopie (aangeraden):** huur een kleine Hetzner Storage Box en
  synchroniseer dagelijks, bv. met een cron op de VM:

```bash
# /etc/cron.daily/backup-offsite (chmod +x)
#!/bin/sh
BACKUPS=$(docker volume inspect tuinwerken_backups -f '{{.Mountpoint}}')
rsync -az --delete "$BACKUPS/" u123456@u123456.your-storagebox.de:tuinwerken-backups/
```

### Terugzetten (restore)

```bash
cd /opt/tuinwerken
docker compose -f docker-compose.prod.yml stop app
# kies een dump:
docker compose -f docker-compose.prod.yml exec postgres-backup ls /backups/daily
docker compose -f docker-compose.prod.yml exec postgres-backup sh -c \
  "zcat /backups/daily/<bestand>.sql.gz" | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U tuinwerken -d tuinwerken
docker compose -f docker-compose.prod.yml start app
```

Test de restore minstens één keer per jaar — een backup die je nooit hebt
teruggezet is geen backup.

## 4. Probleemoplossing

| Symptoom | Kijk naar |
|---|---|
| Site onbereikbaar | `docker compose … logs caddy` — DNS correct? Poort 80/443 open? |
| 502 van Caddy | `docker compose … logs app` — crasht de app bij het opstarten? |
| "Migraties toepassen" blijft hangen | `docker compose … logs postgres`; healthcheck ok? |
| Mails komen niet aan | Instellingen → handmatige run; `docker compose … logs app` (reminder-job logt); EmailLog; spamfolder; Brevo-dashboard |
| Factuurpush FAILED | Facturen-pagina toont de fout; EF-key juist in `.env`? Retry-knop |
| 2FA kwijt | herstelcode gebruiken bij login; of alle 2FA resetten via SQL: `docker compose … exec postgres psql -U tuinwerken -d tuinwerken -c 'UPDATE "User" SET "totpSecret"=NULL;'` → eerstvolgende login start de setup opnieuw |

Onderhoud: draai af en toe `apt update && apt upgrade` op de VM en
`docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d`
voor verse images (postgres/caddy/backup); herbouw de app geregeld zodat ook
het Node-basisimage security-updates meekrijgt.

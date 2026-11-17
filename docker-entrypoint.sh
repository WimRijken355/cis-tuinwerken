#!/bin/sh
# Opstartscript van de app-container:
# 1. databasemigraties toepassen (veilig, alleen vooruit)
# 2. seed draaien (idempotent: maakt admin/prijslijst/instellingen alleen aan
#    als ze nog niet bestaan — overschrijft nooit iets)
# 3. de Next.js-server starten
set -e

echo "⏳ Migraties toepassen…"
cd /tools
npx prisma migrate deploy

echo "🌱 Seed (idempotent)…"
npx prisma db seed || echo "⚠ Seed overgeslagen/mislukt — controleer ADMIN_USERNAME/ADMIN_PASSWORD"

echo "🚀 Server starten…"
cd /app
exec node server.js

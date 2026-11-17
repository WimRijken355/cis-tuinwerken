# ============================================================================
# Multi-stage build voor de productiecontainer.
#
#   deps   → alle dependencies installeren + Prisma-client genereren
#   build  → Next.js productie-build (standalone)
#   runner → klein runtime-image:
#            /app   = de standalone Next.js-server
#            /tools = prisma CLI + schema, voor migraties en seed bij opstart
# ============================================================================

FROM node:22-slim AS deps
WORKDIR /app
# Dummy-URL: prisma generate heeft geen echte database nodig, maar de config
# wil wél een waarde zien.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
# Dummywaarden: "next build" importeert route-modules (page data collection)
# en die valideren de config. Er wordt tijdens de build niets echt verbonden;
# in productie gelden de waarden uit docker-compose/.env.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV SESSION_SECRET="build-dummy-secret-xxxxxxxxxxxxxxxxxxxxxxxx"
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY . .
RUN npm run build

FROM node:22-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# /tools: prisma CLI + schema voor `migrate deploy` en de (idempotente) seed.
WORKDIR /tools
# Dummy voor prisma generate tijdens npm ci; wordt in productie overschreven
# door de environment uit docker-compose.prod.yml.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

# /app: de standalone server (bevat zijn eigen minimale node_modules).
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY docker-entrypoint.sh /entrypoint.sh
# Windows-checkout-vangnet: CRLF-regeleindes breken /bin/sh.
RUN sed -i 's/\r$//' /entrypoint.sh

EXPOSE 3000
CMD ["sh", "/entrypoint.sh"]

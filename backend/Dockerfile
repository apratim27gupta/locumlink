# syntax=docker/dockerfile:1

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm install --workspace=backend --include-workspace-root

COPY database/prisma ./database/prisma
COPY backend ./backend

RUN npm run build -w backend \
  && test -f backend/dist/admin/admin.module.js \
  && test -f backend/dist/payments/payments.module.js

# ── Stage 2: production ───────────────────────────────────────────────────────
FROM node:22-alpine AS production

RUN apk add --no-cache wget \
  && addgroup -g 1001 -S nodejs \
  && adduser -S nestjs -u 1001 -G nodejs

WORKDIR /app

COPY package.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm install --omit=dev --workspace=backend --include-workspace-root

COPY database/prisma ./database/prisma
COPY --from=builder /app/backend/dist ./backend/dist

RUN npx prisma generate --schema=database/prisma/schema.prisma \
  && chown -R nestjs:nodejs /app

WORKDIR /app/backend

USER nestjs

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy --schema=../database/prisma/schema.prisma && node dist/main.js"]

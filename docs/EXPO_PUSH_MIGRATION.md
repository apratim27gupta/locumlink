# Expo Push Tokens — Database Migration Runbook

Migration: `20260703120000_add_expo_push_tokens`

Creates table `expo_push_tokens` for native iOS/Android push via Expo Push API.

This migration is **additive** (new table only). Safe to run on staging and production without data loss.

---

## Local development

```bash
# From repo root
docker compose up -d

export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/l2_db?schema=public"
npx prisma migrate deploy --schema=database/prisma/schema.prisma
npx prisma generate --schema=database/prisma/schema.prisma
```

Or use npm scripts:

```bash
npm run db:up
npm run db:prepare
npm run prisma:generate
```

Verify:

```bash
npx prisma migrate status --schema=database/prisma/schema.prisma
```

---

## Staging

```bash
cd /root/locumlink
git pull

export DATABASE_URL="postgresql://postgres:${STAGING_POSTGRES_PASSWORD}@127.0.0.1:5433/l2_staging"
npx prisma migrate deploy --schema=database/prisma/schema.prisma
npx prisma generate --schema=database/prisma/schema.prisma

./scripts/deploy-staging.sh migrate
```

`deploy-staging.sh migrate` pulls, runs migrate deploy, rebuilds, and restarts services.

---

## Production

```bash
cd <prod-root>
git pull

export DATABASE_URL="<prod-database-url>"
npx prisma migrate deploy --schema=database/prisma/schema.prisma
npx prisma generate --schema=database/prisma/schema.prisma

# Restart backend — prestart:prod also runs migrate deploy
npm run start:prod -w backend
```

If your production deploy uses systemd or another process manager, restart the API service after pulling. The backend `prestart:prod` hook in `backend/package.json` runs `prisma migrate deploy` automatically on start.

---

## Rollback

Only if no Expo tokens have been stored yet:

```sql
DROP TABLE IF EXISTS "expo_push_tokens";
```

Then remove the migration record from `_prisma_migrations` if you need Prisma to re-apply. Prefer forward-only rollback in production.

---

## Related code

- Schema: `database/prisma/schema.prisma` — `ExpoPushToken` model
- Backend: `backend/src/notifications/push.service.ts` — register + send
- API: `POST /api/notifications/push/register-expo`, `DELETE /api/notifications/push/unregister-expo`

---

## Apple APNs (deferred)

Device delivery on iOS requires APNs credentials in EAS. See `mobile/IOS_APP_STORE_BLOCKERS.md`. Code and DB are ready before credentials are configured.

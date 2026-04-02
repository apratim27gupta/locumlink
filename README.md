# L2

NestJS skeleton project with Prisma ORM, PostgreSQL, and environment-based configuration for staging and production.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 |
| Language | TypeScript 5.7 (strict, `nodenext` modules) |
| ORM | Prisma 7 |
| Database | PostgreSQL 16 (local via Docker for staging, Supabase for production) |
| Config | `@nestjs/config` with `class-validator` validation |
| Testing | Jest, Supertest |
| Linting | ESLint 9, Prettier |

## Project Structure

```
l2/
├── backend/                    # NestJS API
│   ├── src/
│   │   ├── config/
│   │   │   └── env.validation.ts
│   │   ├── auth/               # JWT auth (register, login, me)
│   │   ├── health/
│   │   ├── prisma/
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── test/
│   │   └── app.e2e-spec.ts
│   ├── nest-cli.json
│   └── package.json
├── frontend/                   # Next.js (App Router) — OTP login UI
│   ├── app/
│   ├── components/
│   └── lib/
├── database/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── docker-compose.yml      # Local PostgreSQL
├── prisma.config.ts            # Prisma CLI (paths → database/prisma)
├── .env                        # Shared: backend + loaded by frontend via next.config
├── .env.staging
├── .env.production
└── package.json                # npm workspaces + root scripts
```

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- **Docker** and **Docker Compose** (for local Postgres)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start local PostgreSQL

```bash
npm run db:up
```

This runs a Postgres 16 container on host port **5433** (mapped to 5432 in the container) with:

| Setting | Value |
|---|---|
| User | `postgres` |
| Password | `postgres` |
| Database | `l2_db` |

Verify the container is running:

```bash
docker ps
```

You should see `l2_postgres` in the list.

### 3. Generate the Prisma client

```bash
npm run prisma:generate
```

This reads `database/prisma/schema.prisma` and generates the Prisma client into `node_modules/@prisma/client`.

### 4. Run database migrations

```bash
npm run prisma:migrate
```

Since the schema has no models yet, this will initialize the migration history. When you add models later, re-run this command to create and apply migrations.

### 5. Start the application

**Development mode (staging, with hot-reload):**

```bash
npm run start:dev
```

**Built staging mode:**

```bash
npm run build
npm run start:staging
```

**Production mode:**

```bash
npm run build
npm run start:prod
```

The app starts on the port defined in the env file (default **3000**) and logs:

```
Application running on port 3000 [staging]
```

### 6. Test the health endpoint

```bash
curl http://localhost:3000/api/health
```

Response:

```json
{
  "status": "ok",
  "environment": "staging",
  "database": "ok",
  "timestamp": "2026-03-30T12:00:00.000Z"
}
```

If Postgres is not running, `database` will return `"unreachable"` but the endpoint still responds with `200`.

## Environment Configuration

The app uses `@nestjs/config` to load environment variables. The loading order is:

1. `.env.{NODE_ENV}` (e.g. `.env.staging` or `.env.production`)
2. `.env` (fallback)

If `NODE_ENV` is not set, it defaults to `staging`.

### Required Variables

| Variable | Type | Description |
|---|---|---|
| `NODE_ENV` | `staging` \| `production` | Current environment |
| `PORT` | number | HTTP port to listen on |
| `DATABASE_URL` | string | PostgreSQL connection string |

The app **will not start** if any of these are missing or invalid. Validation is handled by `backend/src/config/env.validation.ts` using `class-validator`.

### Staging (.env.staging)

```
NODE_ENV=staging
PORT=3000
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/l2_db"
```

Points at the local Docker Postgres.

### Production (.env.production)

```
NODE_ENV=production
PORT=3000
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"
```

Replace the placeholder with your Supabase project's connection string. You can find it in the Supabase dashboard under **Settings > Database > Connection string > URI**.

## npm Scripts Reference

| Script | Description |
|---|---|
| `npm run start:dev` | Development mode with watch (staging) |
| `npm run start:staging` | Run compiled app with `NODE_ENV=staging` |
| `npm run start:prod` | Run compiled app with `NODE_ENV=production` |
| `npm run start:debug` | Debug mode with watch (staging) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run lint` | Run ESLint with auto-fix |
| `npm run format` | Run Prettier |
| `npm test` | Run unit tests |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run test:cov` | Run tests with coverage report |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run prisma:generate` | Regenerate the Prisma client |
| `npm run prisma:migrate` | Create and apply Prisma migrations |
| `npm run prisma:studio` | Open Prisma Studio (database GUI) |
| `npm run db:up` | Start local Postgres (`database/docker-compose.yml`) |
| `npm run db:down` | Stop local Postgres container |
| `npm run dev:frontend` | Next.js dev server (port **3001**) |

## Docker Compose

`database/docker-compose.yml` provides a single Postgres 16 service for local development.

```bash
# Start
npm run db:up

# Stop (keeps data)
npm run db:down

# Stop and destroy data
docker compose down -v
```

Data is persisted in a named volume (`pgdata`). Use `docker compose down -v` to wipe it.

## Prisma

### Schema

Models are defined in `database/prisma/schema.prisma`.

Example of adding a model:

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

After adding or changing models:

```bash
npm run prisma:generate   # regenerate the client
npm run prisma:migrate    # create and apply migration
```

### Using PrismaService

`PrismaModule` is registered globally. Inject `PrismaService` into any service without importing the module again:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany();
  }
}
```

### Prisma Studio

Browse and edit your database with a GUI:

```bash
npm run prisma:studio
```

Opens at `http://localhost:5555`.

## Adding a New Module

Follow the NestJS module pattern:

```bash
# Using the NestJS CLI generator
npx nest g module users
npx nest g controller users
npx nest g service users
```

Or create the files manually under `src/users/` and import `UsersModule` in `app.module.ts`.

## API

All Nest routes are prefixed with `/api` (see `backend/src/main.ts`).

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Returns `status`, `environment`, `database` (`ok` or `unreachable`), `timestamp` |

### Auth (`AuthController`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Register; returns JWT tokens + user |
| POST | `/api/auth/login` | — | Login; returns JWT tokens + user |
| GET | `/api/auth/me` | Bearer JWT | Current user (password hash stripped) |

### Frontend (external APIs)

The Next app in `frontend/` uses the **Supabase JS client** only (`@/lib/supabaseClient`): `signInWithOtp`, OTP verify, and session handling. It does not call the Nest API unless you add that integration later.

| Where | API |
|---|---|
| `frontend/components/Auth/RequestOtp.jsx` | `supabase.auth.signInWithOtp` |
| `frontend/components/Auth/VerifyOtp.jsx` | `supabase.auth.verifyOtp` (and related session APIs) |

## Production Deployment (Supabase)

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Copy the connection string from **Settings > Database > Connection string > URI**
3. Set the values in `.env.production` (or as environment variables on your hosting platform):
   ```
   NODE_ENV=production
   PORT=3000
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.YOUR_REF.supabase.co:5432/postgres"
   ```
4. Run migrations against the production database:
   ```bash
   DATABASE_URL="your_production_url" npm run prisma:migrate
   ```
5. Build and start:
   ```bash
   npm run build
   npm run start:prod
   ```

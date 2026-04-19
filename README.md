# Locum Link

A full-stack platform connecting locum physicians with host clinics across Canada. Hosts post shifts, locums apply and get shortlisted, and both parties communicate through an integrated messaging system.

---

## Tech Stack

| Layer        | Technology                            |
| ------------ | ------------------------------------- |
| Frontend     | Next.js 15, TypeScript                |
| Backend      | NestJS, Passport JWT, class-validator |
| Database     | PostgreSQL via Prisma ORM             |
| Auth         | Supabase OTP + custom Nest JWT        |
| File Storage | Google Cloud Storage (signed URLs)    |

---

## Project Structure

```
l2/
├── backend/                  # NestJS API — port 3000
│   └── src/
│       ├── auth/             # JWT strategy, Supabase OTP sync
│       ├── host/             # Host profile, jobs, applications
│       ├── locum/            # Locum profile, browse, apply
│       ├── message/          # Messaging system
│       ├── notifications/    # Bell notifications
│       ├── gcs/              # Google Cloud Storage service
│       └── upload/           # File upload endpoint
├── frontend/                 # Next.js app — port 3001
│   └── src/
│       ├── app/              # App router pages
│       ├── components/       # Shared UI components
│       ├── lib/              # api.ts, auth.ts, db.ts
│       └── providers/        # AuthProvider
└── database/
    └── prisma/
        ├── schema.prisma
        └── migrations/
```

---

## Prerequisites

- Node.js 20+
- PostgreSQL (Docker recommended)
- Supabase project
- Google Cloud project with a Storage bucket

---

## Environment Setup

### Backend — `backend/.env`

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/l2_db
JWT_SECRET=your-32-char-secret
NODE_ENV=staging
PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GCS_PROJECT_ID=your-gcp-project-id
GCS_BUCKET_NAME=your-bucket-name
GCS_KEY_FILE=/absolute/path/to/service-account-key.json
```

### Frontend — `frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
JWT_SECRET=your-32-char-secret
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/l2_db
```

> `JWT_SECRET` and `DATABASE_URL` must be identical in both files.

---

## Local Development

```bash
# 1. Start database
docker compose up -d

# 2. Run migrations and generate Prisma client
npx prisma migrate deploy
npx prisma generate

# 3. Start backend (new terminal)
cd backend
npm install
npm run start:dev

# 4. Start frontend (new terminal)
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:3001`, backend at `http://localhost:3000`.

---

## Google Cloud Storage Setup

1. Create a GCS bucket in your Google Cloud project
2. Create a service account with roles:
   - **Storage Object Admin**
   - **Service Account Token Creator**
3. Download the JSON key file — never commit it
4. Set `GCS_KEY_FILE` in `backend/.env` to the absolute path of the key file

Files are stored as GCS object paths in the database. Signed URLs (1-hour TTL) are generated on every read request — never store the signed URL itself.

---

## Authentication Flow

```
User enters email
      ↓
Supabase sends OTP
      ↓
User verifies OTP → Supabase session created
      ↓
Frontend calls POST /api/auth/sync-supabase → receives Nest JWT
      ↓
JWT stored in localStorage + ll_access cookie (365-day expiry)
      ↓
Middleware reads ll_access cookie to protect /host/* and /locum/* routes
      ↓
All API requests use Bearer JWT verified by backend
      ↓
On re-login, user is restored to their last visited page
```

---

## Key Features

- **Host** — post job shifts, review applicants, shortlist and message locums
- **Locum** — browse active jobs, apply, track application status
- **Messaging** — full messaging with edit, delete, and file attachments via GCS
- **Notifications** — bell icon polls every 7 seconds for unread messages, new applications (host), and shortlist events (locum)
- **File uploads** — PDF and image upload via GCS with signed URL delivery
- **Path restoration** — users return to their last visited page after re-login
- **Role separation** — hosts and locums have fully separate dashboards and navigation

---

## API Reference

| Method | Route                                  | Description                            |
| ------ | -------------------------------------- | -------------------------------------- |
| POST   | /api/auth/sync-supabase                | Exchange Supabase token for Nest JWT   |
| GET    | /api/host/profile                      | Get host profile                       |
| POST   | /api/host/profile                      | Save host profile                      |
| GET    | /api/host/jobs                         | List host jobs                         |
| POST   | /api/host/jobs                         | Create job posting                     |
| PATCH  | /api/host/jobs/:id                     | Update job posting                     |
| DELETE | /api/host/jobs/:id                     | Delete job posting                     |
| POST   | /api/host/jobs/:id/reopen              | Reopen a filled job                    |
| GET    | /api/host/jobs/:id/applications        | List applicants for a job              |
| PATCH  | /api/host/jobs/:id/applications/:appId | Shortlist / reject / confirm applicant |
| GET    | /api/host/stats                        | Dashboard statistics                   |
| GET    | /api/locum/profile                     | Get locum profile                      |
| POST   | /api/locum/profile                     | Save locum profile                     |
| GET    | /api/locum/jobs                        | Browse active jobs                     |
| POST   | /api/locum/jobs/:id/apply              | Apply to a job                         |
| GET    | /api/locum/applications                | My applications                        |
| GET    | /api/messages/conversations            | All conversations                      |
| GET    | /api/messages/thread/:partnerId        | Message thread with a user             |
| POST   | /api/messages                          | Send a message                         |
| PATCH  | /api/messages/:id                      | Edit a message                         |
| DELETE | /api/messages/:id                      | Delete a message                       |
| GET    | /api/notifications                     | Bell notifications                     |
| POST   | /api/upload                            | Upload file to GCS                     |

---

## Database

```bash
# Create a new migration after schema changes
npx prisma migrate dev --name describe_your_change

# Apply migrations
npx prisma migrate deploy

# Regenerate Prisma client
npx prisma generate
```

---

## Scripts

From `backend/`:

```bash
npm run start:dev    # development with file watching
npm run build        # production build
npm run start:prod   # production start
```

From `frontend/`:

```bash
npm run dev          # development with Turbopack
npm run build        # production build
npm run start        # production start
```

---

## Security

- Never commit `.env` files or GCS key JSON files — both are excluded by `.gitignore`
- Signed URLs expire after 1 hour — never cache or store them
- JWT secret must be at least 32 characters and identical across frontend and backend
- Cookies use `SameSite=Lax` with 365-day expiry to prevent middleware redirect loops
- The `ll_access` cookie is re-synced from localStorage on every tab focus and visibility change

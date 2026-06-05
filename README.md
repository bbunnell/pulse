# Time Attendance App

Next.js + TypeScript time and attendance app for employee punching, breaks, lunches, vacation and sick time, team availability, calendar visibility, and weekly payroll reporting.

## What is included

- Dashboard-first operational view with current team status and summary metrics
- Employee punch in/out controls with break and lunch tracking
- My Time view for personal weekly totals and warnings
- Vacation and sick time entry with ICS generation
- Team calendar with day, week, and month views using `react-big-calendar`
- Weekly report with missing punch warnings and CSV export
- Admin settings UI for users, roles, teams, reminders, work week, and email provider choices
- PostgreSQL schema migrations for teams, profiles, shifts, time-off, auth, and settings
- API route foundations for punches, break/lunch segments, time off, weekly reports, CSV export, and ICS files

The app is PostgreSQL-backed and does not include demo-mode runtime stores.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Docker (app + PostgreSQL)

Run the full stack locally (or on a server) with one command:

```bash
# Optional: copy .env.docker.example to .env and set SESSION_SECRET
docker compose up --build
```

Then open `http://localhost:3000`.

- Postgres listens on host port **5432** (see `docker-compose.yml`).
- On each app start, the container waits for the database, runs `npm run db:setup` (idempotent migrations + seed), then starts Next.js.
- To deploy on Ubuntu later: install Docker Engine + Compose on the server, copy this repo (or a saved image), set `SESSION_SECRET` (and production URLs), and run the same `docker compose up -d`.

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

- `DATABASE_URL`
- `SESSION_SECRET`
- Email provider values for Resend, Postmark, SendGrid, or SMTP

Use a long random value for `SESSION_SECRET` in production.

## Database setup

Apply the SQL migrations in `supabase/migrations` against your PostgreSQL database.

The schema includes:

- `profiles`
- `teams`
- `shifts`
- `shift_segments`
- `time_off_entries`
- `email_logs`
- `reminder_rules`
- `ics_events`
- `audit_logs`
- `app_users`
- `password_reset_tokens`
- `app_settings`

To allow login, each `profiles` row must have a matching `app_users` row with a bcrypt password hash.

For a first-time environment, run the bootstrap seed migration:

- `supabase/migrations/0003_bootstrap_seed.sql`
- Default admin: `admin@company.local`
- Default password: `ChangeMeNow123!` (forced reset on first sign-in)

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run db:setup
npm run docker:up
npm run lint
npm run typecheck
```

For local bootstrap, set `DATABASE_URL` and run:

```bash
npm run db:setup
```


# SportDesk

SportDesk is a modular academy operations system being built for Impact Fit Academy. The project is delivered in small slices. Identity and academy records are established, and initial admin, coach, parent, finance, reporting, and announcement workflows are implemented. The coach/parent operations flow and finance records still need acceptance on their intended clients and database before pilot use.

## Workspace

- `apps/admin` — Next.js 16 admin application.
- `apps/mobile` — Expo/React Native coach and guardian application shell.
- `apps/backend` — Express API, Drizzle schema, and migrations.
- `packages/contracts` — shared Zod request and response contracts.

The clients call the backend API. Only the backend connects to PostgreSQL.

## Requirements

- Node.js 22.13 or later.
- pnpm 12.14.0.
- Docker Compose for a local PostgreSQL instance, or another development PostgreSQL database.

Install pnpm if it is not available through Corepack:

```sh
npm install --global pnpm@12.14.0
```

## Local setup

1. Copy the root `.env.example` to `.env` and generate a random `JWT_ACCESS_SECRET` of at least 32 characters. The example database URL is for the local Compose database only. Configure `RESEND_API_KEY` and `EMAIL_FROM` to enable password recovery mail. Copy `apps/admin/.env.example` to `apps/admin/.env.local` or `apps/mobile/.env.example` to `apps/mobile/.env` only when you need to override the API address.
2. Start local PostgreSQL: `docker compose up -d postgres`.
3. Install packages: `pnpm install`.
4. Apply the checked-in migrations: `pnpm --filter @sportdesk/backend db:migrate`.
5. Set the local academy and owner bootstrap values in `.env`, then run `pnpm --filter @sportdesk/backend db:bootstrap-owner`. This command refuses to run in production and will not add another user if the database already has one.
6. Start the API and admin app: `pnpm dev`.
7. For a device or simulator, set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to an address reachable from that device, then run `pnpm dev:mobile`.

The owner bootstrap command is an explicit local-development tool, not a public signup route. Do not point the local Compose setup or bootstrap command at production data.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Backend integration tests apply the checked-in migrations to an isolated in-memory PostgreSQL engine (PGlite) and use synthetic accounts and records. They do not connect to a live database. For a local server migration, use the disposable Compose database.

## Current implementation boundary

Phase 0 provides short-lived access tokens, rotating database-backed refresh sessions, strict environment parsing, owner-only admin access, and the first academy records workflow. Owners can configure disciplines, programs, and batches; register students; add a guardian contact; and assign a student to a batch. Student creation, guardian linking, and an initial enrollment are atomic. Academy scope comes from the authenticated user.

Phase 1 includes coach accounts and batch assignments, editable recurring schedules with idempotent session generation, session reschedule/cancel controls, coach mobile attendance with a secure offline retry queue, owner session-first attendance review and audited corrections, expiring parent access invites, and parent mobile views limited to linked children. Push attendance alerts are implemented for owner/staff mobile devices but require EAS/APNs/FCM configuration. Physical-device workflow checks and broader browser E2E coverage remain before calling it pilot-ready. See [the product roadmap](docs/product-roadmap.md) for acceptance gates and the next phase.

The implementation intentionally keeps the product focused on one configured academy. The initial finance slice supports manual charges, offline receipts, refunds, expenses, and parent read-only statements; online payments are not connected. Admissions supports inquiry intake, follow-up history, source tracking, and conversion into a student with an optional enrollment. Staff accounts have owner-managed API permissions and token-based password recovery when Resend delivery is configured. Coaches can record sport-labeled progress entries and choose parent visibility; academy-defined assessment templates and history corrections remain open. The dashboard shows no fabricated operational metrics. See [the product roadmap](docs/product-roadmap.md) for current acceptance gates and gaps.

# SportDesk

SportDesk is a modular academy operations system being rebuilt for Impact Fit Academy. The project is delivered in small, verified slices. Phase 0 established identity and academy records; Phase 1 is building the first daily operations workflow across admin web and coach/parent mobile.

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

1. Copy the root `.env.example` to `.env` and generate a random `JWT_ACCESS_SECRET` of at least 32 characters. The example database URL is for the local Compose database only. Copy `apps/admin/.env.example` to `apps/admin/.env.local` or `apps/mobile/.env.example` to `apps/mobile/.env` only when you need to override the API address.
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

Phase 1 now includes coach accounts and batch assignments, recurring schedule records, date-specific sessions, coach mobile attendance entry, owner attendance review and audited corrections, expiring parent access invites, and parent mobile views limited to linked children. Phase 1 is still subject to client smoke checks and operational hardening; see [the product roadmap](docs/product-roadmap.md) for the remaining completion gates and later phases.

The implementation intentionally keeps the product focused on one configured academy. Staff permission administration, automated session generation, fees, payments, athlete progress, announcements, reports, account recovery, and production deployment are not part of the current Phase 1 slice. The dashboard shows no fabricated operational metrics.

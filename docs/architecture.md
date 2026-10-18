# Architecture decisions

## Current delivery slice

SportDesk is a pnpm modular monolith with three applications: Next.js admin, Expo mobile, and Express API. PostgreSQL is accessed only by the API through Drizzle. `@sportdesk/contracts` is the shared Zod boundary for client/server requests and responses.

The initial deployment uses one configured academy. Operational routes derive the academy context from the authenticated user; clients cannot choose an academy ID. There is no academy registration, tenant switching, or subscription model.

The academy module supports disciplines, programs, batches, students, guardian contacts, and enrollments. Student registration can include a guardian and an initial batch assignment in one database transaction. Batch capacity is enforced while the batch row is locked, and active duplicate enrollments are prevented by a partial unique index. Related rows carry academy ownership, and composite foreign keys prevent linking records or creators across academies.

Phase 1 adds coach accounts and batch assignments, recurring batch schedules, dated training sessions, attendance, correction history, and one-use guardian access invites. Coach reads and writes are restricted to assigned batches. Parent reads go through guardian-to-student relationships and cannot accept a student ID as proof of access. Session attendance is immutable to coaches after completion; owners correct it through an audited operation.

## Authentication

- Passwords are hashed with Argon2id.
- Access JWTs are short-lived and contain a session ID, not an authoritative role claim.
- Every authenticated API request checks that the session is still active and loads the current user's role from PostgreSQL.
- Refresh credentials are random opaque values. Only their SHA-256 hashes are stored, and a refresh atomically rotates the stored hash.
- Browser refresh credentials use an HttpOnly, SameSite=Lax cookie. Mobile refresh credentials are stored with Expo SecureStore. Access tokens are memory-only in both clients.
- Browser cookie endpoints validate the `Origin` header. CORS is configured for the single admin origin.
- Owners have admin access. Staff have no implied permissions and remain denied until staff permission management is implemented.
- Coach operations require the coach role and an active batch assignment. Parent reads require the parent role and a linked guardian record. Owner operations derive academy scope from the authenticated user.
- Parent invite tokens are random, expire after seven days, are usable once, and are stored only as SHA-256 hashes. The raw code is returned only to the owner who creates it. Delivery is manual in this phase.
- Student, guardian, attendance, schedule, and session inputs are validated by shared Zod contracts before repository access.

## Database changes

Database changes are version-controlled under `apps/backend/drizzle`; every migration must have a matching Drizzle journal entry and snapshot. Production migrations are not run from application startup. Local bootstrap is an explicit command and is disabled in production.

## Remaining module boundaries

Finance, progress, notifications, reports, and staff permission administration will be implemented as backend modules. Each module owns its contracts, routes, service rules, persistence, and tests where module complexity justifies that split.

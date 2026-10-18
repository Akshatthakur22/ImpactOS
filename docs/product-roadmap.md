# ImpactOS delivery roadmap

This roadmap treats `Impact_ProSports` as a product reference for workflows that have already been exercised. It does not set a goal to copy that repository's portal structure, PWA behavior, payments, or analytics into this client build.

## Product shape

- One configured academy: Impact Fit Academy.
- Admin web for academy operations.
- One mobile app with role-aware coach and parent experiences.
- A modular monolith: shared contracts, one API, one PostgreSQL database.
- Academy IDs and relationship access are enforced by the API. The clients never choose an academy scope.

## Phase 0 — Foundation

**Status: complete.**

- Login, short-lived access tokens, rotating refresh sessions, and owner bootstrap.
- Admin and mobile shells.
- Disciplines, programs, batches, student records, guardian contacts, and enrollments.
- Shared Zod contracts, academy-scoped persistence, and forward-only migrations.

## Phase 1 — Academy operations

**Status: core flows implemented; client smoke checks remain before calling the phase complete.**

The first usable daily workflow is:

```text
Owner creates and assigns a coach
  → owner configures a batch schedule and creates session occurrences
  → coach sees assigned sessions in mobile and records every student's status
  → owner reviews attendance and records a reason for any correction
  → invited parent sees only linked children, their weekly schedule, and attendance
```

### Included

- Owner-created coach accounts with batch assignments.
- Weekly batch schedule records and date-specific training sessions.
- Coach-only session and roster access, scoped to assigned batches.
- Present, absent, late, and excused attendance with duplicate student entries rejected.
- Session completion only after all enrolled students have a status; coaches cannot edit completed sessions.
- Owner attendance review and corrections with an immutable correction record and required reason.
- One-use, seven-day parent invite codes stored as hashes. Parents choose their own password and can link another child using an existing parent account.
- Parent schedule and attendance reads scoped to linked guardian records.

### Closeout checks

- Apply migrations through Drizzle's journal on a disposable PostgreSQL database.
- Sign in as an owner, create a coach and schedule, and verify a real session on a device or simulator.
- Mark attendance as a coach, then verify owner review and correction history.
- Redeem an invite as a parent and verify linked-child access, including a denied request for an unrelated student.
- Verify session times on the academy's configured timezone and add timezone conversion before onboarding users in another timezone.
- Confirm the parent invite code can be delivered through the academy's chosen contact process; this build does not send email or SMS.

### Explicitly deferred from Phase 1

- Staff permission management. Staff remain denied; owners and the coach/parent role routes are the only enabled roles.
- Automatic creation of future session occurrences. Owners create date-specific sessions from a schedule in this first slice.
- Schedule edit/pause, session cancellation, offline attendance sync, coach location check-in, and push notifications.
- Parent access to student editing or financial records.

## Phase 2 — Fees and balances

- Fee plans, student charges, due dates, manual payment recording, balances, and receipts.
- Keep payment records auditable; add payment gateway integration only after manual collection is stable.

## Phase 3 — Athlete progress

- Coach assessments and notes using academy-defined measures.
- Parent read-only progress view with clear history and visibility rules.

## Phase 4 — Announcements and reminders

- Academy and batch announcements.
- Attendance reminders and parent notifications after delivery preferences and consent are defined.

## Phase 5 — Reporting and administration

- Operational reports, exports, and real dashboard metrics.
- Add expenses only after finance data and reporting needs are established.

## Phase 6 — Production readiness

- Account recovery, staff permission administration, delivery provider setup, monitoring, backups, restore drills, retention/export/deletion workflows, security review, and deployment runbooks.

Avoid adding multi-tenancy, a marketplace, payroll, microservices, Kubernetes, or AI features until the academy's day-to-day operations prove a need for them.

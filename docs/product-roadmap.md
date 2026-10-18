# ImpactOS product roadmap

This roadmap uses `Impact_ProSports` as a reference for academy workflows that have been explored. It does not aim to copy its PWA, portal structure, database, or feature breadth.

## Product shape

- One configured academy: Impact Fit Academy.
- Admin web for academy operations.
- One role-aware mobile app for coaches and parents.
- A modular monolith: shared contracts, one API, one PostgreSQL database.
- Academy and relationship scope is enforced by the API; clients do not choose an academy ID.

## How the older reference informs this build

`Impact_ProSports` shows the workflows you validated: inquiry conversion, coach attendance, parent visibility, fees and receipts, progress notes, announcements, and operational reporting. The new repo carries these workflows into separate admin, API, and mobile apps. Inquiry intake and conversion, scheduling operations, attendance operations, and the first sport-labeled coach assessment/note flow are implemented. Provider-backed messaging, saved reports, and inquiry reporting remain future work.

The reference is a broader Next.js PWA with marketing, staff, and finance areas. ImpactOS is intentionally a single-academy API-backed product. Reuse its user journeys and product learnings, not its route tree or database schema.

## Delivery approach: module first

Continue module by module, with the admin portal as the current focus, then complete coach mobile workflows, then parent mobile workflows. A feature that crosses roles still starts with its shared API contract, persistence, and authorization rules before each client view is added. This gives each client a testable workflow while keeping one source of truth.

The detailed admin inventory, reference mapping, build order, finance decisions, and acceptance criteria are in [admin-implementation-plan.md](./admin-implementation-plan.md). The live dashboard, core student/catalog/coach/admissions/finance workflows, scheduling automation, attendance operations, and first coach progress slices are implemented in code. Staff permissions and token-based password recovery have an initial implementation; recovery delivery requires Resend configuration. Assessment templates, broader reports, and external announcement delivery remain gaps. This module-first sequence supersedes treating phase labels as a gate for the next task; phase groupings remain useful for scope and dependencies.

## Current state

**Foundation and initial feature slices are implemented. Coach/parent sign-in has previously been confirmed on device, but the full session, attendance, invite, and linked-child flows still need device acceptance. The backend suite, workspace type checks, and lint pass as of 2026-10-18. Admin work proceeds module by module; this is not yet pilot approval.**

### Implemented

| Area           | Current capability                                                                                                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity       | Owner bootstrap, login, short-lived access tokens, rotating refresh sessions, logout, and current-user lookup.                                                                                                                                                                                         |
| Academy setup  | Disciplines, programs, batches, students, guardian contacts, and enrollments. Student plus guardian plus initial enrollment creation is transactional.                                                                                                                                                 |
| Admissions     | Owner inquiry queue with lead source and program interest, searchable status/follow-up filters, activity history, due dates, and transactional student/guardian/optional-enrollment conversion.                                                                                                        |
| Admin web      | Login, live academy dashboard, student/guardian lifecycle, catalog editing/capacity management, coach profile lifecycle, schedule/session creation, attendance review/correction, manual fees/expenses, attendance consistency, CSV reports, parent announcements, and academy name/timezone settings. |
| Coach mobile   | Mobile Today, Attendance, Classes, assigned Students, Profile, and notices navigation; assigned sessions; roster attendance; sport-labeled progress entries with parent visibility controls. Coach profile editing and payouts are not implemented.          |
| Parent access  | One-use invite redemption, linked-child list, read-only schedule, attendance, finance records, and in-app academy/batch announcements with read tracking.                                                                                                                                              |
| Backend safety | Shared Zod contracts, academy-scoped queries and foreign keys, Argon2id passwords, hashed refresh/invite tokens, and audited attendance corrections.                                                                                                                                                   |
| Database       | Forward-only migrations include the finance ledger, expense register, announcements/read tracking, and admissions inquiry/activity tables. Migration `0010_married_skin.sql` adds the admissions records.                                                                                              |

### Verification snapshot

- Workspace TypeScript checks pass for shared contracts, backend, admin, and mobile (2026-10-18).
- Repository ESLint passes (2026-10-18).
- Backend integration suite passes: 8 files, 17 tests, including admissions intake, follow-up history, conversion, capacity rollback, academy, operations, parent-access, and migrations (2026-10-18).
- Finance has no dedicated automated integration tests yet; finance-ledger and parent-finance isolation acceptance remains outstanding.
- The one Playwright test covers an owner creating a student and parent invite through mocked API responses. It does not exercise a real backend or the coach/parent mobile journeys.
- Playwright and production build were not run in this verification pass. The prior audit recorded a shared `.next/dev` lock and a Next dev-origin restriction during E2E; rerun with a clean test environment and expand coverage before the pilot.
- The API/local database and physical-device LAN address were not re-smoke-checked in this pass. Confirm the configured mobile API address and complete the coach and parent workflows on academy devices.

## Phase 1 — Academy operations closeout

The intended workflow is implemented:

```text
Owner creates a coach and assigns a batch
  → owner configures a recurring schedule and creates a dated session
  → coach records every student's attendance on mobile
  → owner reviews attendance and can record an audited correction
  → invited parent sees only linked children's schedules and attendance
```

### Closeout gates

1. On the phone, reload the Expo app and verify coach sign-in and session loading using the current reachable API address. The local mobile `.env` address is machine-specific and can change with Wi-Fi.
2. Complete the coach flow on a device: open a session, mark students, finish attendance, then confirm it appears in admin review.
3. Correct one attendance record as owner and verify its history contains the old value, new value, reason, actor, and time.
4. Redeem a parent invite, confirm the linked child's schedule and attendance, and confirm an unrelated child cannot be read.
5. Rerun the browser E2E test in a clean test environment and add coverage for coach/parent-critical screens or record an equivalent repeatable device smoke procedure.
6. Verify dates and times and offline attendance recovery on academy devices. Scheduling and attendance use the configured academy timezone; device acceptance remains open.

### Known Phase 1 limits

- Batch coach assignments still cannot be unassigned.
- Parent invite codes are shown once for manual delivery; the app does not send email or SMS.
- Attendance now has a secure local retry queue, session-first review, filters, summaries, and CSV export. Push attendance alerts are wired for owner/staff devices; EAS project and Apple/Google credentials are required for delivery.
- Staff permissions are API-enforced and owner-managed; email recovery requires Resend configuration. Additional staff lifecycle audit coverage remains.
- The current E2E check is a mocked admin journey, not a real-backend or native-app test.

Do not add these deferred features just to declare Phase 1 complete. The closeout is about proving the implemented workflow works on the intended clients.

## Finance module — first slice implemented

**Built:** owners can create manual student invoices, accept partial cash/UPI/bank payments, and record receipts. Discounts and full waivers require a reason; overpayments are rejected; refunds are tracked as reversals; invoice voids preserve a reason and are allowed only before any receipt exists. The parent mobile workspace exposes linked-child invoices and receipts as read-only. Academy expenses can be recorded, reversed with a reason, summarized by period, and exported to CSV.

**Still needed:** run database-backed finance and parent-scope acceptance; get the academy owner to approve receipt contents and expense categories; broaden exports to attendance/enrollment/admissions; then design Razorpay verification and reconciliation. Coach payables/payouts remain intentionally blank until the owner agrees how coach compensation should work. The `Impact_ProSports` implementation is reference material only for that decision.

**Approved defaults:** manual monthly/term student charges; partial payments by cash, UPI, or bank transfer; reasoned discounts/waivers; refund reversals; no overpayments; parents read-only.

## Later phases

### Phase 3 — Athlete progress

**First slice built:** coaches can add sport-labeled assessment results or notes to a session and explicitly choose parent visibility; owners review entries in Analytics and parents see only shared entries for linked children. Coaches use free-form assessment names and values. Academy-defined measurement templates, trend charts, edit/correction history, and offline note capture remain.

### Phase 4 — Announcements and reminders

Parent in-app academy/batch announcements are available as an initial slice. Attendance or fee reminders and email/SMS/push still require consent and delivery preferences, then a delivery queue, retries, delivery logs, and one configured channel at a time.

### Phase 5 — Reports and administration

Saved reports, inquiry reporting, configurable exports, academy-defined assessment templates, and fuller academy settings remain. Attendance, student directory, finance summary, and expense exports have first slices. Defer coach payouts until the academy defines the compensation rules.

### Phase 6 — Production readiness

Configured account recovery and staff permissions now have initial implementation; sanitized server diagnostics, monitoring, backups and restore drills, retention/export/deletion workflows, security review, production bootstrap, and deployment runbooks remain. These controls are prerequisites for real production data, not a substitute for product acceptance.

Keep the focused product shape. Defer multi-academy SaaS, marketplace, payroll, microservices, Kubernetes, and AI until actual academy operations demonstrate a need.

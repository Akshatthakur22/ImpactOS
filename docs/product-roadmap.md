# ImpactOS product roadmap

This roadmap uses `Impact_ProSports` as a reference for academy workflows that have been explored. It does not aim to copy its PWA, portal structure, database, or feature breadth.

## Product shape

- One configured academy: Impact Fit Academy.
- Admin web for academy operations.
- One role-aware mobile app for coaches and parents.
- A modular monolith: shared contracts, one API, one PostgreSQL database.
- Academy and relationship scope is enforced by the API; clients do not choose an academy ID.

## How the older reference informs this build

`Impact_ProSports` shows the workflows you validated: inquiry conversion, coach attendance, parent visibility, fees and receipts, progress notes, announcements, and operational reporting. The new repo carries attendance and parent schedule/history paths into separate admin, API, and mobile apps. The admin now has an initial attendance consistency view, reports from live records, in-app parent announcements, and academy profile/timezone settings. These first slices do not include athlete assessments, provider-backed messaging, saved reports, or inquiries yet.

The reference is a broader Next.js PWA with marketing, staff, and finance areas. ImpactOS is intentionally a single-academy API-backed product. Reuse its user journeys and product learnings, not its route tree or database schema.

## Delivery approach: module first

Continue module by module, with the admin portal as the current focus, then complete coach mobile workflows, then parent mobile workflows. A feature that crosses roles still starts with its shared API contract, persistence, and authorization rules before each client view is added. This gives each client a testable workflow while keeping one source of truth.

The detailed admin inventory, reference mapping, build order, finance decisions, and acceptance criteria are in [admin-implementation-plan.md](./admin-implementation-plan.md). The live dashboard, core student/catalog/coach/finance workflows, and first performance/reporting/communication/settings slices are implemented in code. Inquiry management, sport assessments, broader reports, external message delivery, and staff permissions remain gaps. This module-first sequence supersedes treating phase labels as a gate for the next task; phase groupings remain useful for scope and dependencies.

## Current state

**Phase 0 is complete. Core Phase 1 paths exist in code, and coach/parent sign-in has been confirmed on device. Their complete session, attendance, invite, and linked-child flows still need acceptance. Admin work now proceeds module by module rather than waiting for a phase-wide closeout.**

### Implemented

| Area           | Current capability                                                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity       | Owner bootstrap, login, short-lived access tokens, rotating refresh sessions, logout, and current-user lookup.                                                                                                                        |
| Academy setup  | Disciplines, programs, batches, students, guardian contacts, and enrollments. Student plus guardian plus initial enrollment creation is transactional.                                                                                |
| Admin web      | Login, live academy dashboard, student/guardian lifecycle, catalog editing/capacity management, coach profile lifecycle, schedule/session creation, attendance review/correction, manual fees/expenses, attendance consistency, CSV reports, parent announcements, and academy name/timezone settings. |
| Coach mobile   | Assigned upcoming sessions, batch roster, present/absent/late/excused marking, and session completion.                                                                                                                                |
| Parent access  | One-use invite redemption, linked-child list, read-only schedule, attendance, finance records, and in-app academy/batch announcements with read tracking.                                                                               |
| Backend safety | Shared Zod contracts, academy-scoped queries and foreign keys, Argon2id passwords, hashed refresh/invite tokens, and audited attendance corrections.                                                                                  |
| Database       | Forward-only migrations include the finance ledger, expense register, announcements, and announcement read tracking. Migration `0007_admin_workspace_modules.sql` is applied to the local database. |

### Verification snapshot

- Focused TypeScript checks pass for shared contracts, backend, admin, and mobile after the finance slice.
- ESLint passes for the finance, parent mobile, and touched backend files.
- No automated tests were run for the finance slice; database-backed finance and parent-scope acceptance remains outstanding.
- Backend suite passes: 7 files, 16 tests, including academy, operations, parent-access, and migration flows.
- The one Playwright test covers an owner creating a student and parent invite through mocked API responses. It does not exercise a real backend or the coach/parent mobile journeys.
- Playwright did not complete in this audit: the running admin dev server holds the shared `.next/dev` lock, and a localhost proxy workaround hit Next's dev-origin restriction. Rerun with the admin dev server stopped or configure an isolated Next build directory for E2E. The test's coverage should also be expanded before the pilot.
- The API and local database were smoke-checked, but the corrected mobile LAN address still needs confirmation on the physical phone.

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
6. Verify dates and times on academy devices. The academy timezone defaults to `Asia/Kolkata`; the current clients format timestamps using the device timezone, so that assumption should be tested and made explicit before users operate from other timezones.

### Known Phase 1 limits

- Owners create each dated session manually; recurring schedules do not generate sessions automatically.
- Coaches and schedules can be created and assigned, but the admin UI does not yet support the full edit/deactivate/unassign lifecycle.
- Parent invite codes are shown once for manual delivery; the app does not send email or SMS.
- Attendance has no offline queue or push notifications.
- Staff accounts remain denied; the existing permission table is not yet an active staff-permission system.
- The current E2E check is a mocked admin journey, not a real-backend or native-app test.

Do not add these deferred features just to declare Phase 1 complete. The closeout is about proving the implemented workflow works on the intended clients.

## Finance module — first slice implemented

**Built:** owners can create manual student invoices, accept partial cash/UPI/bank payments, and record receipts. Discounts and full waivers require a reason; overpayments are rejected; refunds are tracked as reversals; invoice voids preserve a reason and are allowed only before any receipt exists. The parent mobile workspace exposes linked-child invoices and receipts as read-only. Academy expenses can be recorded, reversed with a reason, summarized by period, and exported to CSV.

**Still needed:** run database-backed finance and parent-scope acceptance; get the academy owner to approve receipt contents and expense categories; broaden exports to attendance/enrollment/admissions; then design Razorpay verification and reconciliation. Coach payables/payouts remain intentionally blank until the owner agrees how coach compensation should work. The `Impact_ProSports` implementation is reference material only for that decision.

**Approved defaults:** manual monthly/term student charges; partial payments by cash, UPI, or bank transfer; reasoned discounts/waivers; refund reversals; no overpayments; parents read-only.

## Later phases

### Phase 3 — Athlete progress

Coach assessments and notes using academy-defined measures; parent read-only progress history. The current performance page summarizes attendance only. Define who can see each note and how corrections are retained before exposing coach notes to families.

### Phase 4 — Announcements and reminders

Parent in-app academy/batch announcements are available as an initial slice. Attendance or fee reminders and email/SMS/push still require consent and delivery preferences, then a delivery queue, retries, delivery logs, and one configured channel at a time.

### Phase 5 — Reports and administration

Saved reports, inquiry reporting, configurable exports, fuller academy settings, and staff permissions remain. Attendance, student directory, finance summary, and expense exports have first slices. Defer coach payouts until the academy defines the compensation rules.

### Phase 6 — Production readiness

Account recovery, explicit staff permissions, sanitized server diagnostics, monitoring, backups and restore drills, retention/export/deletion workflows, security review, production bootstrap, and deployment runbooks. These controls are prerequisites for real production data, not a substitute for product acceptance.

Keep the focused product shape. Defer multi-academy SaaS, marketplace, payroll, microservices, Kubernetes, and AI until actual academy operations demonstrate a need.

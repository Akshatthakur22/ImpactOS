# Admin portal implementation plan

**Product:** SportDesk for Impact Fit Academy  
**Reference:** `Impact_ProSports` admin portal and the SportDesk Master Product & Technical Blueprint  
**Planning status:** Active; admin workflows are being delivered module by module

## Delivery approach

Work module by module, with one client experience as the immediate focus:

1. Complete the admin web workflows against the shared API and database.
2. Close the coach mobile workflows against those same records.
3. Close the parent mobile workflows and their linked-child access.

For any feature used by more than one role, build and validate the backend rules and shared contract first, then finish the admin workflow, then expose the permitted coach or parent view. This makes each client easier to exercise without creating separate or inconsistent sources of truth. It is a delivery order, not a reason to defer required access controls or cross-client data rules.

## Admin app structure

The admin app uses Next.js route groups to organize auth and workspace routes without adding group names to URLs. The dashboard group owns the shared workspace layout. Route pages stay thin and load the UI from feature folders; shared auth, layout, form, table, and styling code lives in its own folders.

```text
apps/admin/src/
├── app/
│   ├── (auth)/login/
│   ├── (auth)/forgot-password/
│   ├── (dashboard)/dashboard/
│   ├── (dashboard)/students/
│   ├── (dashboard)/coaches/
│   ├── (dashboard)/operations/
│   ├── (dashboard)/finance/
│   ├── (dashboard)/analytics/
│   ├── (dashboard)/notices/
│   └── (dashboard)/settings/
├── components/{forms,layout,tables,ui}/
├── features/{auth,attendance,branches,coaches,dashboard,finance,notices,performance,programs,reports,schedule,settings,students}/
├── hooks/
├── lib/
├── providers/
└── styles/
```

Route groups do not change the public URLs. The dashboard layout owns the shared navigation and session gate. Operations and analytics each have one canonical route with internal tabs. Legacy `/programs`, `/batches`, `/schedule`, `/attendance`, `/performance`, `/reports`, and `/notifications` paths redirect into their corresponding tab in the consolidated route. `/fees` and `/expenses` remain small compatibility routes that open the matching Finance tab.

### Simplified owner navigation

The owner sidebar presents eight destinations: Dashboard, Students, Coaches & classes, Academy operations, Finance, Analytics, Notices, and Settings. Academy operations combines programs and batches, branches, the recurring schedule, and attendance. Analytics combines attendance-based performance and report exports. Finance remains the connected student ledger and expense register. On mobile, the five most-used areas stay in the navigation row and the remaining three are under More.

Notices are stored in the academy database and support everyone, parents, or coaches; parents and coaches can also be targeted by batch. Published notices appear in the matching mobile app feed with read tracking. Delivery is in-app only. Branch records can be created and deactivated, and recurring schedules can be assigned to a branch. Branch-scoped reports and per-session emergency coach replacement remain future work and are not presented as available controls.

This is the app organization, not a claim that every blueprint module is complete. The first performance view is based on attendance records; athlete assessments and coach evaluations still need a product model. Notices are in-app messages for parents and coaches; no external delivery provider is connected. Email password recovery is also unavailable; its route currently explains the academy's account-recovery path instead of pretending an email was sent.

## Audit: current admin baseline

| Area                       | Present in this repo                                                                                                                                              | Main gap                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in and shell          | Owner login, session refresh/logout, owner-only admin routes, responsive navigation                                                                               | Staff accounts and a full user lifecycle are not enabled                                                                                         |
| Dashboard                  | Live enrollment/coach/program/batch totals, academy-local sessions and attendance, recent attendance, quick actions                                               | No finance or inquiry metrics, trend reports, or configurable widgets; deeper admin workflows remain incomplete                                 |
| Students and guardians     | Registration; paged search and status filters; edit student/guardian contact; enrollment end/re-enrollment; invite state, issue/reissue and revoke                | Shared guardian/child linking, emergency details/documents, student-status audit history, bulk workflows, and broader admission pipeline remain |
| Programs and batches       | Create/list and edit/activate/archive disciplines, programs and batches; active roster counts and capacity validation                                             | Batch coach detail/assignment context, schedule linkage, and batch-specific operational review remain                                           |
| Coaches                    | Create coach account/profile; edit name/contact/specializations; activate/deactivate; assign to batches                                                           | No unassign flow, coach detail/history, or compensation workflow                                                                                |
| Schedule and sessions      | Add recurring batch schedule and create a dated session                                                                                                           | No calendar, schedule edit/deactivation, session reschedule/cancel, or recurring session generation                                             |
| Attendance                 | Review records by date, correct with a reason, inspect correction history                                                                                         | No session-first workflow, summaries/exports or clear unmarked-session queue                                                                    |
| Finance                    | Manual student invoices; partial cash/UPI/bank receipts; discounts/waivers with reasons; refund reversals; parent read-only statement; expenses and period export | No Razorpay checkout/webhooks yet; coach compensation deliberately deferred                                                                     |
| Admissions                 | Student records can be created directly                                                                                                                           | No inquiry/admissions pipeline or lead source exists in the current schema                                                                      |
| Progress and communication | No assessment, announcement or notification module                                                                                                                | Define visibility and consent rules before adding these records                                                                                 |
| Performance and reports    | Attendance consistency view; CSV attendance, student directory, finance summary, and expense exports                                                              | No discipline-specific assessments, saved report builder, inquiry analytics, or configurable scheduled exports                                 |
| Notifications and settings | Parent in-app announcements with drafts/publish/archive/read tracking; academy name and timezone editor; currency shown read-only                                     | No email/SMS/push delivery, notification preferences, staff permissions, or editable currency                                                     |

### Blueprint coverage

The blueprint lists 12 admin areas. The repository does **not** yet implement all of them end to end:

| Blueprint module                     | Current state                                                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication and user management   | Owner sign-in and session handling exist; staff access, reset flow, and full user lifecycle are missing.                                                                               |
| Academy dashboard                    | Live operational first pass exists; finance, admissions, activity, and trend metrics await their source records.                                                                       |
| Admissions and student management    | Registration and basic student/guardian/enrollment lifecycle exist; inquiry intake/conversion and complete record history remain.                                                      |
| Sports, programs, batches, schedules | Create/list and basic scheduling exist; edit/archive, calendar, and occurrence generation remain.                                                                                      |
| Coach management                     | Create, assign, edit, and activate/deactivate exist; unassign and broader profile/account workflows remain.                                                                            |
| Attendance                           | Coach recording and owner correction exist; admin session queue, filters, reports, and export remain.                                                                                  |
| Fees, invoices, payments             | Manual student charges, partial offline receipts, discount/waiver reasons, refund reversals, invoice void audit, and linked-child read-only access are implemented as the first slice. |
| Expenses                             | Paid academy expense records, reasoned reversal, period totals, and CSV report are implemented as the first slice.                                                                     |
| Athlete progress                     | Attendance-derived consistency view exists; sport-specific assessments, coach evaluations, and progress notes need a defined model.                                                    |
| Notifications and announcements      | Owner-authored parent announcements are persisted, target all parents or a batch, publish to the parent app, and track reads; email/SMS/push is not connected.                         |
| Reports and exports                  | Date-filtered attendance and finance summary CSV plus current student directory CSV use live API records; saved/custom report builder remains.                                           |
| Academy settings                     | Owner can update academy name and IANA timezone; currency and slug are read-only; staff permissions remain unavailable.                                                                  |

This is a truthful scope check against the attached SportDesk blueprint, not a claim of production readiness. “Implemented” below means the code path exists; device, browser, operational-policy, and production acceptance still need to be completed.

The current data model supports academy-scoped operational metrics, a first finance ledger, and parent announcements. The additive notification schema migration is `0007_admin_workspace_modules.sql` and has been applied to the local `sportdesk` database. Revenue, outstanding balances, refunds, and expenses come from finance records. Inquiry and sport-specific progress metrics remain unavailable until their source records exist.

## Reference findings

The older `Impact_ProSports` portal is a useful reference for the work an academy administrator needs to reach quickly:

- A compact overview with key counts and links to common tasks.
- Student, coach, attendance, inquiry, finance, analytics and settings areas.
- Search/filter workflows, status views, action queues and period-based analytics.
- Clear summaries that help an owner decide what to work on next.
- Admissions intake and conversion, used as a reference for a future inquiry lifecycle.

Use those journeys and information hierarchy as product evidence. Do not copy its route tree, PWA assumptions, legacy API, database, payment provider setup, or metrics. SportDesk revenue and expenses must come from the new ledger; legacy inquiries, coach payouts, and profit remain reference-only until their rules and records exist here.

## Admin build order and acceptance

### 1. Academy dashboard — implemented; device/browser acceptance pending

**Built:** live active enrollment, active coach, active program/batch and today's session counts; academy-local attendance totals; a list of today's sessions with assigned coaches and marked/expected attendance; recent attendance; shortcuts to operational pages.

**Acceptance:** Every number is derived from academy-scoped database records; dates use the academy timezone; loading, empty and API error states are clear; the dashboard never invents finance or admissions metrics; owner access remains enforced on the server.

### 2. Student and guardian management — lifecycle slice implemented; broader module in progress

**Built:** academy-scoped paged search/status filters; student detail editor; guardian contact editor; enrollment history with end and new enrollment actions; invite state, one-time issue/reissue, and revocation. Suspending, completing, or withdrawing a student closes active enrollments transactionally.

**Remaining:** shared guardian linking across siblings, admissions inquiry conversion, emergency-contact policy, audit history for student profile/status changes, and acceptance against a running API/device.

**Acceptance:** Updates preserve enrollment and guardian history; parent identity never grants access to an unlinked student; invites are one-use and never expose stored tokens after creation.

### 3. Programs, batches and assignments — catalog lifecycle slice implemented; module in progress

**Built:** edit names and active state for disciplines, programs, and batches; manage batch capacity; display active enrollment counts. The API prevents archiving a discipline/program with active child records, prevents archiving a batch with active enrollments, blocks capacity below current enrollment, and refuses new records/enrollments under inactive catalog parents.

**Remaining:** batch detail with roster/schedule context and coach assignment lifecycle from the batch view.

**Acceptance:** Historical attendance and enrollment remain readable; inactive records cannot receive new assignments; capacity and duplicate-assignment rules are enforced by the API.

### 4. Coach administration

**Built:** coach list, contact/specialization editing, active/inactive lifecycle, assigned batch view, and session revocation when a coach is deactivated.

**Remaining:** unassigning a coach, useful coach detail/history, and the account-recovery workflow. Coach compensation is deferred until the owner defines it.

**Acceptance:** Deactivation prevents new coach actions without erasing historical session/attendance attribution; access changes revoke existing sessions.

### 5. Schedule and session operations

**Build:** daily/weekly calendar, schedule editing/deactivation, session creation from schedules, safe reschedule/cancel flow, and repeatable generation of session occurrences.

**Acceptance:** Sessions are stored as UTC instants and shown in the academy timezone; cancelled sessions are not treated as absences; duplicate generation is prevented.

### 6. Attendance oversight

**Build:** session-centric review, unmarked/incomplete queue, date/batch/coach filters, status summaries, audited correction history, and a useful export.

**Acceptance:** Corrections always retain prior/new status, reason, actor and timestamp; only authorized sessions can be changed; cancelled sessions are excluded from attendance rates.

### 7. Fees, payments, and expenses — first slice implemented

**Built:** manual per-student monthly/term charge entry; integer-paise amounts; partial cash, UPI, and bank-transfer receipts; per-academy invoice/receipt numbers; reasoned discounts and full waivers; balance-derived open/paid/overdue views; idempotent payment/refund requests; refund reversals; invoice voiding only when no receipt history exists; owner-only paid-expense register with reasoned reversals; period finance summary; CSV period/expense export; and a parent read-only ledger for linked children.

**Approved finance rules:** charges are created manually per student and period; partial payments are allowed; methods are cash, UPI, and bank transfer; discounts/waivers require a reason; overpayments are rejected; refunds are recorded as reversals; parents only read their linked children's records.

**Deferred:** Razorpay checkout, payment webhooks, automatic recurring invoices, coach salary/payable/payout workflows, and broad profit/accounting statements. The coach compensation model has not been agreed with the academy owner, so no coach money workflow is being implemented. Keep Razorpay out of the trusted ledger until server-side payment verification, idempotency, and reconciliation behavior are designed.

**Acceptance still required:** exercise create/partial/full payment/refund/void/expense flows against the migrated local database, inspect parent isolation on the mobile app, and review receipt/CSV format with the owner before live use.

### 8. Admissions, progress and communication

- **Admissions next:** add an inquiry queue with source, contact details, status, notes, next follow-up, and a transactional conversion into a student plus optional enrollment. Keep replies as saved drafts until a real message provider and consent flow exist; do not claim a draft was sent.
- **Progress:** define discipline-specific assessments, who can see each note, and how amendments are retained before a parent view is exposed.
- **Communication:** in-app notices now support academy-wide, parent, and coach audiences, including batch targeting for parents or assigned coaches. Add external delivery only after consent, delivery preferences, retries, and provider delivery history are designed.

### 9. Reports, settings and staff permissions

**Built first:** attendance and finance summary CSV exports, a privacy-aware student directory export, academy name/timezone settings, and parent announcements. Currency remains read-only to protect existing ledger records.

**Next:** inquiry pipeline and conversion; filterable/saved attendance and enrollment reports; sport-specific assessments and progress history; staff accounts with API-enforced permissions; and provider-backed notification delivery.

**Acceptance:** exports use the same scope and filters as the visible report; settings validate IANA timezone; staff permissions are checked by the API and verified for record-level boundaries; parents only receive academy-wide or batch-specific announcements they are entitled to see.

## Cross-cutting definition of done

- The user can finish the intended task through the admin UI and the saved result appears on the correct mobile view where applicable.
- API contracts validate input and output; the server enforces owner/role/academy scope.
- Important history is attributable; financial and attendance records are not silently overwritten.
- Lists have sensible search/filter/pagination behavior as data grows.
- Every screen handles loading, empty, success and failure states.
- No dashboard card shows sample, inferred or unavailable data as a real metric.
- User-facing time ranges are derived from the academy timezone.
- The implementation is documented and can be exercised through the agreed module-specific smoke flow.

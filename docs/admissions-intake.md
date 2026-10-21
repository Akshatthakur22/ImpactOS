# Admissions intake integration

## Public website form

Configure `PUBLIC_ADMISSIONS_ACADEMY_ID` with the UUID of the academy this form serves and `PUBLIC_ADMISSIONS_WEB_ORIGIN` with the exact website origin (scheme and host, without a path). These values stay on the API server. The API accepts `POST /api/v1/public/admissions/inquiries`, applies a 12-request-per-15-minute per-IP limit, and caps JSON bodies at 32 KB.

The form must send a stable `Idempotency-Key` (at least 16 characters) for each logical submission and reuse it on retries. Example body:

```json
{
  "studentFirstName": "Aarav",
  "studentLastName": "Singh",
  "contactName": "Meera Singh",
  "contactEmail": "meera@example.com",
  "relationship": "Parent",
  "consent": true,
  "website": ""
}
```

`website` is a honeypot field and must be left empty. The API derives academy and source (`Website`) on the server. It returns `202 { "data": { "received": true } }` for a newly accepted or already processed key; it does not return inquiry IDs or personal data. A valid email or phone number is required. Optional `programId` must belong to the configured academy and refer to an active program.

## Duplicate review and conversion

The submission key is unique within academy and source. A retry with the same key will not create another inquiry. Matching normalized email or phone in the same academy marks the new inquiry `needsReview`; it does not merge or discard records, so families can inquire for multiple children. Staff conversion continues through the authenticated, transactional admissions workflow.

## Metrics

The Admissions overview uses live records. “New inquiries · 30 days” and source counts use inquiry creation time in the academy's last 30 calendar days. “Converted · 30 days” uses the inquiry's updated time for records currently in converted status; the conversion rate is the share of inquiries created in that 30-day cohort that are currently converted. Awaiting first contact means status `new` with no activity rows. Follow-up due/overdue compare the scheduled instant against the academy's current calendar day.

## Google Forms

Google Forms synchronization is **not implemented yet**. The repository does not identify a linked response sheet, a stable Google response identifier, a service account, an academy mapping, or a deployment scheduler. Before enabling it, link the form to a Google Sheet, choose service-account or OAuth access limited to that spreadsheet, define and verify a header-to-field mapping, and select a scheduler supported by the API deployment. Do not put Google credentials in the admin or mobile environment files. No sync is reported as live by the current API.

## Migration and local verification

The additive migration is `apps/backend/drizzle/0017_admissions_intake.sql`; apply it through the existing Drizzle migration command after reviewing the target database. Do not run it against production without the normal deployment approval process. The migration integration test applies every SQL migration to disposable PGlite and checks the schema registry.

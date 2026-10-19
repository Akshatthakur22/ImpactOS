# Security baseline

- Never commit `.env` files or frontend database credentials.
- The API validates its required environment at startup and fails closed if the JWT secret is absent or shorter than 32 characters.
- Keep refresh credentials out of browser storage and ordinary mobile storage.
- Load the current role and active session from the database for each protected API request.
- Scope all records to the authenticated user's allowed relationships in the module that owns them.
- Academy record routes derive `academy_id` from the authenticated principal. Composite foreign keys keep creators and linked academy records in the same academy.
- Coach operations require a coach role and an active coach-to-batch assignment. Parent schedule and attendance reads require a linked guardian-to-student relationship; unlinked student requests return no record.
- Owners alone can correct attendance. The backend requires a reason and writes a correction row in the same transaction as the updated attendance status. Coaches cannot edit records once their session is complete.
- Parent invite tokens are random, stored as SHA-256 hashes, expire after seven days, and can be redeemed once. Parent accounts set their own password. The invite code is returned once to the owner; delivery is currently handled by the academy outside the app.
- Staff permissions are stored per academy, returned with the authenticated user, and managed by owners. Route handlers that use `requirePermission` enforce the grants server-side; keep new staff-accessible routes on that path and leave sensitive operations owner-only where appropriate.
- The current student form collects names and optional guardian name/contact only. It does not collect date of birth or medical details.
- Do not rely on frontend navigation or hidden buttons for authorization.
- Do not return internal exception details to clients or log request bodies, passwords, or tokens.
- Configure `TRUST_PROXY_HOPS` only when the deployment proxy is known and controlled.
- The current login rate limiter uses the in-process store. Before horizontal scaling, replace it with a shared store or database-backed limiter.
- Use only synthetic data in development and tests. Do not connect local scripts to production.
- Child-related AI processing is not included. No student or guardian data is sent to AI services.

## Before first production release

Add account recovery and verification requirements, staff permission management, CSRF tests for deployed origins, audit trails, retention/export/deletion workflows, dependency scanning, security review, backup restoration tests, and an operational owner bootstrap procedure that does not use the local-only command.

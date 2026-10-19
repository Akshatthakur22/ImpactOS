import { expect, test } from "@playwright/test";

const owner = {
  id: "f121f5c1-e5e8-4c17-9df1-271cad62b265",
  academyId: "1121f5c1-e5e8-4c17-9df1-271cad62b265",
  email: "owner@impactfit.example",
  displayName: "Impact Owner",
  role: "owner",
  academyName: "Impact Fit Academy",
};

const authData = {
  accessToken: "synthetic-access-token-for-browser-test",
  expiresAt: "2026-10-17T12:15:00.000Z",
  user: owner,
};

function corsHeaders() {
  return {
    "access-control-allow-origin": "http://127.0.0.1:3200",
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS",
    "access-control-allow-headers": "Content-Type,Authorization",
    "content-type": "application/json",
  };
}

test("owner signs in and registers a student into an academy batch", async ({ page }) => {
  let signedIn = false;
  let loginPayload: unknown;
  let students: unknown[] = [];

  await page.route("http://localhost:4000/api/v1/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders() });
      return;
    }
    if (pathname.endsWith("/auth/refresh")) {
      await route.fulfill({
        status: signedIn ? 200 : 401,
        headers: corsHeaders(),
        body: JSON.stringify(
          signedIn
            ? { data: authData }
            : { error: { code: "INVALID_SESSION", message: "Session is invalid or expired." } },
        ),
      });
      return;
    }
    if (pathname.endsWith("/auth/login")) {
      loginPayload = request.postDataJSON();
      signedIn = true;
      await route.fulfill({
        status: 200,
        headers: {
          ...corsHeaders(),
          "set-cookie":
            "sportdesk_refresh=synthetic-refresh-token; HttpOnly; SameSite=Lax; Path=/api/v1/auth",
        },
        body: JSON.stringify({ data: authData }),
      });
      return;
    }
    if (pathname.endsWith("/admin/overview")) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders(),
        body: JSON.stringify({
          data: {
            academyName: owner.academyName,
            user: owner,
            timezone: "Asia/Kolkata",
            metrics: {
              activeStudents: students.length,
              pendingStudents: 0,
              activeCoaches: 1,
              activePrograms: 1,
              activeBatches: 1,
              sessionsToday: 0,
              scheduledSessionsToday: 0,
              completedSessionsToday: 0,
              cancelledSessionsToday: 0,
              attendanceToday: {
                expected: 0,
                marked: 0,
                present: 0,
                absent: 0,
                late: 0,
                excused: 0,
                toRecord: 0,
              },
            },
            todaySessions: [],
            recentAttendance: [],
          },
        }),
      });
      return;
    }
    if (pathname.endsWith("/academy/catalog")) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders(),
        body: JSON.stringify({
          data: {
            disciplines: [
              { id: "8b5c67e0-6fc0-4876-bac4-1fe16058cb33", name: "Wushu", isActive: true },
            ],
            programs: [
              {
                id: "f8ef6e73-606a-4fd5-9b4f-2e2dd0d6eb4a",
                name: "Foundations",
                disciplineId: "8b5c67e0-6fc0-4876-bac4-1fe16058cb33",
                disciplineName: "Wushu",
                isActive: true,
              },
            ],
            batches: [
              {
                id: "b26f524f-e606-42eb-a46e-a264ae392c63",
                name: "Morning group",
                programId: "f8ef6e73-606a-4fd5-9b4f-2e2dd0d6eb4a",
                programName: "Foundations",
                disciplineName: "Wushu",
                capacity: 12,
                activeEnrollmentCount: students.length,
                isActive: true,
              },
            ],
          },
        }),
      });
      return;
    }
    if (pathname.endsWith("/students") && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ data: { students } }),
      });
      return;
    }
    if (pathname.endsWith("/students") && request.method() === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const created = {
        id: "fe230ce7-4985-4d8b-8b6c-379251198424",
        firstName: payload.firstName,
        lastName: payload.lastName,
        status: payload.status,
        createdAt: "2026-10-17T12:00:00.000Z",
        guardians: payload.guardian
          ? [
              {
                id: "da2aac1a-5d83-4b6b-af9d-065e0883a8e7",
                name: (payload.guardian as Record<string, unknown>).name,
                relationship: (payload.guardian as Record<string, unknown>).relationship,
                email:
                  ((payload.guardian as Record<string, unknown>).email as string | undefined) ??
                  null,
                hasAccount: false,
              },
            ]
          : [],
        enrollments: payload.batchId
          ? [
              {
                id: "78ee7f03-598d-41d6-99ee-9fa7c26e6e39",
                batchId: payload.batchId,
                batchName: "Morning group",
                programName: "Foundations",
                status: "active",
              },
            ]
          : [],
      };
      students = [...students, created];
      await route.fulfill({
        status: 201,
        headers: corsHeaders(),
        body: JSON.stringify({ data: created }),
      });
      return;
    }
    if (pathname.endsWith(`/guardians/da2aac1a-5d83-4b6b-af9d-065e0883a8e7/invites`)) {
      await route.fulfill({
        status: 201,
        headers: corsHeaders(),
        body: JSON.stringify({
          data: {
            token: "invite-token-for-browser-test-01234567890123456789012345",
            email: "nisha@example.test",
            expiresAt: "2026-10-24T12:00:00.000Z",
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      headers: corsHeaders(),
      body: JSON.stringify({ error: { code: "NOT_FOUND", message: "Not found." } }),
    });
  });

  await page.goto("/login");
  await page.getByLabel("Email address").fill(owner.email);
  await page.getByLabel("Password").fill("synthetic-local-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Welcome, Impact" })).toBeVisible();
  await expect(page.getByText("Impact Fit Academy").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Active students" })).toBeVisible();
  expect(loginPayload).toEqual({
    email: owner.email,
    password: "synthetic-local-password",
    clientType: "web",
  });
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);

  await page.getByRole("link", { name: "Students & guardians", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Students & guardians" })).toBeVisible();
  await page.getByLabel("First name").fill("Aarav");
  await page.getByLabel("Last name").fill("Mehta");
  await page.getByLabel("Name", { exact: true }).fill("Nisha Mehta");
  await page.getByLabel("Email (optional)").fill("nisha@example.test");
  await page.getByLabel("Initial batch").selectOption("b26f524f-e606-42eb-a46e-a264ae392c63");
  await page.getByRole("button", { name: "Register student" }).click();
  await expect(
    page.getByRole("row", { name: /Aarav Mehta.*Nisha Mehta.*Morning group/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Issue / reissue", exact: true }).click();
  await expect(page.getByText("Parent invite code")).toBeVisible();
  await expect(
    page.getByText("invite-token-for-browser-test-01234567890123456789012345"),
  ).toBeVisible();
});

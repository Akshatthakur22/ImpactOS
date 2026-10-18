import { eq } from "drizzle-orm";
import { loadEnv } from "../config/env.js";
import { createDatabase } from "./client.js";
import { academies, users } from "./schema.js";
import { passwordHasher } from "../modules/auth/password.js";

async function bootstrap() {
  const env = loadEnv();
  if (env.NODE_ENV === "production") {
    throw new Error("This local bootstrap command is disabled in production.");
  }

  const name = process.env.ACADEMY_NAME?.trim();
  const slug = process.env.ACADEMY_SLUG?.trim().toLowerCase();
  const email = process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
  const displayName = process.env.BOOTSTRAP_OWNER_NAME?.trim();
  const password = process.env.BOOTSTRAP_OWNER_PASSWORD;

  if (!name || !slug || !email || !displayName || !password) {
    throw new Error(
      "Set ACADEMY_NAME, ACADEMY_SLUG, BOOTSTRAP_OWNER_EMAIL, BOOTSTRAP_OWNER_NAME, and BOOTSTRAP_OWNER_PASSWORD.",
    );
  }
  if (password.length < 14) {
    throw new Error("The bootstrap owner password must contain at least 14 characters.");
  }

  const database = createDatabase(env.DATABASE_URL);
  try {
    const [existingUser] = await database.db.select({ id: users.id }).from(users).limit(1);
    if (existingUser) throw new Error("Bootstrap stopped: at least one user already exists.");

    const [existingAcademy] = await database.db
      .select({ id: academies.id })
      .from(academies)
      .where(eq(academies.slug, slug))
      .limit(1);
    const passwordHash = await passwordHasher.hash(password);

    await database.db.transaction(async (transaction) => {
      let academyId = existingAcademy?.id;
      if (!academyId) {
        const [academy] = await transaction
          .insert(academies)
          .values({ name, slug })
          .returning({ id: academies.id });
        if (!academy) throw new Error("Academy bootstrap failed.");
        academyId = academy.id;
      }
      await transaction.insert(users).values({
        academyId,
        email,
        passwordHash,
        displayName,
        role: "owner",
      });
    });
    console.log("Local academy owner bootstrap completed.");
  } finally {
    await database.close();
  }
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Bootstrap failed.";
  console.error(message);
  process.exitCode = 1;
});

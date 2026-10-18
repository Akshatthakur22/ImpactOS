import { randomBytes } from "node:crypto";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createAuthRepository } from "./db/auth.repository.js";
import { createAcademyRepository } from "./db/academy.repository.js";
import { createOperationsRepository } from "./db/operations.repository.js";
import { createParentRepository } from "./db/parent.repository.js";
import { createDatabase } from "./db/client.js";
import { sql } from "drizzle-orm";
import { passwordHasher } from "./modules/auth/password.js";
import { createAuthService } from "./modules/auth/auth.service.js";
import { createAcademyService } from "./modules/academy/academy.service.js";
import { createOperationsService } from "./modules/operations/operations.service.js";
import { createParentsService } from "./modules/parents/parents.service.js";

const env = loadEnv();
const database = createDatabase(env.DATABASE_URL);
const repository = createAuthRepository(database.db);
const academyRepository = createAcademyRepository(database.db);
const operationsRepository = createOperationsRepository(database.db);
const parentRepository = createParentRepository(database.db);
const dummyPasswordHash = await passwordHasher.hash(randomBytes(32).toString("base64url"));
const auth = createAuthService({
  repository,
  passwordVerifier: passwordHasher,
  dummyPasswordHash,
  accessSecret: env.JWT_ACCESS_SECRET,
  accessTokenTtlMinutes: env.ACCESS_TOKEN_TTL_MINUTES,
  sessionTtlDays: env.SESSION_TTL_DAYS,
});
const academy = createAcademyService(academyRepository);
const operations = createOperationsService(operationsRepository);
const parents = createParentsService(parentRepository);

try {
  await database.db.execute(sql`select 1`);
} catch {
  await database.close();
  throw new Error("Could not connect to the configured PostgreSQL database.");
}

const app = createApp({
  auth,
  academy,
  operations,
  parents,
  webOrigin: env.WEB_ORIGIN,
  secureCookies: env.NODE_ENV === "production",
  sessionTtlDays: env.SESSION_TTL_DAYS,
  trustProxyHops: env.TRUST_PROXY_HOPS,
});

const server = app.listen(env.PORT, () => {
  console.log(`SportDesk API listening on port ${env.PORT}.`);
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down.`);
  server.close(async () => {
    await database.close();
    process.exit(0);
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

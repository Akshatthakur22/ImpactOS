import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString, { max: 10, prepare: false });
  const db = drizzle(client, { schema });

  return {
    db,
    close: () => client.end({ timeout: 5 }),
  };
}

export type Database = ReturnType<typeof createDatabase>["db"];

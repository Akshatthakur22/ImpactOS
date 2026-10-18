import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";

describe("environment configuration", () => {
  it("rejects missing database URLs and weak access secrets without displaying their values", () => {
    expect(() => loadEnv({} as NodeJS.ProcessEnv)).toThrow("Invalid environment configuration");
    expect(() =>
      loadEnv({
        DATABASE_URL: "postgresql://localhost/sportdesk",
        JWT_ACCESS_SECRET: "short",
      } as NodeJS.ProcessEnv),
    ).toThrow("JWT_ACCESS_SECRET: String must contain at least 32 character(s)");
  });

  it("loads explicit local settings", () => {
    const parsed = loadEnv({
      NODE_ENV: "test",
      PORT: "4550",
      DATABASE_URL: "postgresql://localhost/sportdesk",
      JWT_ACCESS_SECRET: "a-test-secret-with-more-than-thirty-two-characters",
      WEB_ORIGIN: "http://localhost:3000",
    } as NodeJS.ProcessEnv);
    expect(parsed.PORT).toBe(4550);
    expect(parsed.TRUST_PROXY_HOPS).toBe(0);
    expect(parsed.SESSION_TTL_DAYS).toBe(30);
  });
});

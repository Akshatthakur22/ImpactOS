import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { AuthData, ClientType, PublicUser } from "@sportdesk/contracts";
import type { AuthRepository, UserWithAcademy } from "../../db/auth.repository.js";

export class AuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

type PasswordVerifier = {
  verify(encodedHash: string, password: string): Promise<boolean>;
};

type AuthServiceOptions = {
  repository: AuthRepository;
  passwordVerifier: PasswordVerifier;
  dummyPasswordHash: string;
  accessSecret: string;
  accessTokenTtlMinutes: number;
  sessionTtlDays: number;
  now?: () => Date;
  newToken?: () => string;
};

type IssuedAuth = AuthData & { refreshToken: string };

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function toPublicUser(user: UserWithAcademy): PublicUser {
  return {
    id: user.id,
    academyId: user.academyId,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    academyName: user.academyName,
  };
}

export function createAuthService(options: AuthServiceOptions) {
  if (options.accessSecret.length < 32) {
    throw new Error("JWT access secret must contain at least 32 characters.");
  }

  const key = new TextEncoder().encode(options.accessSecret);
  const now = options.now ?? (() => new Date());
  const newToken = options.newToken ?? (() => randomBytes(32).toString("base64url"));

  async function createAccessToken(userId: string, sessionId: string, issuedAt: Date) {
    const issuedAtSeconds = Math.floor(issuedAt.getTime() / 1000);
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userId)
      .setIssuer("sportdesk-api")
      .setAudience("sportdesk")
      .setIssuedAt(issuedAtSeconds)
      .setExpirationTime(issuedAtSeconds + options.accessTokenTtlMinutes * 60)
      .sign(key);
  }

  return {
    async login(input: {
      email: string;
      password: string;
      clientType: ClientType;
    }): Promise<IssuedAuth> {
      const user = await options.repository.findUserByEmail(input.email.trim().toLowerCase());
      const passwordHash = user?.passwordHash ?? options.dummyPasswordHash;
      const passwordIsValid = await options.passwordVerifier
        .verify(passwordHash, input.password)
        .catch(() => false);
      if (!user || !user.isActive || !passwordIsValid) {
        throw new AuthError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
      }

      const issuedAt = now();
      const sessionId = randomUUID();
      const refreshToken = newToken();
      const expiresAt = new Date(issuedAt.getTime() + options.sessionTtlDays * 86_400_000);
      const accessToken = await createAccessToken(user.id, sessionId, issuedAt);

      await options.repository.createSession({
        id: sessionId,
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt,
        now: issuedAt,
      });

      return {
        accessToken,
        expiresAt: new Date(
          issuedAt.getTime() + options.accessTokenTtlMinutes * 60_000,
        ).toISOString(),
        user: toPublicUser(user),
        refreshToken,
      };
    },

    async refresh(refreshToken: string, _clientType: ClientType): Promise<IssuedAuth> {
      if (refreshToken.length < 32 || refreshToken.length > 256) {
        throw new AuthError(401, "INVALID_SESSION", "Session is invalid or expired.");
      }
      const issuedAt = now();
      const oldHash = hashToken(refreshToken);
      const session = await options.repository.findSessionByHash(oldHash, issuedAt);
      if (!session) {
        throw new AuthError(401, "INVALID_SESSION", "Session is invalid or expired.");
      }
      const user = await options.repository.findUserById(session.userId);
      if (!user?.isActive) {
        await options.repository.revokeSession(oldHash, issuedAt);
        throw new AuthError(401, "INVALID_SESSION", "Session is invalid or expired.");
      }

      const nextRefreshToken = newToken();
      const expiresAt = new Date(issuedAt.getTime() + options.sessionTtlDays * 86_400_000);
      const accessToken = await createAccessToken(user.id, session.id, issuedAt);
      const rotated = await options.repository.rotateSession({
        oldHash,
        newHash: hashToken(nextRefreshToken),
        expiresAt,
        now: issuedAt,
      });
      if (!rotated) {
        throw new AuthError(401, "INVALID_SESSION", "Session is invalid or expired.");
      }

      return {
        accessToken,
        expiresAt: new Date(
          issuedAt.getTime() + options.accessTokenTtlMinutes * 60_000,
        ).toISOString(),
        user: toPublicUser(user),
        refreshToken: nextRefreshToken,
      };
    },

    async logout(refreshToken: string | undefined): Promise<void> {
      if (!refreshToken || refreshToken.length < 32 || refreshToken.length > 256) return;
      await options.repository.revokeSession(hashToken(refreshToken), now());
    },

    async authenticate(accessToken: string): Promise<PublicUser | null> {
      try {
        const { payload } = await jwtVerify(accessToken, key, {
          algorithms: ["HS256"],
          issuer: "sportdesk-api",
          audience: "sportdesk",
        });
        if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
        const session = await options.repository.findSessionById(payload.sid, now());
        if (!session || session.userId !== payload.sub) return null;
        const user = await options.repository.findUserById(payload.sub);
        if (!user?.isActive) return null;
        return toPublicUser(user);
      } catch {
        return null;
      }
    },

    async me(userId: string): Promise<PublicUser | null> {
      const user = await options.repository.findUserById(userId);
      return user?.isActive ? toPublicUser(user) : null;
    },
  };
}

export type SportDeskAuthService = ReturnType<typeof createAuthService>;

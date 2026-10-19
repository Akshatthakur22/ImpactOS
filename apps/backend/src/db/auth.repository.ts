import { and, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "./client.js";
import { academies, authSessions, userPermissions, users } from "./schema.js";

export type UserWithAcademy = {
  id: string;
  academyId: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: "owner" | "staff" | "coach" | "parent";
  isActive: boolean;
  academyName: string;
  academyTimezone: string;
  permissions: string[];
};

export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserWithAcademy | null>;
  findUserById(id: string): Promise<UserWithAcademy | null>;
  createSession(input: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<void>;
  findSessionByHash(tokenHash: string, now: Date): Promise<{ id: string; userId: string } | null>;
  rotateSession(input: {
    oldHash: string;
    newHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<{ id: string; userId: string } | null>;
  findSessionById(id: string, now: Date): Promise<{ id: string; userId: string } | null>;
  revokeSession(tokenHash: string, now: Date): Promise<void>;
  changePassword?(userId: string, passwordHash: string, now: Date): Promise<void>;
}

export function createAuthRepository(db: Database): AuthRepository {
  async function findUser(where: ReturnType<typeof eq>) {
    const [record] = await db
      .select({
        id: users.id,
        academyId: users.academyId,
        email: users.email,
        passwordHash: users.passwordHash,
        displayName: users.displayName,
        role: users.role,
        isActive: users.isActive,
        academyName: academies.name,
        academyTimezone: academies.timezone,
      })
      .from(users)
      .innerJoin(academies, eq(users.academyId, academies.id))
      .where(where)
      .limit(1);
    if (!record) return null;
    const permissions =
      record.role === "staff"
        ? await db
            .select({ permission: userPermissions.permission })
            .from(userPermissions)
            .where(
              and(
                eq(userPermissions.academyId, record.academyId),
                eq(userPermissions.userId, record.id),
              ),
            )
        : [];
    return { ...record, permissions: permissions.map((item) => item.permission) };
  }

  return {
    findUserByEmail: (email) => findUser(eq(users.email, email)),
    findUserById: (id) => findUser(eq(users.id, id)),
    async createSession(input) {
      await db.insert(authSessions).values({
        id: input.id,
        userId: input.userId,
        refreshTokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdAt: input.now,
        lastUsedAt: input.now,
      });
    },
    async findSessionByHash(tokenHash, now) {
      const [record] = await db
        .select({ id: authSessions.id, userId: authSessions.userId })
        .from(authSessions)
        .where(
          and(
            eq(authSessions.refreshTokenHash, tokenHash),
            isNull(authSessions.revokedAt),
            gt(authSessions.expiresAt, now),
          ),
        )
        .limit(1);
      return record ?? null;
    },
    async rotateSession(input) {
      const [record] = await db
        .update(authSessions)
        .set({
          refreshTokenHash: input.newHash,
          expiresAt: input.expiresAt,
          lastUsedAt: input.now,
        })
        .where(
          and(
            eq(authSessions.refreshTokenHash, input.oldHash),
            isNull(authSessions.revokedAt),
            gt(authSessions.expiresAt, input.now),
          ),
        )
        .returning({ id: authSessions.id, userId: authSessions.userId });
      return record ?? null;
    },
    async findSessionById(id, now) {
      const [record] = await db
        .select({ id: authSessions.id, userId: authSessions.userId })
        .from(authSessions)
        .where(
          and(
            eq(authSessions.id, id),
            isNull(authSessions.revokedAt),
            gt(authSessions.expiresAt, now),
          ),
        )
        .limit(1);
      return record ?? null;
    },
    async revokeSession(tokenHash, now) {
      await db
        .update(authSessions)
        .set({ revokedAt: now })
        .where(and(eq(authSessions.refreshTokenHash, tokenHash), isNull(authSessions.revokedAt)));
    },
    async changePassword(userId, passwordHash, now) {
      await db.transaction(async (tx) => {
        await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, userId));
        await tx.update(authSessions).set({ revokedAt: now }).where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
      });
    },
  };
}

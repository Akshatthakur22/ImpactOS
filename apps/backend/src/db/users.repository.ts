import { and, asc, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "./client.js";
import { authSessions, passwordResetTokens, userPermissions, users } from "./schema.js";

export function createUsersRepository(db: Database) {
  async function permissionsFor(academyId: string, userId: string) {
    return db
      .select({ permission: userPermissions.permission })
      .from(userPermissions)
      .where(and(eq(userPermissions.academyId, academyId), eq(userPermissions.userId, userId)))
      .orderBy(asc(userPermissions.permission));
  }

  return {
    async findActiveAccountByEmail(email: string) {
      const [user] = await db
        .select({ id: users.id, academyId: users.academyId, email: users.email })
        .from(users)
        .where(and(eq(users.email, email), eq(users.isActive, true)))
        .limit(1);
      return user ?? null;
    },
    async issuePasswordReset(input: {
      academyId: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      now: Date;
    }) {
      await db.transaction(async (tx) => {
        await tx
          .update(passwordResetTokens)
          .set({ usedAt: input.now })
          .where(
            and(
              eq(passwordResetTokens.userId, input.userId),
              isNull(passwordResetTokens.usedAt),
              gt(passwordResetTokens.expiresAt, input.now),
            ),
          );
        await tx.insert(passwordResetTokens).values(input);
      });
    },
    async consumePasswordReset(input: { tokenHash: string; passwordHash: string; now: Date }) {
      return db.transaction(async (tx) => {
        const [token] = await tx
          .select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId })
          .from(passwordResetTokens)
          .where(
            and(
              eq(passwordResetTokens.tokenHash, input.tokenHash),
              isNull(passwordResetTokens.usedAt),
              gt(passwordResetTokens.expiresAt, input.now),
            ),
          )
          .for("update")
          .limit(1);
        if (!token) return false;
        const [consumed] = await tx
          .update(passwordResetTokens)
          .set({ usedAt: input.now })
          .where(and(eq(passwordResetTokens.id, token.id), isNull(passwordResetTokens.usedAt)))
          .returning({ id: passwordResetTokens.id });
        if (!consumed) return false;
        await tx
          .update(users)
          .set({ passwordHash: input.passwordHash, updatedAt: input.now })
          .where(eq(users.id, token.userId));
        await tx
          .update(authSessions)
          .set({ revokedAt: input.now })
          .where(and(eq(authSessions.userId, token.userId), isNull(authSessions.revokedAt)));
        await tx
          .update(passwordResetTokens)
          .set({ usedAt: input.now })
          .where(
            and(eq(passwordResetTokens.userId, token.userId), isNull(passwordResetTokens.usedAt)),
          );
        return true;
      });
    },
    async listStaff(academyId: string) {
      const staff = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          isActive: users.isActive,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(and(eq(users.academyId, academyId), eq(users.role, "staff")))
        .orderBy(asc(users.displayName));
      return Promise.all(
        staff.map(async (member) => ({
          ...member,
          permissions: (await permissionsFor(academyId, member.id)).map((row) => row.permission),
        })),
      );
    },

    async createStaff(input: {
      academyId: string;
      email: string;
      displayName: string;
      passwordHash: string;
      permissions: string[];
      createdBy: string;
    }) {
      return db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({
            academyId: input.academyId,
            email: input.email,
            displayName: input.displayName,
            passwordHash: input.passwordHash,
            role: "staff",
          })
          .returning({ id: users.id });
        if (!user) throw new Error("Staff account was not created.");
        if (input.permissions.length) {
          await tx.insert(userPermissions).values(
            input.permissions.map((permission) => ({
              academyId: input.academyId,
              userId: user.id,
              permission,
              grantedBy: input.createdBy,
            })),
          );
        }
        return user.id;
      });
    },

    async updateStaff(input: {
      academyId: string;
      userId: string;
      changes: { displayName?: string; isActive?: boolean; permissions?: string[] };
      updatedBy: string;
    }) {
      return db.transaction(async (tx) => {
        const [staff] = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.id, input.userId),
              eq(users.academyId, input.academyId),
              eq(users.role, "staff"),
            ),
          )
          .for("update")
          .limit(1);
        if (!staff) return null;
        const { permissions, ...profileChanges } = input.changes;
        if (Object.keys(profileChanges).length) {
          await tx
            .update(users)
            .set({ ...profileChanges, updatedAt: new Date() })
            .where(and(eq(users.id, staff.id), eq(users.academyId, input.academyId)));
        }
        if (permissions !== undefined) {
          await tx
            .delete(userPermissions)
            .where(
              and(
                eq(userPermissions.academyId, input.academyId),
                eq(userPermissions.userId, staff.id),
              ),
            );
          if (permissions.length) {
            await tx.insert(userPermissions).values(
              permissions.map((permission) => ({
                academyId: input.academyId,
                userId: staff.id,
                permission,
                grantedBy: input.updatedBy,
              })),
            );
          }
        }
        if (input.changes.isActive === false) {
          await tx
            .update(authSessions)
            .set({ revokedAt: new Date() })
            .where(and(eq(authSessions.userId, staff.id), isNull(authSessions.revokedAt)));
        }
        return staff.id;
      });
    },
  };
}

export type UsersRepository = ReturnType<typeof createUsersRepository>;

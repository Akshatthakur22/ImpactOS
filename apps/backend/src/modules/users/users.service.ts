import { createHash, randomBytes } from "node:crypto";
import type { CreateStaffRequest, UpdateStaffRequest } from "@sportdesk/contracts";
import type { UsersRepository } from "../../db/users.repository.js";

export class UsersError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "UsersError";
  }
}

function databaseCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return databaseCode(error.cause);
  return undefined;
}

export function createUsersService(
  repository: UsersRepository,
  passwordHasher: { hash(value: string): Promise<string> },
  options: {
    webOrigin: string;
    sendPasswordResetEmail?: (input: { email: string; resetUrl: string }) => Promise<void>;
  },
) {
  async function list(academyId: string) {
    const staff = await repository.listStaff(academyId);
    return staff.map((member) => ({ ...member, createdAt: member.createdAt.toISOString() }));
  }

  return {
    async requestPasswordReset(email: string) {
      if (!options.sendPasswordResetEmail) {
        throw new UsersError(
          503,
          "PASSWORD_RECOVERY_UNAVAILABLE",
          "Password recovery email is not configured.",
        );
      }
      const account = await repository.findActiveAccountByEmail(email);
      if (account) {
        const token = randomBytes(32).toString("base64url");
        const now = new Date();
        await repository.issuePasswordReset({
          academyId: account.academyId,
          userId: account.id,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(now.getTime() + 30 * 60_000),
          now,
        });
        try {
          await options.sendPasswordResetEmail({
            email: account.email,
            resetUrl: `${options.webOrigin}/reset-password?token=${encodeURIComponent(token)}`,
          });
        } catch {
          console.error(JSON.stringify({ event: "password_reset_delivery_failed" }));
        }
      }
      return {
        message:
          "If an active account uses that email, password reset instructions have been sent.",
      };
    },
    async resetPassword(token: string, password: string) {
      const passwordHash = await passwordHasher.hash(password);
      const consumed = await repository.consumePasswordReset({
        tokenHash: createHash("sha256").update(token).digest("hex"),
        passwordHash,
        now: new Date(),
      });
      if (!consumed)
        throw new UsersError(
          400,
          "INVALID_RESET_TOKEN",
          "This password reset link is invalid or expired. Request a new one.",
        );
      return { message: "Password updated. You can now sign in with your new password." };
    },
    async listStaff(academyId: string) {
      return { staff: await list(academyId) };
    },

    async createStaff(input: CreateStaffRequest & { academyId: string; createdBy: string }) {
      try {
        const passwordHash = await passwordHasher.hash(input.initialPassword);
        await repository.createStaff({
          academyId: input.academyId,
          email: input.email,
          displayName: input.displayName,
          passwordHash,
          permissions: input.permissions,
          createdBy: input.createdBy,
        });
      } catch (error) {
        if (databaseCode(error) === "23505") {
          throw new UsersError(
            409,
            "EMAIL_ALREADY_EXISTS",
            "An account already uses that email address.",
          );
        }
        throw error;
      }
      return this.listStaff(input.academyId);
    },

    async updateStaff(input: {
      academyId: string;
      staffId: string;
      changes: UpdateStaffRequest;
      updatedBy: string;
    }) {
      const updated = await repository.updateStaff({
        academyId: input.academyId,
        userId: input.staffId,
        changes: {
          ...(input.changes.displayName !== undefined
            ? { displayName: input.changes.displayName }
            : {}),
          ...(input.changes.isActive !== undefined ? { isActive: input.changes.isActive } : {}),
          ...(input.changes.permissions !== undefined
            ? { permissions: input.changes.permissions }
            : {}),
        },
        updatedBy: input.updatedBy,
      });
      if (!updated)
        throw new UsersError(404, "STAFF_NOT_FOUND", "The staff account was not found.");
      return this.listStaff(input.academyId);
    },
  };
}

export type SportDeskUsersService = ReturnType<typeof createUsersService>;

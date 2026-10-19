import { createHash, randomBytes } from "node:crypto";
import type { RedeemGuardianInviteRequest } from "@sportdesk/contracts";
import { ParentRepositoryError, type ParentRepository } from "../../db/parent.repository.js";
import { passwordHasher } from "../auth/password.js";

export class ParentError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ParentError";
  }
}

function translateError(error: unknown): never {
  if (error instanceof ParentError) throw error;
  if (error instanceof ParentRepositoryError) {
    if (error.code === "GUARDIAN_NOT_FOUND" || error.code === "STUDENT_NOT_LINKED") {
      throw new ParentError(
        404,
        "RELATED_RECORD_NOT_FOUND",
        "The linked academy record was not found.",
      );
    }
    if (error.code === "GUARDIAN_NEEDS_EMAIL") {
      throw new ParentError(
        400,
        error.code,
        "Add an email address to this guardian before sending an invite.",
      );
    }
    if (error.code === "INVALID_INVITE") {
      throw new ParentError(
        400,
        error.code,
        "This invite is invalid, expired, or has already been used.",
      );
    }
    if (error.code === "EMAIL_IN_USE") {
      throw new ParentError(
        409,
        error.code,
        "This email belongs to an account that cannot be linked as a parent.",
      );
    }
    if (error.code === "GUARDIAN_ALREADY_LINKED") {
      throw new ParentError(409, error.code, "This guardian already has an account.");
    }
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    throw new ParentError(409, "EMAIL_IN_USE", "This email already belongs to an account.");
  }
  throw error;
}

function hashInvite(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createParentsService(repository: ParentRepository) {
  return {
    async getProfile(academyId: string, userId: string) {
      return (await repository.getProfile(academyId, userId)) ?? { displayName: "", phone: null };
    },
    async updateProfile(input: { academyId: string; userId: string; displayName: string }) {
      if (!(await repository.updateProfile(input)))
        throw new ParentError(404, "PARENT_NOT_FOUND", "Parent account was not found.");
      return { updated: true };
    },
    async revokeGuardianInvite(input: { academyId: string; guardianId: string }) {
      try {
        return await repository.revokeInvite({ ...input, now: new Date() });
      } catch (error) {
        translateError(error);
      }
    },

    async createGuardianInvite(input: {
      academyId: string;
      guardianId: string;
      createdBy: string;
    }) {
      const token = randomBytes(32).toString("base64url");
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      try {
        const invite = await repository.createInvite({
          ...input,
          tokenHash: hashInvite(token),
          expiresAt,
          now,
        });
        return { token, email: invite.email, expiresAt: invite.expiresAt.toISOString() };
      } catch (error) {
        translateError(error);
      }
    },

    async redeemGuardianInvite(input: RedeemGuardianInviteRequest) {
      const tokenHash = hashInvite(input.token);
      const now = new Date();
      const invite = await repository.inspectInvite(tokenHash, now);
      if (!invite)
        throw new ParentError(
          400,
          "INVALID_INVITE",
          "This invite is invalid, expired, or has already been used.",
        );

      let existingUserId: string | undefined;
      let passwordHash: string | undefined;
      if (invite.existingUser) {
        if (
          invite.existingUser.role !== "parent" ||
          invite.existingUser.academyId !== invite.academyId ||
          !invite.existingUser.isActive
        ) {
          throw new ParentError(
            409,
            "EMAIL_IN_USE",
            "This email belongs to an account that cannot be linked as a parent.",
          );
        }
        const validPassword = await passwordHasher.verify(
          invite.existingUser.passwordHash,
          input.password,
        );
        if (!validPassword)
          throw new ParentError(400, "INVALID_INVITE", "The invite or password is invalid.");
        existingUserId = invite.existingUser.id;
      } else {
        passwordHash = await passwordHasher.hash(input.password);
      }

      try {
        return await repository.redeemInvite({
          tokenHash,
          now,
          ...(existingUserId ? { existingUserId } : {}),
          ...(passwordHash ? { passwordHash } : {}),
        });
      } catch (error) {
        translateError(error);
      }
    },

    async listStudents(academyId: string, userId: string) {
      return repository.listStudents(academyId, userId);
    },

    async listStudentSchedule(academyId: string, userId: string, studentId: string) {
      if (!(await repository.ownsStudent(academyId, userId, studentId))) {
        throw new ParentError(
          404,
          "RELATED_RECORD_NOT_FOUND",
          "The linked academy record was not found.",
        );
      }
      return repository.listStudentSchedule(academyId, userId, studentId);
    },

    async listStudentAttendance(academyId: string, userId: string, studentId: string) {
      if (!(await repository.ownsStudent(academyId, userId, studentId))) {
        throw new ParentError(
          404,
          "RELATED_RECORD_NOT_FOUND",
          "The linked academy record was not found.",
        );
      }
      return (await repository.listStudentAttendance(academyId, userId, studentId)).map(
        (record) => ({
          ...record,
          scheduledStart: record.scheduledStart.toISOString(),
        }),
      );
    },

    async listStudentProgress(academyId: string, userId: string, studentId: string) {
      if (!(await repository.ownsStudent(academyId, userId, studentId))) {
        throw new ParentError(
          404,
          "RELATED_RECORD_NOT_FOUND",
          "The linked academy record was not found.",
        );
      }
      try {
        return await repository.listStudentProgress(academyId, userId, studentId);
      } catch (error) {
        translateError(error);
      }
    },
  };
}

export type SportDeskParentsService = ReturnType<typeof createParentsService>;

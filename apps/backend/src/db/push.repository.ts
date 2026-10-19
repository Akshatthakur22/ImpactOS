import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { academyAnnouncements, attendanceRecords, guardians, pushDevices, studentGuardians, users } from "./schema.js";

export function createPushRepository(db: Database) {
  return {
    async register(input: {
      academyId: string;
      userId: string;
      token: string;
      platform: "ios" | "android";
    }) {
      const [device] = await db
        .insert(pushDevices)
        .values({
          academyId: input.academyId,
          userId: input.userId,
          expoPushToken: input.token,
          platform: input.platform,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: pushDevices.expoPushToken,
          set: {
            academyId: input.academyId,
            userId: input.userId,
            platform: input.platform,
            isActive: true,
            updatedAt: new Date(),
          },
        })
        .returning({ id: pushDevices.id });
      return device;
    },
    async deactivate(input: { academyId: string; userId: string; token: string }) {
      await db
        .update(pushDevices)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(pushDevices.academyId, input.academyId),
            eq(pushDevices.userId, input.userId),
            eq(pushDevices.expoPushToken, input.token),
          ),
        );
    },
    async listAttendanceRecipients(academyId: string) {
      return db
        .select({ token: pushDevices.expoPushToken })
        .from(pushDevices)
        .innerJoin(
          users,
          and(eq(users.id, pushDevices.userId), eq(users.academyId, pushDevices.academyId)),
        )
        .where(
          and(
            eq(pushDevices.academyId, academyId),
            eq(pushDevices.isActive, true),
            inArray(users.role, ["owner", "staff"]),
          ),
        );
    },
    async listSessionRecipients(academyId: string, sessionId: string) {
      const staff = await db.select({ token: pushDevices.expoPushToken }).from(pushDevices)
        .innerJoin(users, and(eq(users.id, pushDevices.userId), eq(users.academyId, pushDevices.academyId)))
        .where(and(eq(pushDevices.academyId, academyId), eq(pushDevices.isActive, true), inArray(users.role, ["owner", "staff"])));
      const parents = await db.select({ token: pushDevices.expoPushToken }).from(attendanceRecords)
        .innerJoin(studentGuardians, eq(studentGuardians.studentId, attendanceRecords.studentId))
        .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
        .innerJoin(pushDevices, and(eq(pushDevices.userId, guardians.userId), eq(pushDevices.academyId, guardians.academyId)))
        .where(and(eq(attendanceRecords.sessionId, sessionId), eq(studentGuardians.academyId, academyId), eq(pushDevices.isActive, true)));
      return [...staff, ...parents];
    },
    async listAnnouncementRecipients(academyId: string, announcementId: string) {
      return db.select({ token: pushDevices.expoPushToken, title: academyAnnouncements.title, body: academyAnnouncements.body })
        .from(academyAnnouncements).innerJoin(users, and(eq(users.academyId, academyAnnouncements.academyId), eq(users.role, "parent")))
        .innerJoin(guardians, and(eq(guardians.userId, users.id), eq(guardians.academyId, users.academyId)))
        .innerJoin(pushDevices, and(eq(pushDevices.userId, users.id), eq(pushDevices.academyId, users.academyId)))
        .where(and(eq(academyAnnouncements.id, announcementId), eq(academyAnnouncements.academyId, academyId), eq(pushDevices.isActive, true),
          inArray(academyAnnouncements.audience, ["everyone", "parents"]),
          or(sql`${academyAnnouncements.batchId} is null`, sql`exists (select 1 from student_guardians sg join enrollments e on e.student_id = sg.student_id where sg.guardian_id = ${guardians.id} and e.batch_id = ${academyAnnouncements.batchId} and e.status = 'active')`)));
    },
    async listStudentParentRecipients(academyId: string, studentId: string) {
      return db.select({ token: pushDevices.expoPushToken }).from(studentGuardians)
        .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
        .innerJoin(pushDevices, and(eq(pushDevices.userId, guardians.userId), eq(pushDevices.academyId, guardians.academyId)))
        .where(and(eq(studentGuardians.academyId, academyId), eq(studentGuardians.studentId, studentId), eq(pushDevices.isActive, true)));
    },
    async deactivateToken(token: string) {
      await db
        .update(pushDevices)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(pushDevices.expoPushToken, token));
    },
  };
}

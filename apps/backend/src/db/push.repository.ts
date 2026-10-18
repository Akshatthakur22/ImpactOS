import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "./client.js";
import { pushDevices, users } from "./schema.js";

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
    async deactivateToken(token: string) {
      await db
        .update(pushDevices)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(pushDevices.expoPushToken, token));
    },
  };
}

import type { PushDeviceRequest } from "@sportdesk/contracts";

type PushRepository = ReturnType<typeof import("../../db/push.repository.js").createPushRepository>;

export function createPushService(repository: PushRepository) {
  async function send(
    messages: { to: string; title: string; body: string; data?: Record<string, string> }[],
  ) {
    for (let offset = 0; offset < messages.length; offset += 100) {
      const batch = messages.slice(offset, offset + 100);
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(batch),
        });
        if (!response.ok) continue;
        const result = (await response.json()) as {
          data?: { status?: string; details?: { error?: string } }[];
        };
        for (const [index, ticket] of (result.data ?? []).entries()) {
          if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
            await repository.deactivateToken(batch[index]!.to);
          }
        }
      } catch (error) {
        console.warn(
          "Expo push delivery failed.",
          error instanceof Error ? error.message : "unknown error",
        );
      }
    }
  }
  return {
    async register(input: PushDeviceRequest & { academyId: string; userId: string }) {
      return repository.register(input);
    },
    async remove(input: { academyId: string; userId: string; token: string }) {
      return repository.deactivate(input);
    },
    async attendanceRecorded(academyId: string, sessionId: string) {
      const devices = await repository.listAttendanceRecipients(academyId);
      await send(
        devices.map(({ token }) => ({
          to: token,
          title: "Attendance recorded",
          body: "A coach completed attendance for a training session.",
          data: { sessionId },
        })),
      );
    },
  };
}

export type SportDeskPushService = ReturnType<typeof createPushService>;

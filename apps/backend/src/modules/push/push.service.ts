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
      const devices = await repository.listSessionRecipients(academyId, sessionId);
      await send(
        [...new Map(devices.map(({ token }) => [token, token])).values()].map((token) => ({
          to: token,
          title: "Attendance recorded",
          body: "Attendance was updated for a training session.",
          data: { sessionId },
        })),
      );
    },
    async announcementPublished(academyId: string, announcementId: string) {
      const devices = await repository.listAnnouncementRecipients(academyId, announcementId);
      await send([...new Map(devices.map((item) => [item.token, item])).values()].map(({ token, title, body }) => ({
        to: token,
        title: `Academy notice: ${title}`,
        body: body.slice(0, 160),
        data: { announcementId },
      })));
    },
    async progressShared(academyId: string, studentId: string) {
      const devices = await repository.listStudentParentRecipients(academyId, studentId);
      await send([...new Set(devices.map(({ token }) => token))].map((token) => ({
        to: token,
        title: "New progress shared",
        body: "A coach shared a new assessment or note for your child.",
        data: { studentId },
      })));
    },
  };
}

export type SportDeskPushService = ReturnType<typeof createPushService>;

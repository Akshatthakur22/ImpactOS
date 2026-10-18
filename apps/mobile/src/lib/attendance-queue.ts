import * as SecureStore from "expo-secure-store";
import type { AttendanceStatus } from "@sportdesk/contracts";

export type QueuedAttendance = {
  sessionId: string;
  coachUserId: string;
  batchName: string;
  startsAt: string;
  records: { studentId: string; status: AttendanceStatus }[];
  queuedAt: string;
};

const INDEX_KEY = "sportdesk.attendance.queue.v1.index";
const ENTRY_PREFIX = "sportdesk.attendance.queue.v1.entry.";
const CHUNK_LENGTH = 900;

async function readIndex() {
  try {
    const value = await SecureStore.getItemAsync(INDEX_KEY);
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export async function readAttendanceQueue(): Promise<QueuedAttendance[]> {
  const ids = await readIndex();
  const output: QueuedAttendance[] = [];
  for (const id of ids) {
    try {
      const metadata = await SecureStore.getItemAsync(`${ENTRY_PREFIX}${id}.meta`);
      if (!metadata) continue;
      const chunkCount = Number(metadata);
      if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 100) continue;
      let serialized = "";
      for (let index = 0; index < chunkCount; index += 1) {
        const chunk = await SecureStore.getItemAsync(`${ENTRY_PREFIX}${id}.${index}`);
        if (chunk === null) throw new Error("Missing queue chunk");
        serialized += chunk;
      }
      const item: unknown = JSON.parse(serialized);
      if (typeof item === "object" && item !== null && "sessionId" in item && "records" in item) {
        output.push(item as QueuedAttendance);
      }
    } catch {
      // Keep other queued sessions available if one local entry is damaged.
    }
  }
  return output;
}

export async function enqueueAttendance(item: QueuedAttendance) {
  const serialized = JSON.stringify(item);
  const chunks: string[] = [];
  for (let index = 0; index < serialized.length; index += CHUNK_LENGTH) {
    chunks.push(serialized.slice(index, index + CHUNK_LENGTH));
  }
  const prefix = `${ENTRY_PREFIX}${item.sessionId}`;
  for (let index = 0; index < chunks.length; index += 1) {
    await SecureStore.setItemAsync(`${prefix}.${index}`, chunks[index]!);
  }
  await SecureStore.setItemAsync(`${prefix}.meta`, String(chunks.length));
  const ids = await readIndex();
  if (!ids.includes(item.sessionId)) ids.push(item.sessionId);
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(ids));
  return readAttendanceQueue();
}

export async function removeQueuedAttendance(sessionId: string) {
  const ids = await readIndex();
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(ids.filter((id) => id !== sessionId)));
  const prefix = `${ENTRY_PREFIX}${sessionId}`;
  const metadata = await SecureStore.getItemAsync(`${prefix}.meta`);
  const count = Number(metadata);
  if (Number.isInteger(count) && count > 0 && count <= 100) {
    await Promise.all(
      Array.from({ length: count }, (_, index) =>
        SecureStore.deleteItemAsync(`${prefix}.${index}`),
      ),
    );
  }
  await SecureStore.deleteItemAsync(`${prefix}.meta`);
  return readAttendanceQueue();
}

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
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

function browserStorage() {
  if (Platform.OS !== "web" || typeof globalThis.sessionStorage === "undefined")
    throw new Error("Offline attendance storage is unavailable on this device.");
  return globalThis.sessionStorage;
}

const storage = {
  get: (key: string) =>
    Platform.OS === "web"
      ? Promise.resolve(browserStorage().getItem(key))
      : SecureStore.getItemAsync(key),
  set: (key: string, value: string) =>
    Platform.OS === "web"
      ? Promise.resolve(browserStorage().setItem(key, value))
      : SecureStore.setItemAsync(key, value),
  remove: (key: string) =>
    Platform.OS === "web"
      ? Promise.resolve(browserStorage().removeItem(key))
      : SecureStore.deleteItemAsync(key),
};

async function readIndex() {
  try {
    const value = await storage.get(INDEX_KEY);
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    throw new Error("Could not read the offline attendance queue on this device.");
  }
}

export async function readAttendanceQueue(): Promise<QueuedAttendance[]> {
  const ids = await readIndex();
  const output: QueuedAttendance[] = [];
  for (const id of ids) {
    try {
      const metadata = await storage.get(`${ENTRY_PREFIX}${id}.meta`);
      if (!metadata) continue;
      const chunkCount = Number(metadata);
      if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 100) continue;
      let serialized = "";
      for (let index = 0; index < chunkCount; index += 1) {
        const chunk = await storage.get(`${ENTRY_PREFIX}${id}.${index}`);
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
    await storage.set(`${prefix}.${index}`, chunks[index]!);
  }
  await storage.set(`${prefix}.meta`, String(chunks.length));
  const ids = await readIndex();
  if (!ids.includes(item.sessionId)) ids.push(item.sessionId);
  await storage.set(INDEX_KEY, JSON.stringify(ids));
  return readAttendanceQueue();
}

export async function removeQueuedAttendance(sessionId: string) {
  const ids = await readIndex();
  await storage.set(INDEX_KEY, JSON.stringify(ids.filter((id) => id !== sessionId)));
  const prefix = `${ENTRY_PREFIX}${sessionId}`;
  const metadata = await storage.get(`${prefix}.meta`);
  const count = Number(metadata);
  if (Number.isInteger(count) && count > 0 && count <= 100) {
    await Promise.all(
      Array.from({ length: count }, (_, index) => storage.remove(`${prefix}.${index}`)),
    );
  }
  await storage.remove(`${prefix}.meta`);
  return readAttendanceQueue();
}

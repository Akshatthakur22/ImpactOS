import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";
import type { AuthData } from "@sportdesk/contracts";
import { z } from "zod";
import { requestMobileData } from "./api";

function runningInExpoGo() {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

async function loadNotifications() {
  const notifications = await import("expo-notifications");
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  return notifications;
}

export async function registerPushDevice(
  auth: AuthData,
  onAuthUpdate: (nextAuth: AuthData) => void,
) {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  if (runningInExpoGo()) return;
  if (!["owner", "staff", "parent", "coach"].includes(auth.user.role)) return;
  const Notifications = await loadNotifications();
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "SportDesk alerts",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const permission = await Notifications.getPermissionsAsync();
  const granted = permission.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return;
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) return;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await requestMobileData(
    "/push/devices",
    (value) => z.object({ registered: z.boolean() }).parse(value),
    auth,
    onAuthUpdate,
    { method: "PUT", body: JSON.stringify({ token, platform: Platform.OS }) },
  );
}

export async function unregisterPushDevice(
  auth: AuthData,
  onAuthUpdate: (nextAuth: AuthData) => void,
) {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  if (runningInExpoGo()) return;
  if (!["owner", "staff", "parent", "coach"].includes(auth.user.role)) return;
  try {
    const Notifications = await loadNotifications();
    const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    if (!projectId) return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await requestMobileData(
      "/push/devices",
      (value) => z.object({ registered: z.boolean() }).parse(value),
      auth,
      onAuthUpdate,
      { method: "DELETE", body: JSON.stringify({ token }) },
    );
  } catch {
    // Logout still completes if the device is offline; server-side tokens expire by provider feedback.
  }
}

/** Schedule local class reminders on coach devices. These do not require EAS push credentials. */
export async function syncCoachClassReminders(
  sessions: readonly { id: string; batchName: string; startsAt: string; status: string }[],
) {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  // Expo Go may not include every native module required by the installed
  // expo-notifications version. Keep its missing-module error out of app startup;
  // reminders and push registration are available in a development build.
  if (runningInExpoGo()) return;
  try {
    const Notifications = await loadNotifications();
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && !(await Notifications.requestPermissionsAsync()).granted) return;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "SportDesk class reminders",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    const coachItems = existing.filter(
      (item) => item.content.data?.sportdeskType === "coach-class-reminder",
    );
    await Promise.all(
      coachItems.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
    );
    const now = Date.now();
    const upcoming = sessions
      .filter((session) => {
        const startsAt = new Date(session.startsAt).getTime();
        return (
          session.status === "scheduled" &&
          startsAt - 30 * 60_000 > now &&
          startsAt < now + 14 * 86_400_000
        );
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      .slice(0, 60);
    for (const session of upcoming) {
      const triggerAt = new Date(session.startsAt).getTime() - 30 * 60_000;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Class starts in 30 minutes",
          body: `${session.batchName} is coming up soon.`,
          data: { sportdeskType: "coach-class-reminder", sessionId: session.id },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(triggerAt),
        },
      });
    }
  } catch {
    // Reminders are helpful, but a notification platform failure must not block the class list.
  }
}

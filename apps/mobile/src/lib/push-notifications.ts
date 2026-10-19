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

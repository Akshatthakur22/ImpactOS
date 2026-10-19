import type { ExpoConfig } from "expo/config";

const configValue: ExpoConfig = {
  name: "SportDesk",
  slug: "sportdesk",
  scheme: "sportdesk",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-status-bar",
    "expo-notifications",
    [
      "expo-location",
      { locationWhenInUsePermission: "Allow SportDesk to verify your class check-in location." },
    ],
  ],
  ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID
    ? { extra: { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } } }
    : {}),
  experiments: { typedRoutes: true },
};

export default configValue;

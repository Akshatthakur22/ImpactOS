import type { ExpoConfig } from "expo/config";

const configValue: ExpoConfig = {
  name: "SportDesk",
  slug: "sportdesk",
  scheme: "sportdesk",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  plugins: ["expo-router", "expo-secure-store", "expo-status-bar"],
  experiments: { typedRoutes: true },
};

export default configValue;

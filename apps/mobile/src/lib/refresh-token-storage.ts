import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const REFRESH_TOKEN_KEY = "sportdesk.refresh-token";

export async function getRefreshToken() {
  if (Platform.OS === "web") {
    return typeof window === "undefined" ? null : window.sessionStorage.getItem(REFRESH_TOKEN_KEY);
  }
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function saveRefreshToken(token: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function clearRefreshToken() {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

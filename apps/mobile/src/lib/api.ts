import Constants from "expo-constants";
import { Platform } from "react-native";
import { saveRefreshToken } from "./refresh-token-storage";
import {
  ApiErrorSchema,
  ApiSuccessSchema,
  AuthDataSchema,
  type AuthData,
} from "@sportdesk/contracts";

function hostFromDevServer(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname;
  } catch {
    return null;
  }
}

export function resolveMobileApiBase(options: {
  configuredUrl?: string | undefined;
  developmentHost?: string | null | undefined;
  isDevelopment: boolean;
  platform: string;
  webHostname?: string | undefined;
}) {
  if (options.isDevelopment && options.platform === "web" && options.webHostname) {
    return `http://${options.webHostname}:4000/api/v1`;
  }

  const configured = options.configuredUrl?.trim().replace(/\/+$/, "");
  if (configured) return configured;

  if (options.isDevelopment) {
    const devHost = hostFromDevServer(options.developmentHost);
    if (devHost) return `http://${devHost}:4000/api/v1`;
    if (options.platform === "android") return "http://10.0.2.2:4000/api/v1";
    return "http://localhost:4000/api/v1";
  }

  return null;
}

const API_BASE = resolveMobileApiBase({
  configuredUrl: process.env.EXPO_PUBLIC_API_URL,
  developmentHost: Constants.expoConfig?.hostUri,
  isDevelopment: __DEV__,
  platform: Platform.OS,
  webHostname: typeof window === "undefined" ? undefined : window.location.hostname,
});
let refreshInFlight: Promise<AuthData> | null = null;

export async function mobileFetch(path: string, init: RequestInit = {}) {
  if (!API_BASE) {
    throw new Error(
      "This SportDesk build has no API address. Set EXPO_PUBLIC_API_URL and rebuild the app.",
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    return await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal });
  } catch (caught) {
    if (controller.signal.aborted) {
      throw new Error(
        "The academy server took too long to respond. Check that it is running and try again.",
        { cause: caught },
      );
    }
    if (caught instanceof TypeError) {
      throw new Error(
        "Could not reach the academy server. Check the mobile API address and Wi-Fi connection.",
        { cause: caught },
      );
    }
    throw caught;
  } finally {
    clearTimeout(timeout);
  }
}

async function renewMobileSession(refreshToken: string) {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshed = await mobileFetch("/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientType: "mobile", refreshToken }),
      });
      if (!refreshed.ok) throw new Error(await errorMessage(refreshed));
      const nextAuth = ApiSuccessSchema(AuthDataSchema).parse(await refreshed.json()).data;
      if (nextAuth.refreshToken) await saveRefreshToken(nextAuth.refreshToken);
      return nextAuth;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function errorMessage(response: Response) {
  try {
    const parsed = ApiErrorSchema.safeParse(await response.json());
    if (parsed.success) return parsed.data.error.message;
  } catch {
    // Use a safe fallback when the API is unreachable or returns invalid JSON.
  }
  return "Could not connect to SportDesk. Check your API address and connection.";
}

export async function requestMobileData<T>(
  path: string,
  parse: (value: unknown) => T,
  auth: AuthData,
  onAuthUpdate: (nextAuth: AuthData) => void,
  init: RequestInit = {},
): Promise<T> {
  const send = (accessToken: string) =>
    mobileFetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...init.headers,
      },
    });

  let response = await send(auth.accessToken);
  if (response.status === 401 && auth.refreshToken) {
    const nextAuth = await renewMobileSession(auth.refreshToken);
    onAuthUpdate(nextAuth);
    response = await send(nextAuth.accessToken);
  }
  if (!response.ok) throw new Error(await errorMessage(response));
  const result: unknown = await response.json();
  if (typeof result !== "object" || result === null || !("data" in result)) {
    throw new Error("The server returned an invalid response.");
  }
  return parse(result.data);
}

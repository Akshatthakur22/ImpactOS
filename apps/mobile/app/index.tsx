import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { registerPushDevice, unregisterPushDevice } from "@/lib/push-notifications";
import {
  ApiErrorSchema,
  ApiSuccessSchema,
  AuthDataSchema,
  RedeemGuardianInviteRequestSchema,
  RedeemedGuardianInviteSchema,
  type AuthData,
} from "@sportdesk/contracts";
import { CoachWorkspace } from "@/features/coach-workspace";
import { ParentWorkspace } from "@/features/parent-workspace";
import { mobileFetch } from "@/lib/api";
const REFRESH_KEY = "sportdesk.refresh-token";

class MobileApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function responseError(response: Response) {
  try {
    const parsed = ApiErrorSchema.safeParse(await response.json());
    if (parsed.success) return parsed.data.error.message;
  } catch {
    // Fall back to a safe local message.
  }
  return "Could not connect to SportDesk. Check your API address and connection.";
}

async function requestLogin(email: string, password: string): Promise<AuthData> {
  const response = await mobileFetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, clientType: "mobile" }),
  });
  if (!response.ok) throw new MobileApiError(await responseError(response), response.status);
  return ApiSuccessSchema(AuthDataSchema).parse(await response.json()).data;
}

async function renewSession(refreshToken: string): Promise<AuthData> {
  const response = await mobileFetch("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientType: "mobile", refreshToken }),
  });
  if (!response.ok) throw new MobileApiError(await responseError(response), response.status);
  return ApiSuccessSchema(AuthDataSchema).parse(await response.json()).data;
}

export default function IndexScreen() {
  const [auth, setAuth] = useState<AuthData | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [screen, setScreen] = useState<"login" | "parent-invite">("login");
  const [inviteToken, setInviteToken] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    void registerPushDevice(auth, setAuth).catch(() => {
      // Push setup is optional; the authenticated workspace remains usable without it.
    });
  }, [auth?.accessToken]);

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
        if (!refreshToken) return;
        const nextAuth = await renewSession(refreshToken);
        if (nextAuth.refreshToken)
          await SecureStore.setItemAsync(REFRESH_KEY, nextAuth.refreshToken);
        if (active) setAuth(nextAuth);
      } catch (caught) {
        if (caught instanceof MobileApiError && [400, 401, 403].includes(caught.status)) {
          await SecureStore.deleteItemAsync(REFRESH_KEY);
        } else if (active) {
          setError(caught instanceof Error ? caught.message : "Could not restore your session.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void restore();
    return () => {
      active = false;
    };
  }, []);

  async function handleLogin() {
    setError(null);
    setInviteNotice(null);
    setSubmitting(true);
    try {
      const nextAuth = await requestLogin(email.trim(), password);
      if (!nextAuth.refreshToken) throw new Error("The server did not issue a mobile session.");
      await SecureStore.setItemAsync(REFRESH_KEY, nextAuth.refreshToken);
      setAuth(nextAuth);
      setPassword("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRedeemInvite() {
    setError(null);
    setInviteNotice(null);
    setInviteBusy(true);
    try {
      const input = RedeemGuardianInviteRequestSchema.parse({
        token: inviteToken.trim(),
        password: invitePassword,
      });
      const response = await mobileFetch("/parent-invites/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new MobileApiError(await responseError(response), response.status);
      const result = ApiSuccessSchema(RedeemedGuardianInviteSchema).parse(
        await response.json(),
      ).data;
      setEmail(result.email);
      setPassword("");
      setInviteToken("");
      setInvitePassword("");
      setScreen("login");
      setInviteNotice(
        `Parent access is ready for ${result.email}. Sign in with the password you entered.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not activate parent access.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function handleLogout() {
    const token = auth?.refreshToken;
    try {
      if (auth) await unregisterPushDevice(auth, setAuth);
      if (token) {
        await mobileFetch("/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientType: "mobile", refreshToken: token }),
        });
      }
    } finally {
      await SecureStore.deleteItemAsync(REFRESH_KEY);
      setAuth(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color="#176e67" />
        <Text style={styles.loadingText}>Connecting to SportDesk</Text>
      </SafeAreaView>
    );
  }

  if (auth) {
    if (auth.user.role === "coach") {
      return (
        <SafeAreaView style={styles.safeArea}>
          <CoachWorkspace auth={auth} onAuthUpdate={setAuth} onLogout={() => void handleLogout()} />
        </SafeAreaView>
      );
    }
    if (auth.user.role === "parent") {
      return (
        <SafeAreaView style={styles.safeArea}>
          <ParentWorkspace
            auth={auth}
            onAuthUpdate={setAuth}
            onLogout={() => void handleLogout()}
          />
        </SafeAreaView>
      );
    }
    const firstName = auth.user.displayName.split(" ")[0];
    const roleMessage = "Your academy operations workspace is connected.";
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.homeContent}>
          <View style={styles.topline}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>S</Text>
            </View>
            <Text style={styles.brandName}>SportDesk</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void handleLogout()}
              style={styles.signOut}
            >
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>
          <View style={styles.welcome}>
            <Text style={styles.eyebrow}>{auth.user.academyName}</Text>
            <Text style={styles.title}>Hello, {firstName}.</Text>
            <Text style={styles.body}>Your academy workspace is connected to SportDesk.</Text>
          </View>
          <View style={styles.accountCard}>
            <View style={styles.cardTopline}>
              <Text style={styles.cardLabel}>YOUR ACCOUNT</Text>
              <View style={styles.rolePill}>
                <Text style={styles.roleText}>{auth.user.role.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.accountName}>{auth.user.displayName}</Text>
            <Text style={styles.accountEmail}>{auth.user.email}</Text>
            <View style={styles.divider} />
            <Text style={styles.body}>{roleMessage}</Text>
          </View>
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>First release in progress</Text>
            <Text style={styles.noteBody}>
              This build verifies sign-in and secure session renewal. Academy workflows will be
              enabled as each module is implemented and tested.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "parent-invite") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.loginContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.brandRow}>
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>S</Text>
              </View>
              <Text style={styles.brandName}>SportDesk</Text>
            </View>
            <Text style={styles.eyebrow}>PARENT ACCESS</Text>
            <Text style={styles.title}>Link your child.</Text>
            <Text style={styles.body}>
              Enter the one-time code from your academy. Use your existing parent password if you
              already have a SportDesk account.
            </Text>
            <View style={styles.form}>
              <Text style={styles.label}>Invite code</Text>
              <TextInput
                accessibilityLabel="Invite code"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setInviteToken}
                placeholder="Paste your invite code"
                placeholderTextColor="#99a4ad"
                style={styles.input}
                value={inviteToken}
              />
              <Text style={styles.label}>Create or confirm password</Text>
              <TextInput
                accessibilityLabel="Create or confirm password"
                autoComplete="new-password"
                maxLength={256}
                onChangeText={setInvitePassword}
                placeholder="At least 14 characters"
                placeholderTextColor="#99a4ad"
                secureTextEntry
                style={styles.input}
                value={invitePassword}
              />
              {error ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {error}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={inviteBusy || inviteToken.length < 32 || invitePassword.length < 14}
                onPress={() => void handleRedeemInvite()}
                style={({ pressed }) => [
                  styles.submit,
                  pressed && styles.submitPressed,
                  (inviteBusy || inviteToken.length < 32 || invitePassword.length < 14) &&
                    styles.submitDisabled,
                ]}
              >
                <Text style={styles.submitText}>
                  {inviteBusy ? "Activating…" : "Activate parent access"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.backLink}
                onPress={() => {
                  setScreen("login");
                  setError(null);
                }}
              >
                <Text style={styles.backLinkText}>Back to sign in</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.loginContent} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>S</Text>
            </View>
            <Text style={styles.brandName}>SportDesk</Text>
          </View>
          <Text style={styles.eyebrow}>IMPACT FIT ACADEMY</Text>
          <Text style={styles.title}>Your academy, in motion.</Text>
          <Text style={styles.body}>
            Sign in with the account provided by your academy administrator.
          </Text>
          {inviteNotice ? (
            <Text accessibilityRole="alert" style={styles.inviteNotice}>
              {inviteNotice}
            </Text>
          ) : null}

          <View style={styles.form}>
            <Text style={styles.label}>Email address</Text>
            <TextInput
              accessibilityLabel="Email address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              maxLength={254}
              onChangeText={setEmail}
              placeholder="you@academy.com"
              placeholderTextColor="#99a4ad"
              style={styles.input}
              value={email}
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              accessibilityLabel="Password"
              autoComplete="current-password"
              maxLength={256}
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor="#99a4ad"
              secureTextEntry
              style={styles.input}
              value={password}
            />
            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={submitting || !email || !password}
              onPress={() => void handleLogin()}
              style={({ pressed }) => [
                styles.submit,
                pressed && styles.submitPressed,
                (submitting || !email || !password) && styles.submitDisabled,
              ]}
            >
              <Text style={styles.submitText}>{submitting ? "Signing in…" : "Sign in"}</Text>
            </Pressable>
          </View>
          <Text style={styles.help}>Need access? Contact your academy administrator.</Text>
          <Pressable
            accessibilityRole="button"
            style={styles.inviteLink}
            onPress={() => {
              setScreen("parent-invite");
              setError(null);
              setInviteNotice(null);
            }}
          >
            <Text style={styles.backLinkText}>Have a parent invite code?</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f5f6f8" },
  keyboard: { flex: 1 },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#f5f6f8",
  },
  loadingText: { color: "#667481", fontSize: 13 },
  loginContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 26,
    paddingVertical: 40,
  },
  homeContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 40 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 54 },
  topline: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#153f3d",
  },
  brandMarkText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  brandName: { color: "#17212d", fontSize: 17, fontWeight: "700", letterSpacing: -0.3 },
  signOut: {
    marginLeft: "auto",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#ffffff",
  },
  signOutText: { color: "#53616b", fontSize: 12, fontWeight: "600" },
  eyebrow: { marginTop: 4, color: "#176e67", fontSize: 11, fontWeight: "700", letterSpacing: 1.4 },
  title: {
    marginTop: 11,
    color: "#17212d",
    fontSize: 31,
    fontWeight: "700",
    letterSpacing: -1.1,
    lineHeight: 38,
  },
  body: { marginTop: 10, color: "#667481", fontSize: 14, lineHeight: 22 },
  form: { marginTop: 30 },
  label: { marginBottom: 8, color: "#283540", fontSize: 13, fontWeight: "600" },
  input: {
    height: 50,
    marginBottom: 19,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#e1e6e9",
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    color: "#17212d",
    fontSize: 14,
  },
  submit: {
    height: 50,
    marginTop: 7,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#176e67",
  },
  submitPressed: { backgroundColor: "#0f5b55" },
  submitDisabled: { opacity: 0.55 },
  submitText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  error: { marginBottom: 9, color: "#984d3f", fontSize: 13, lineHeight: 19 },
  help: { marginTop: 26, color: "#7c8790", fontSize: 12, lineHeight: 18, textAlign: "center" },
  inviteLink: { alignSelf: "center", marginTop: 18, padding: 8 },
  backLink: { alignSelf: "center", marginTop: 20, padding: 8 },
  backLinkText: { color: "#176e67", fontSize: 12, fontWeight: "700" },
  inviteNotice: {
    marginTop: 18,
    borderRadius: 12,
    backgroundColor: "#eaf5f1",
    padding: 12,
    color: "#176e67",
    fontSize: 12,
    lineHeight: 19,
  },
  welcome: { marginTop: 48, marginBottom: 25 },
  accountCard: {
    borderRadius: 21,
    backgroundColor: "#ffffff",
    padding: 20,
    shadowColor: "#182734",
    shadowOpacity: 0.04,
    shadowRadius: 15,
    elevation: 2,
  },
  cardTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardLabel: { color: "#87939c", fontSize: 10, fontWeight: "700", letterSpacing: 1.2 },
  rolePill: {
    borderRadius: 99,
    backgroundColor: "#e5f3f0",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  roleText: { color: "#176e67", fontSize: 9, fontWeight: "700", letterSpacing: 0.7 },
  accountName: { marginTop: 22, color: "#17212d", fontSize: 18, fontWeight: "700" },
  accountEmail: { marginTop: 4, color: "#667481", fontSize: 13 },
  divider: { height: 1, marginVertical: 17, backgroundColor: "#e8ecee" },
  noteCard: { marginTop: 14, borderRadius: 18, backgroundColor: "#eaf2f0", padding: 18 },
  noteTitle: { color: "#205953", fontSize: 13, fontWeight: "700" },
  noteBody: { marginTop: 6, color: "#536b68", fontSize: 12, lineHeight: 19 },
});

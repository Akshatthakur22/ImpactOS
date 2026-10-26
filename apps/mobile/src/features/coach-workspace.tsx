import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AttendanceStatusSchema,
  ChangePasswordRequestSchema,
  CoachStudentFeedbackSchema,
  CoachStudentHistorySchema,
  CoachStudentFeedbackRequestSchema,
  CoachStudentSchema,
  ParentAnnouncementListSchema,
  SessionRosterSchema,
  TrainingSessionSchema,
  UpdateCoachProfileRequestSchema,
  type AttendanceStatus,
  type AuthData,
  type CoachStudent,
  type CoachStudentFeedback,
  type CoachStudentHistory,
  type ParentAnnouncement,
  type SessionRoster,
  type TrainingSession,
} from "@sportdesk/contracts";
import * as Location from "expo-location";
import { z } from "zod";
import { requestMobileData } from "@/lib/api";
import { WorkspaceIcon, type WorkspaceIconName } from "@/components/workspace-icon";
import { syncCoachClassReminders } from "@/lib/push-notifications";
import {
  enqueueAttendance,
  readAttendanceQueue,
  removeQueuedAttendance,
  type QueuedAttendance,
} from "@/lib/attendance-queue";
import { colors, radii, shadows, spacing, typography } from "@/lib/theme";
import { Card, Button, Badge } from "@/components/ui";

// -------------------------------------------------------------
// Navigation Definition (5 Persistent Tabs as per Spec)
// -------------------------------------------------------------
const navItems = [
  { id: "today", label: "Home", icon: "home" },
  { id: "classes", label: "Classes", icon: "calendar" },
  { id: "students", label: "Students", icon: "students" },
  { id: "work", label: "My Work", icon: "work" },
  { id: "profile", label: "Profile", icon: "profile" },
] as const;

type CoachTab = (typeof navItems)[number]["id"] | "notices";

const coachIconByTab: Record<(typeof navItems)[number]["id"], WorkspaceIconName> = {
  today: "home",
  classes: "calendar",
  students: "students",
  work: "work",
  profile: "profile",
};

const statusOptions = AttendanceStatusSchema.options;
const statusLabels: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "Excused",
};

// -------------------------------------------------------------
// Date & Time Helpers
// -------------------------------------------------------------
function formatDate(value: string, timeZone: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(value: string, timeZone: string) {
  return new Date(value).toLocaleTimeString("en-IN", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
}

function sameLocalDay(value: string | Date, timeZone: string, now = new Date()) {
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return format.format(new Date(value)) === format.format(now);
}

function currentWeekStart(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "1970";
  const date = new Date(`${get("year")}-${get("month")}-${get("day")}T12:00:00.000Z`);
  const daysFromMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysFromMonday);
  return date.toISOString().slice(0, 10);
}

function EmptyState({ title, detail, icon = "calendar" }: { title: string; detail: string; icon?: WorkspaceIconName }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconCircle}>
        <WorkspaceIcon name={icon} size={24} color={colors.muted} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </View>
  );
}

// -------------------------------------------------------------
// Main Component
// -------------------------------------------------------------
export function CoachWorkspace({
  auth,
  onAuthUpdate,
  onLogout,
}: {
  auth: AuthData;
  onAuthUpdate: (next: AuthData) => void;
  onLogout: () => void;
}) {
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [selected, setSelected] = useState<TrainingSession | null>(null);
  const [roster, setRoster] = useState<SessionRoster | null>(null);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [attendanceDirty, setAttendanceDirty] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");
  const [queuedAttendance, setQueuedAttendance] = useState<QueuedAttendance[]>([]);
  const [, setQueueReady] = useState(false);
  const [announcements, setAnnouncements] = useState<ParentAnnouncement[]>([]);
  const [students, setStudents] = useState<CoachStudent[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<CoachStudent | null>(null);
  const [studentFeedback, setStudentFeedback] = useState<CoachStudentFeedback[]>([]);
  const [studentHistory, setStudentHistory] = useState<CoachStudentHistory | null>(null);
  const [studentFeedbackLoading, setStudentFeedbackLoading] = useState(false);
  const [feedbackPerformance, setFeedbackPerformance] = useState("");
  const [feedbackGuidance, setFeedbackGuidance] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [profileName, setProfileName] = useState(auth.user.displayName);
  const [profileSaving, setProfileSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [oldestLoadedDays] = useState(76);
  const [classView, setClassView] = useState<"upcoming" | "history">("upcoming");
  const [studentSearch, setStudentSearch] = useState("");

  // Current Active Tab
  const [tab, setTab] = useState<CoachTab>("today");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const [, setStudentsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const timeZone = auth.user.academyTimezone ?? "Asia/Kolkata";
  const firstName = auth.user.displayName.split(" ")[0];

  // Load offline attendance queue on mount
  useEffect(() => {
    let active = true;
    readAttendanceQueue()
      .then((queue) => {
        if (active) setQueuedAttendance(queue);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(caught instanceof Error ? caught.message : "Could not read offline attendance.");
      })
      .finally(() => {
        if (active) setQueueReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadSessions = useCallback(async () => {
    const now = Date.now();
    const from = new Date(now - oldestLoadedDays * 86_400_000).toISOString();
    const to = new Date(now + 14 * 86_400_000).toISOString();
    const result = await requestMobileData(
      `/coach/me/sessions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      (value) => z.object({ sessions: TrainingSessionSchema.array() }).parse(value),
      auth,
      onAuthUpdate,
    );
    setSessions(result.sessions);
    void syncCoachClassReminders(result.sessions);
  }, [auth, onAuthUpdate, oldestLoadedDays]);

  const loadAnnouncements = useCallback(async () => {
    setAnnouncementsLoading(true);
    try {
      const result = await requestMobileData(
        "/coach/announcements",
        (value) => ParentAnnouncementListSchema.parse(value),
        auth,
        onAuthUpdate,
      );
      setAnnouncements(result.announcements);
    } catch {
      // Announcements error is non-blocking
    } finally {
      setAnnouncementsLoading(false);
    }
  }, [auth, onAuthUpdate]);

  const loadStudents = useCallback(async () => {
    setStudentsLoading(true);
    try {
      const result = await requestMobileData(
        "/coach/me/students",
        (value) => z.object({ students: CoachStudentSchema.array() }).parse(value),
        auth,
        onAuthUpdate,
      );
      setStudents(result.students);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load students.");
    } finally {
      setStudentsLoading(false);
    }
  }, [auth, onAuthUpdate]);

  useEffect(() => {
    Promise.all([loadSessions(), loadAnnouncements(), loadStudents()])
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Could not load workspace data.");
      })
      .finally(() => setLoading(false));
  }, [loadSessions, loadAnnouncements, loadStudents]);

  async function refreshSessions() {
    setRefreshing(true);
    setError(null);
    try {
      await Promise.all([loadSessions(), loadAnnouncements(), loadStudents()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not refresh data.");
    } finally {
      setRefreshing(false);
    }
  }

  // -------------------------------------------------------------
  // Derived Session Metrics
  // -------------------------------------------------------------
  const todaysSessions = useMemo(() => {
    return sessions
      .filter((session) => sameLocalDay(session.startsAt, timeZone))
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [sessions, timeZone]);

  const nextTodaySession = useMemo(() => {
    const now = Date.now();
    return todaysSessions.find((session) => {
      const ends = new Date(session.endsAt).getTime();
      return ends > now || session.status === "scheduled";
    }) ?? todaysSessions[0] ?? null;
  }, [todaysSessions]);

  const completedToday = useMemo(() => {
    return todaysSessions.filter((session) => session.status === "completed").length;
  }, [todaysSessions]);

  const activeCheckedInSession = useMemo(() => {
    return todaysSessions.find((s) => s.coachCheckedInAt && !s.coachCheckedOutAt);
  }, [todaysSessions]);

  const checkInEligibleSession = useMemo(() => {
    const now = Date.now();
    return todaysSessions.find((s) => {
      if (s.coachCheckedInAt) return false;
      const opensAt = new Date(s.startsAt).getTime() - 15 * 60 * 1000;
      const endsAt = new Date(s.endsAt).getTime();
      return now >= opensAt && now <= endsAt;
    });
  }, [todaysSessions]);

  const pendingAttendanceSessions = useMemo(() => {
    return todaysSessions.filter((s) => s.status === "scheduled");
  }, [todaysSessions]);

  const unreadAnnouncementsCount = useMemo(() => {
    return announcements.filter((a) => !a.readAt).length;
  }, [announcements]);

  // -------------------------------------------------------------
  // Operations & Presence Actions
  // -------------------------------------------------------------
  async function recordSessionTime(action: "check-in" | "check-out", targetSession?: TrainingSession) {
    const sessionToRecord = targetSession || selected;
    if (!sessionToRecord) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      let body: string | undefined;
      if (action === "check-in") {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          throw new Error("Allow location access so the academy can verify you’re at this branch.");
        }
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (position.coords.accuracy === null || position.coords.accuracy > 100) {
          throw new Error("Your location accuracy is insufficient. Move outdoors and try again.");
        }
        body = JSON.stringify({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        });
      }
      const presence = await requestMobileData(
        `/coach/sessions/${sessionToRecord.id}/${action}`,
        (value) =>
          z
            .object({
              checkedInAt: z.string().datetime(),
              checkedOutAt: z.string().datetime().nullable(),
            })
            .parse(value),
        auth,
        onAuthUpdate,
        { method: "POST", ...(body ? { body } : {}) },
      );
      const updateSession = (session: TrainingSession): TrainingSession =>
        session.id === sessionToRecord.id
          ? {
              ...session,
              coachCheckedInAt: presence.checkedInAt,
              coachCheckedOutAt: presence.checkedOutAt,
            }
          : session;
      setSelected((current) => (current ? updateSession(current) : current));
      setSessions((current) => current.map(updateSession));
      setRoster((current) =>
        current ? { ...current, session: updateSession(current.session) } : current,
      );
      setNotice(
        action === "check-in"
          ? "Location verified. Your check-in time is recorded."
          : "Your check-out time is recorded.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not record ${action}.`);
    } finally {
      setBusy(false);
    }
  }

  async function openSession(session: TrainingSession) {
    setSelected(session);
    setTab("classes");
    setRosterLoading(true);
    setError(null);
    setNotice(null);
    try {
      const data = await requestMobileData(
        `/coach/sessions/${session.id}/roster`,
        (value) => SessionRosterSchema.parse(value),
        auth,
        onAuthUpdate,
      );
      setRoster(data);
      const initial: Record<string, AttendanceStatus> = {};
      data.students.forEach((student) => {
        initial[student.studentId] = student.status || "present";
      });
      setAttendance(initial);
      setAttendanceDirty(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this class roster.");
    } finally {
      setRosterLoading(false);
    }
  }

  function closeSession() {
    setSelected(null);
    setRoster(null);
    setAttendance({});
    setAttendanceDirty(false);
    setSessionNotes("");
  }

  async function saveAttendance() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const records = Object.entries(attendance).map(([studentId, status]) => ({
      studentId,
      status,
    }));
    try {
      await requestMobileData(
        `/coach/sessions/${selected.id}/attendance`,
        (value) => value,
        auth,
        onAuthUpdate,
        {
          method: "PUT",
          body: JSON.stringify({ records }),
        },
      );
      setAttendanceDirty(false);
      setNotice("Student attendance saved successfully.");
      await loadSessions();
    } catch (caught) {
      // Offline fallback: enqueue attendance locally
      try {
        const item: QueuedAttendance = {
          sessionId: selected.id,
          coachUserId: auth.user.id,
          batchName: selected.batchName,
          startsAt: selected.startsAt,
          records,
          queuedAt: new Date().toISOString(),
        };
        const nextQueue = await enqueueAttendance(item);
        setQueuedAttendance(nextQueue);
        setAttendanceDirty(false);
        setNotice("Saved locally. It will automatically sync once connectivity restores.");
      } catch {
        setError(caught instanceof Error ? caught.message : "Could not save attendance.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function completeSession() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await requestMobileData(
        `/coach/sessions/${selected.id}/complete`,
        (value) => value,
        auth,
        onAuthUpdate,
        {
          method: "POST",
          body: JSON.stringify({ notes: sessionNotes.trim() || undefined }),
        },
      );
      setNotice("Class session marked complete.");
      closeSession();
      await loadSessions();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not complete session.");
    } finally {
      setBusy(false);
    }
  }

  async function syncQueuedAttendance() {
    setBusy(true);
    setError(null);
    setNotice(null);
    let synced = 0;
    try {
      for (const item of queuedAttendance) {
        await requestMobileData(
          `/coach/sessions/${item.sessionId}/attendance`,
          (value) => value,
          auth,
          onAuthUpdate,
          {
            method: "PUT",
            body: JSON.stringify({ records: item.records }),
          },
        );
        await removeQueuedAttendance(item.sessionId);
        synced += 1;
      }
      const updatedQueue = await readAttendanceQueue();
      setQueuedAttendance(updatedQueue);
      setNotice(`Synchronized ${synced} attendance record${synced === 1 ? "" : "s"}.`);
      await loadSessions();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sync all records.");
    } finally {
      setBusy(false);
    }
  }

  // -------------------------------------------------------------
  // Student Actions
  // -------------------------------------------------------------
  async function openStudent(student: CoachStudent) {
    setSelectedStudent(student);
    setStudentFeedbackLoading(true);
    setError(null);
    try {
      const [fb, hist] = await Promise.all([
        requestMobileData(
          `/coach/students/${student.studentId}/feedback`,
          (value) => z.object({ feedback: CoachStudentFeedbackSchema.array() }).parse(value),
          auth,
          onAuthUpdate,
        ),
        requestMobileData(
          `/coach/students/${student.studentId}/history`,
          (value) => CoachStudentHistorySchema.parse(value),
          auth,
          onAuthUpdate,
        ),
      ]);
      setStudentFeedback(fb.feedback);
      setStudentHistory(hist);
      const currentWeek = currentWeekStart(timeZone);
      const existing = fb.feedback.find((f) => f.weekOf === currentWeek);
      setFeedbackPerformance(existing?.performance ?? "");
      setFeedbackGuidance(existing?.guidance ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load student profile.");
    } finally {
      setStudentFeedbackLoading(false);
    }
  }

  async function saveStudentFeedback() {
    if (!selectedStudent || !feedbackPerformance.trim()) return;
    setFeedbackSaving(true);
    setError(null);
    setNotice(null);
    try {
      const input = CoachStudentFeedbackRequestSchema.parse({
        weekOf: currentWeekStart(timeZone),
        performance: feedbackPerformance.trim(),
        guidance: feedbackGuidance.trim() || "",
      });
      await requestMobileData(
        `/coach/students/${selectedStudent.studentId}/feedback`,
        (value) => value,
        auth,
        onAuthUpdate,
        {
          method: "PUT",
          body: JSON.stringify(input),
        },
      );
      setNotice("Feedback & progress observations recorded.");
      await openStudent(selectedStudent);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save feedback.");
    } finally {
      setFeedbackSaving(false);
    }
  }

  // -------------------------------------------------------------
  // Profile & Password Actions
  // -------------------------------------------------------------
  async function saveCoachProfile() {
    if (!profileName.trim()) return;
    setProfileSaving(true);
    setError(null);
    setNotice(null);
    try {
      const input = UpdateCoachProfileRequestSchema.parse({ displayName: profileName.trim() });
      await requestMobileData("/coach/me/profile", (v) => v, auth, onAuthUpdate, {
        method: "PUT",
        body: JSON.stringify(input),
      });
      onAuthUpdate({ ...auth, user: { ...auth.user, displayName: profileName.trim() } });
      setNotice("Profile updated successfully.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function changeCoachPassword() {
    if (!currentPassword || newPassword.length < 14) return;
    setPasswordSaving(true);
    setError(null);
    setNotice(null);
    try {
      const input = ChangePasswordRequestSchema.parse({ currentPassword, newPassword });
      await requestMobileData("/auth/change-password", (v) => v, auth, onAuthUpdate, {
        method: "POST",
        body: JSON.stringify(input),
      });
      setCurrentPassword("");
      setNewPassword("");
      setNotice("Password changed successfully.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change password.");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function markAnnouncementRead(id: string) {
    try {
      await requestMobileData(`/coach/announcements/${id}/read`, (v) => v, auth, onAuthUpdate, {
        method: "POST",
      });
      setAnnouncements((prev) =>
        prev.map((a) => (a.id === id ? { ...a, read: true } : a)),
      );
    } catch {
      // Non-blocking
    }
  }

  // =============================================================
  // TAB 1: HOME REFERENCE SCREEN (Phase 3 Spec)
  // =============================================================
  function renderHome() {
    return (
      <View style={styles.homeContainer}>
        {/* 1. Compact Personalized Greeting & Current Date */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingTitle}>Hello, {firstName}</Text>
          <Text style={styles.greetingDate}>
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "short",
              timeZone,
            })}
          </Text>
        </View>

        {/* 2. Coach Current Work Check-In Status */}
        <Card style={styles.workStatusCard}>
          <View style={styles.workStatusHeader}>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusPulseDot,
                  {
                    backgroundColor: activeCheckedInSession
                      ? colors.success
                      : checkInEligibleSession
                        ? colors.brand
                        : colors.muted,
                  },
                ]}
              />
              <Text style={styles.workStatusLabel}>
                {activeCheckedInSession
                  ? "Active on Field"
                  : checkInEligibleSession
                    ? "Check-In Window Open"
                    : "Work Status"}
              </Text>
            </View>

            <Badge
              label={
                activeCheckedInSession
                  ? "Checked In"
                  : checkInEligibleSession
                    ? "Ready"
                    : `${todaysSessions.length} Classes Today`
              }
              variant={
                activeCheckedInSession
                  ? "success"
                  : checkInEligibleSession
                    ? "brand"
                    : "neutral"
              }
            />
          </View>

          <Text style={styles.workStatusDetail}>
            {activeCheckedInSession
              ? `Checked in at ${formatTime(activeCheckedInSession.coachCheckedInAt!, timeZone)} for ${activeCheckedInSession.batchName}.`
              : checkInEligibleSession
                ? `Ready to check in for ${checkInEligibleSession.batchName}. Tap below to verify GPS presence.`
                : todaysSessions.length
                  ? `Your next class is scheduled at ${formatTime(todaysSessions[0]!.startsAt, timeZone)}.`
                  : "No classes scheduled on your timetable today."}
          </Text>

          {/* Quick Action Button */}
          {activeCheckedInSession ? (
            <View style={styles.workStatusActionRow}>
              <Button
                title="Check Out of Class"
                variant="outline"
                size="sm"
                disabled={busy}
                onPress={() => void recordSessionTime("check-out", activeCheckedInSession)}
              />
              <Button
                title="Open Roster"
                variant="primary"
                size="sm"
                onPress={() => void openSession(activeCheckedInSession)}
              />
            </View>
          ) : checkInEligibleSession ? (
            <Button
              title="Verify & Check In (GPS)"
              variant="primary"
              size="md"
              disabled={busy}
              loading={busy}
              icon={<WorkspaceIcon name="map-pin" size={16} color="#FFFFFF" />}
              onPress={() => void recordSessionTime("check-in", checkInEligibleSession)}
              style={styles.marginTopSm}
            />
          ) : null}
        </Card>

        {/* 3. Next Scheduled Class Spotlight */}
        {nextTodaySession ? (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeadingRow}>
              <Text style={styles.sectionTitle}>Next Scheduled Class</Text>
              <Pressable accessibilityRole="button" onPress={() => setTab("classes")}>
                <Text style={styles.sectionActionText}>View timetable</Text>
              </Pressable>
            </View>

            <Card
              onPress={() => void openSession(nextTodaySession)}
              style={styles.nextSessionCard}
            >
              <View style={styles.nextSessionHeader}>
                <Badge
                  label={
                    new Date(nextTodaySession.endsAt).getTime() <= Date.now()
                      ? "Attendance Due"
                      : new Date(nextTodaySession.startsAt).getTime() > Date.now()
                        ? "Up Next"
                        : "In Progress"
                  }
                  variant={
                    new Date(nextTodaySession.endsAt).getTime() <= Date.now()
                      ? "warning"
                      : "brand"
                  }
                  dot
                />
                <Text style={styles.nextSessionTimeBadge}>
                  {formatTime(nextTodaySession.startsAt, timeZone)} – {formatTime(nextTodaySession.endsAt, timeZone)}
                </Text>
              </View>

              <Text style={styles.nextSessionBatchName}>{nextTodaySession.batchName}</Text>

              <View style={styles.nextSessionMetaRow}>
                <WorkspaceIcon name="map-pin" size={14} color={colors.textSecondary} />
                <Text style={styles.nextSessionMetaText} numberOfLines={1}>
                  {[nextTodaySession.branchName, nextTodaySession.venue].filter(Boolean).join(" · ") ||
                    "Venue to be confirmed"}
                </Text>
              </View>

              <View style={styles.nextSessionFooter}>
                <Text style={styles.nextSessionStatusHint}>
                  {nextTodaySession.status === "completed"
                    ? "✓ Class marked completed"
                    : nextTodaySession.coachCheckedInAt
                      ? "Field check-in verified"
                      : "Check-in opens 15m before class"}
                </Text>
                <View style={styles.openClassAction}>
                  <Text style={styles.openClassText}>Open Roster</Text>
                  <WorkspaceIcon name="chevron-right" size={16} color={colors.brand} />
                </View>
              </View>
            </Card>
          </View>
        ) : null}

        {/* 4. Today's Remaining Classes */}
        {todaysSessions.length > 1 ? (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeadingRow}>
              <Text style={styles.sectionTitle}>Today's Schedule</Text>
              <Text style={styles.sectionCountText}>
                {completedToday} of {todaysSessions.length} done
              </Text>
            </View>

            <View style={styles.sessionListGap}>
              {todaysSessions
                .filter((s) => s.id !== nextTodaySession?.id)
                .map((session) => (
                  <Card
                    key={session.id}
                    onPress={() => void openSession(session)}
                    style={styles.compactSessionCard}
                  >
                    <View style={styles.compactSessionMain}>
                      <Text style={styles.compactSessionBatch}>{session.batchName}</Text>
                      <Text style={styles.compactSessionTime}>
                        {formatTime(session.startsAt, timeZone)} – {formatTime(session.endsAt, timeZone)}
                      </Text>
                    </View>
                    <Badge
                      label={session.status}
                      variant={session.status === "completed" ? "success" : "neutral"}
                    />
                  </Card>
                ))}
            </View>
          </View>
        ) : null}

        {/* 5. Student Attendance Tasks Requiring Action */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Attendance Tasks</Text>
          {pendingAttendanceSessions.length > 0 ? (
            pendingAttendanceSessions.map((s) => (
              <Card
                key={s.id}
                onPress={() => void openSession(s)}
                style={styles.attendanceTaskCard}
              >
                <View style={styles.taskAlertIcon}>
                  <WorkspaceIcon name="alert" size={18} color={colors.warning} />
                </View>
                <View style={styles.taskCopy}>
                  <Text style={styles.taskTitle}>{s.batchName}</Text>
                  <Text style={styles.taskDetail}>
                    Attendance awaiting submission for today's session.
                  </Text>
                </View>
                <WorkspaceIcon name="chevron-right" size={16} color={colors.muted} />
              </Card>
            ))
          ) : (
            <Card style={styles.allClearCard}>
              <WorkspaceIcon name="check" size={18} color={colors.success} />
              <Text style={styles.allClearText}>All student attendance is up to date.</Text>
            </Card>
          )}
        </View>

        {/* 6. Important Academy Notices & Reminders */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeadingRow}>
            <Text style={styles.sectionTitle}>Academy Broadcasts</Text>
            <Pressable accessibilityRole="button" onPress={() => setTab("notices")}>
              <Text style={styles.sectionActionText}>
                {unreadAnnouncementsCount > 0
                  ? `${unreadAnnouncementsCount} unread`
                  : "View all"}
              </Text>
            </Pressable>
          </View>

          {announcementsLoading ? (
            <ActivityIndicator color={colors.brand} style={styles.loaderPadding} />
          ) : announcements.length > 0 ? (
            announcements.slice(0, 2).map((a) => (
              <Card
                key={a.id}
                onPress={() => {
                  void markAnnouncementRead(a.id);
                  setTab("notices");
                }}
                style={styles.noticeCard}
              >
                <View style={styles.noticeCardHeader}>
                  <Text style={styles.noticeCardTitle}>{a.title}</Text>
                  {!a.readAt ? <View style={styles.unreadDot} /> : null}
                </View>
                <Text style={styles.noticeCardBody} numberOfLines={2}>
                  {a.body}
                </Text>
              </Card>
            ))
          ) : (
            <Text style={styles.emptyNoticeText}>No new academy broadcasts.</Text>
          )}
        </View>
      </View>
    );
  }

  // =============================================================
  // TAB 2: CLASSES & ROSTER SCREEN
  // =============================================================
  function renderClasses() {
    if (selected) {
      return (
        <View style={styles.classesContainer}>
          {/* Back button to class list */}
          <Pressable
            accessibilityRole="button"
            onPress={closeSession}
            style={styles.backButtonRow}
          >
            <WorkspaceIcon name="chevron-left" size={18} color={colors.brand} />
            <Text style={styles.backButtonText}>All Classes</Text>
          </Pressable>

          <Card style={styles.classDetailHeaderCard}>
            <View style={styles.nextSessionHeader}>
              <Badge label={selected.status} variant={selected.status === "completed" ? "success" : "brand"} />
              <Text style={styles.nextSessionTimeBadge}>
                {formatTime(selected.startsAt, timeZone)} – {formatTime(selected.endsAt, timeZone)}
              </Text>
            </View>
            <Text style={styles.detailBatchTitle}>{selected.batchName}</Text>
            <Text style={styles.detailVenueText}>
              {[selected.branchName, selected.venue].filter(Boolean).join(" · ") || "Location to be confirmed"}
            </Text>

            {/* Check-In / Check-Out Presence Section */}
            <View style={styles.presenceBox}>
              <View style={styles.presenceInfo}>
                <Text style={styles.presenceStatusTitle}>
                  {selected.coachCheckedInAt
                    ? `Checked in: ${formatTime(selected.coachCheckedInAt, timeZone)}`
                    : "Field check-in pending"}
                </Text>
                {selected.coachCheckedOutAt ? (
                  <Text style={styles.presenceSubText}>
                    Checked out: {formatTime(selected.coachCheckedOutAt, timeZone)}
                  </Text>
                ) : null}
              </View>

              {!selected.coachCheckedInAt ? (
                <Button
                  title="Check In"
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  loading={busy}
                  onPress={() => void recordSessionTime("check-in")}
                />
              ) : !selected.coachCheckedOutAt ? (
                <Button
                  title="Check Out"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  loading={busy}
                  onPress={() => void recordSessionTime("check-out")}
                />
              ) : null}
            </View>
          </Card>

          {/* Student Roster Section */}
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeadingRow}>
              <Text style={styles.sectionTitle}>
                Student Roster ({roster?.students.length ?? 0})
              </Text>
              {attendanceDirty ? (
                <Text style={styles.unsavedNotice}>● Unsaved changes</Text>
              ) : null}
            </View>

            {rosterLoading ? (
              <ActivityIndicator color={colors.brand} style={styles.loaderPadding} />
            ) : roster?.students.length ? (
              <View style={styles.rosterList}>
                {roster.students.map((student) => {
                  const currentStatus = attendance[student.studentId] || "present";
                  return (
                    <Card key={student.studentId} style={styles.rosterCard}>
                      <View style={styles.rosterStudentInfo}>
                        <View style={styles.studentAvatar}>
                          <Text style={styles.studentAvatarText}>
                            {student.studentName.slice(0, 1).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.rosterStudentName}>{student.studentName}</Text>
                      </View>

                      {/* 4 Attendance Pills */}
                      <View style={styles.attendanceButtonsRow}>
                        {statusOptions.map((st) => {
                          const isSelected = currentStatus === st;
                          return (
                            <Pressable
                              key={st}
                              accessibilityRole="button"
                              onPress={() => {
                                setAttendance((prev) => ({ ...prev, [student.studentId]: st }));
                                setAttendanceDirty(true);
                              }}
                              style={[
                                styles.attendancePill,
                                isSelected && styles.attendancePillActive,
                                isSelected && st === "present" && styles.pillPresent,
                                isSelected && st === "absent" && styles.pillAbsent,
                                isSelected && st === "late" && styles.pillLate,
                                isSelected && st === "excused" && styles.pillExcused,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.attendancePillText,
                                  isSelected && styles.attendancePillTextActive,
                                ]}
                              >
                                {statusLabels[st]}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Card>
                  );
                })}
              </View>
            ) : (
              <EmptyState title="Empty Class Roster" detail="No students are enrolled in this batch." />
            )}

            {/* Attendance Action Bar */}
            {roster?.students.length ? (
              <View style={styles.attendanceActionFooter}>
                <Button
                  title={attendanceDirty ? "Save Attendance" : "Attendance Saved"}
                  variant="primary"
                  size="lg"
                  disabled={busy || !attendanceDirty}
                  loading={busy}
                  onPress={() => void saveAttendance()}
                  style={styles.flex1}
                />
              </View>
            ) : null}

            {/* Complete Class Form */}
            {selected.status === "scheduled" ? (
              <Card style={styles.completeCard}>
                <Text style={styles.completeCardTitle}>Session Notes & Completion</Text>
                <TextInput
                  value={sessionNotes}
                  onChangeText={setSessionNotes}
                  placeholder="Add training observations, drill notes, or field feedback..."
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={3}
                  style={styles.notesInput}
                />
                <Button
                  title="Mark Class Complete"
                  variant="secondary"
                  size="md"
                  disabled={busy}
                  onPress={() => void completeSession()}
                />
              </Card>
            ) : null}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.classesContainer}>
        {/* Toggle between Upcoming and History */}
        <View style={styles.segmentedToggle}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setClassView("upcoming")}
            style={[styles.toggleBtn, classView === "upcoming" && styles.toggleBtnActive]}
          >
            <Text style={[styles.toggleBtnText, classView === "upcoming" && styles.toggleBtnTextActive]}>
              Upcoming & Today
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setClassView("history")}
            style={[styles.toggleBtn, classView === "history" && styles.toggleBtnActive]}
          >
            <Text style={[styles.toggleBtnText, classView === "history" && styles.toggleBtnTextActive]}>
              Class History
            </Text>
          </Pressable>
        </View>

        {/* Classes List */}
        {sessions.length === 0 ? (
          <EmptyState title="No classes assigned" detail="Assigned classes will appear on your timetable." />
        ) : (
          <View style={styles.sessionListGap}>
            {sessions
              .filter((s) => (classView === "upcoming" ? s.status === "scheduled" : s.status !== "scheduled"))
              .map((session) => (
                <Card
                  key={session.id}
                  onPress={() => void openSession(session)}
                  style={styles.classRowCard}
                >
                  <View style={styles.classRowHeader}>
                    <Text style={styles.classRowDate}>
                      {formatDate(session.startsAt, timeZone)} • {formatTime(session.startsAt, timeZone)}
                    </Text>
                    <Badge label={session.status} variant={session.status === "completed" ? "success" : "neutral"} />
                  </View>
                  <Text style={styles.classRowBatch}>{session.batchName}</Text>
                  <Text style={styles.classRowVenue}>
                    {[session.branchName, session.venue].filter(Boolean).join(" · ") || "Venue to be confirmed"}
                  </Text>
                </Card>
              ))}
          </View>
        )}
      </View>
    );
  }

  // =============================================================
  // TAB 3: STUDENTS & OBSERVATIONS
  // =============================================================
  function renderStudents() {
    if (selectedStudent) {
      return (
        <View style={styles.studentsContainer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelectedStudent(null)}
            style={styles.backButtonRow}
          >
            <WorkspaceIcon name="chevron-left" size={18} color={colors.brand} />
            <Text style={styles.backButtonText}>All Students</Text>
          </Pressable>

          <Card style={styles.studentProfileCard}>
            <View style={styles.studentProfileAvatar}>
              <Text style={styles.studentProfileAvatarText}>
                {selectedStudent.studentName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.studentProfileName}>{selectedStudent.studentName}</Text>
            <Text style={styles.studentProfileBatches}>
              {selectedStudent.batches.map((b) => b.name).join(" • ")}
            </Text>
          </Card>

          {/* Feedback & Observation Form */}
          <Card style={styles.feedbackCard}>
            <Text style={styles.feedbackCardTitle}>Weekly Progress Observations</Text>
            <Text style={styles.feedbackCardSubtitle}>
              Notes shared here will be visible to parents in their mobile feed.
            </Text>

            <Text style={styles.inputLabel}>Skill Performance</Text>
            <TextInput
              value={feedbackPerformance}
              onChangeText={setFeedbackPerformance}
              placeholder="e.g. Excellent ball control during tactical passing drills..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              style={styles.notesInput}
            />

            <Text style={styles.inputLabel}>Guidance & Focus Areas</Text>
            <TextInput
              value={feedbackGuidance}
              onChangeText={setFeedbackGuidance}
              placeholder="e.g. Focus on first-touch awareness and defensive transitions..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={2}
              style={styles.notesInput}
            />

            <Button
              title={feedbackSaving ? "Saving Observations…" : "Save Progress Notes"}
              variant="primary"
              size="md"
              disabled={feedbackSaving || !feedbackPerformance.trim()}
              loading={feedbackSaving}
              onPress={() => void saveStudentFeedback()}
            />
          </Card>

          {/* Past Observations History */}
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle}>Observation History</Text>
            {studentFeedbackLoading ? (
              <ActivityIndicator color={colors.brand} style={styles.loaderPadding} />
            ) : studentFeedback.length ? (
              studentFeedback.map((f) => (
                <Card key={f.id} style={styles.historyCard}>
                  <Text style={styles.historyWeek}>Week of {f.weekOf}</Text>
                  <Text style={styles.historyPerf}>{f.performance}</Text>
                  {f.guidance ? <Text style={styles.historyGuidance}>Focus: {f.guidance}</Text> : null}
                </Card>
              ))
            ) : (
              <Text style={styles.emptyInline}>No past observations logged yet.</Text>
            )}
          </View>
        </View>
      );
    }

    const filteredStudents = students.filter((st) =>
      st.studentName.toLowerCase().includes(studentSearch.toLowerCase()),
    );

    return (
      <View style={styles.studentsContainer}>
        {/* Search Bar */}
        <View style={styles.searchBarWrap}>
          <WorkspaceIcon name="search" size={16} color={colors.muted} />
          <TextInput
            value={studentSearch}
            onChangeText={setStudentSearch}
            placeholder="Search students by name..."
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
        </View>

        {filteredStudents.length === 0 ? (
          <EmptyState title="No students found" detail="No student records match your search." icon="students" />
        ) : (
          <View style={styles.sessionListGap}>
            {filteredStudents.map((st) => (
              <Card
                key={st.studentId}
                onPress={() => void openStudent(st)}
                style={styles.studentRowCard}
              >
                <View style={styles.studentAvatar}>
                  <Text style={styles.studentAvatarText}>{st.studentName.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.studentRowInfo}>
                  <Text style={styles.studentRowName}>{st.studentName}</Text>
                  <Text style={styles.studentRowBatches}>
                    {st.batches.map((b) => b.name).join(" • ")}
                  </Text>
                </View>
                <WorkspaceIcon name="chevron-right" size={16} color={colors.muted} />
              </Card>
            ))}
          </View>
        )}
      </View>
    );
  }

  // =============================================================
  // TAB 4: MY WORK (Check-In/Out, Duration, Shift History)
  // =============================================================
  function renderMyWork() {
    const checkedInCount = sessions.filter((s) => s.coachCheckedInAt).length;

    return (
      <View style={styles.workContainer}>
        {/* Daily Shift Status Card */}
        <Card style={styles.workStatusCard}>
          <Text style={styles.sectionTitle}>Work Attendance & Presence</Text>
          <Text style={styles.workStatusDetail}>
            {activeCheckedInSession
              ? `Currently active on field for ${activeCheckedInSession.batchName}. Check-in timestamp verified.`
              : "You are currently off field. Attendance punches verify coach location at branch facilities."}
          </Text>

          {activeCheckedInSession ? (
            <Button
              title="Record Check-Out"
              variant="danger"
              size="md"
              disabled={busy}
              loading={busy}
              onPress={() => void recordSessionTime("check-out", activeCheckedInSession)}
              style={styles.marginTopSm}
            />
          ) : checkInEligibleSession ? (
            <Button
              title={`Check In: ${checkInEligibleSession.batchName}`}
              variant="primary"
              size="md"
              disabled={busy}
              loading={busy}
              onPress={() => void recordSessionTime("check-in", checkInEligibleSession)}
              style={styles.marginTopSm}
            />
          ) : null}
        </Card>

        {/* Working Hours Summary */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Monthly Shift Summary</Text>
          <View style={styles.workSummaryGrid}>
            <Card style={styles.summaryStatCard}>
              <Text style={styles.statNumber}>{checkedInCount}</Text>
              <Text style={styles.statLabel}>Sessions Verified</Text>
            </Card>
            <Card style={styles.summaryStatCard}>
              <Text style={styles.statNumber}>{completedToday}</Text>
              <Text style={styles.statLabel}>Completed Today</Text>
            </Card>
          </View>
        </View>

        {/* Shift Punches & Attendance Rules */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Shift Policy & Missed Punches</Text>
          <Card style={styles.policyCard}>
            <View style={styles.policyRow}>
              <WorkspaceIcon name="clock" size={16} color={colors.brand} />
              <Text style={styles.policyText}>Check-in window opens 15 minutes before class start time.</Text>
            </View>
            <View style={styles.policyRow}>
              <WorkspaceIcon name="map-pin" size={16} color={colors.brand} />
              <Text style={styles.policyText}>GPS radius verification ensures presence on academy turf.</Text>
            </View>
            <View style={styles.policyRow}>
              <WorkspaceIcon name="shield" size={16} color={colors.muted} />
              <Text style={styles.policyText}>
                Missed punches and shift corrections must be submitted to the academy office.
              </Text>
            </View>
          </Card>
        </View>
      </View>
    );
  }

  // =============================================================
  // TAB 5: PROFILE & PLANNED EARNINGS
  // =============================================================
  function renderProfile() {
    return (
      <View style={styles.profileContainer}>
        {/* Profile Card */}
        <Card style={styles.profileCard}>
          <View style={styles.profileAvatarLarge}>
            <Text style={styles.profileAvatarTextLarge}>{(firstName || "C").slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={styles.profileFullName}>{auth.user.displayName}</Text>
          <Text style={styles.profileEmail}>{auth.user.email}</Text>
          <Badge label={`${auth.user.academyName} • Coach`} variant="brand" style={styles.marginTopSm} />
        </Card>

        {/* Planned Earnings Section (Transparently scoped) */}
        <Card style={styles.earningsCard}>
          <View style={styles.earningsHeader}>
            <WorkspaceIcon name="wallet" size={20} color={colors.brand} />
            <Text style={styles.earningsTitle}>Compensation & Earnings</Text>
          </View>
          <Text style={styles.earningsSubText}>
            Official payslips, coaching allowances, and payment disbursements are managed by academy administration.
          </Text>
          <View style={styles.earningsStatusBox}>
            <Text style={styles.earningsStatusLabel}>Payroll Status</Text>
            <Text style={styles.earningsStatusVal}>Verified with Academy Office</Text>
          </View>
        </Card>

        {/* Edit Profile Name */}
        <Card style={styles.profileFormCard}>
          <Text style={styles.formSectionTitle}>Account Details</Text>
          <Text style={styles.inputLabel}>Display Name</Text>
          <TextInput
            value={profileName}
            onChangeText={setProfileName}
            maxLength={160}
            style={styles.textInputSingle}
          />
          <Button
            title={profileSaving ? "Saving…" : "Save Name"}
            variant="secondary"
            size="sm"
            disabled={profileSaving || !profileName.trim()}
            onPress={() => void saveCoachProfile()}
            style={styles.marginTopSm}
          />
        </Card>

        {/* Change Password */}
        <Card style={styles.profileFormCard}>
          <Text style={styles.formSectionTitle}>Security</Text>
          <TextInput
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Current password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={styles.textInputSingle}
          />
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="New password (min 14 chars)"
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={[styles.textInputSingle, styles.marginTopSm]}
          />
          <Button
            title={passwordSaving ? "Updating…" : "Change Password"}
            variant="secondary"
            size="sm"
            disabled={passwordSaving || !currentPassword || newPassword.length < 14}
            onPress={() => void changeCoachPassword()}
            style={styles.marginTopSm}
          />
        </Card>

        {/* Logout Button */}
        <Button
          title="Sign Out"
          variant="danger"
          size="lg"
          icon={<WorkspaceIcon name="log-out" size={18} color="#FFFFFF" />}
          onPress={onLogout}
          style={styles.marginTopMd}
        />
      </View>
    );
  }

  // =============================================================
  // SUB-VIEW: NOTICES HUB
  // =============================================================
  function renderNotices() {
    return (
      <View style={styles.noticesContainer}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setTab("today")}
          style={styles.backButtonRow}
        >
          <WorkspaceIcon name="chevron-left" size={18} color={colors.brand} />
          <Text style={styles.backButtonText}>Back to Home</Text>
        </Pressable>

        <Text style={styles.noticesHeading}>Academy Broadcasts</Text>

        {announcements.length === 0 ? (
          <EmptyState title="No notices" detail="Academy announcements will appear here." icon="bell" />
        ) : (
          announcements.map((a) => (
            <Card
              key={a.id}
              onPress={() => void markAnnouncementRead(a.id)}
              style={styles.noticeCardFull}
            >
              <View style={styles.noticeHeaderRow}>
                <Text style={styles.noticeTitleFull}>{a.title}</Text>
                {!a.readAt ? <Badge label="New" variant="brand" /> : null}
              </View>
              <Text style={styles.noticeBodyFull}>{a.body}</Text>
            </Card>
          ))
        )}
      </View>
    );
  }

  // Active Content Router
  function renderContent() {
    if (tab === "notices") return renderNotices();
    if (tab === "classes") return renderClasses();
    if (tab === "students") return renderStudents();
    if (tab === "work") return renderMyWork();
    if (tab === "profile") return renderProfile();
    return renderHome();
  }

  return (
    <View style={styles.screen}>
      {/* Top Header Bar */}
      <View style={styles.header}>
        <View style={styles.brandLockup}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>S</Text>
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.brandName}>SportDesk</Text>
            <Text numberOfLines={1} style={styles.academyName}>
              {auth.user.academyName}
            </Text>
          </View>
        </View>

        {/* Notices Bell Icon */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Academy notices, ${unreadAnnouncementsCount} unread`}
          onPress={() => setTab(tab === "notices" ? "today" : "notices")}
          style={[styles.bellButton, tab === "notices" && styles.bellButtonActive]}
        >
          <WorkspaceIcon
            name="bell"
            color={tab === "notices" ? colors.brand : colors.ink}
            size={20}
          />
          {unreadAnnouncementsCount > 0 ? <View style={styles.bellBadge} /> : null}
        </Pressable>
      </View>

      {/* Main Content Area */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshSessions()}
            tintColor={colors.brand}
          />
        }
      >
        {/* Offline Queue Sync Banner */}
        {queuedAttendance.length > 0 ? (
          <Card style={styles.queueBannerCard}>
            <View style={styles.queueCopy}>
              <Text style={styles.queueTitle}>
                {queuedAttendance.length} attendance record{queuedAttendance.length === 1 ? "" : "s"} waiting to sync
              </Text>
              <Text style={styles.queueDetail}>Saved safely offline. Tap to push to academy cloud.</Text>
            </View>
            <Button
              title={busy ? "Syncing…" : "Sync Now"}
              variant="primary"
              size="sm"
              disabled={busy}
              onPress={() => void syncQueuedAttendance()}
            />
          </Card>
        ) : null}

        {/* Alerts */}
        {error ? (
          <Card style={styles.errorAlertCard}>
            <WorkspaceIcon name="alert" size={16} color={colors.danger} />
            <Text style={styles.errorAlertText}>{error}</Text>
          </Card>
        ) : null}

        {notice ? (
          <Card style={styles.successAlertCard}>
            <WorkspaceIcon name="check" size={16} color={colors.success} />
            <Text style={styles.successAlertText}>{notice}</Text>
          </Card>
        ) : null}

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={styles.loaderText}>Syncing coach workspace…</Text>
          </View>
        ) : (
          renderContent()
        )}
      </ScrollView>

      {/* Persistent 5-Tab Bottom Navigation Bar */}
      <View style={styles.bottomNav}>
        {navItems.map((item) => {
          const active = tab === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                closeSession();
                setSelectedStudent(null);
                setTab(item.id);
              }}
              style={styles.navButton}
            >
              <View style={[styles.navIconContainer, active && styles.navIconContainerActive]}>
                <WorkspaceIcon
                  name={coachIconByTab[item.id]}
                  color={active ? colors.brand : colors.muted}
                  size={20}
                  strokeWidth={active ? 2.3 : 1.8}
                />
              </View>
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// -------------------------------------------------------------
// Stylesheet
// -------------------------------------------------------------
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brandLockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    flex: 1,
  },
  brandMark: {
    width: 32,
    height: 32,
    borderRadius: radii.sm + 2,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  brandMarkText: {
    ...typography.headline,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  headerCopy: {
    flex: 1,
  },
  brandName: {
    ...typography.headline,
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  academyName: {
    ...typography.subhead,
    fontSize: 11,
    color: colors.textSecondary,
  },
  bellButton: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  bellButtonActive: {
    backgroundColor: colors.brandSoft,
  },
  bellBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 40,
  },

  // Home Screen Styles
  homeContainer: {
    gap: spacing.lg,
  },
  greetingSection: {
    marginBottom: spacing.xs,
  },
  greetingTitle: {
    ...typography.title1,
  },
  greetingDate: {
    ...typography.callout,
    marginTop: spacing.xxs,
  },
  workStatusCard: {
    gap: spacing.sm,
  },
  workStatusHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  statusPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  workStatusLabel: {
    ...typography.headline,
    fontSize: 14,
  },
  workStatusDetail: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  workStatusActionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  sectionWrap: {
    gap: spacing.sm,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    ...typography.title3,
    fontSize: 16,
  },
  sectionActionText: {
    ...typography.callout,
    color: colors.brand,
    fontWeight: "600",
  },
  sectionCountText: {
    ...typography.callout,
    color: colors.textSecondary,
    fontSize: 12,
  },
  nextSessionCard: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  nextSessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  nextSessionTimeBadge: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  nextSessionBatchName: {
    ...typography.title2,
    fontSize: 18,
    color: colors.ink,
  },
  nextSessionMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  nextSessionMetaText: {
    ...typography.callout,
    color: colors.textSecondary,
    flex: 1,
  },
  nextSessionFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  nextSessionStatusHint: {
    ...typography.caption,
    color: colors.muted,
  },
  openClassAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  openClassText: {
    ...typography.callout,
    color: colors.brand,
    fontWeight: "600",
  },
  sessionListGap: {
    gap: spacing.sm,
  },
  compactSessionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
  },
  compactSessionMain: {
    flex: 1,
  },
  compactSessionBatch: {
    ...typography.headline,
    fontSize: 14,
  },
  compactSessionTime: {
    ...typography.subhead,
    color: colors.textSecondary,
    marginTop: 2,
  },
  attendanceTaskCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderColor: colors.warningSoft,
    backgroundColor: "#FFFCF5",
  },
  taskAlertIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.warningSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  taskCopy: {
    flex: 1,
  },
  taskTitle: {
    ...typography.headline,
    fontSize: 13,
  },
  taskDetail: {
    ...typography.subhead,
    color: colors.textSecondary,
    marginTop: 2,
  },
  allClearCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.successSoft,
    borderColor: colors.successSoft,
  },
  allClearText: {
    ...typography.callout,
    color: colors.successText,
    fontWeight: "600",
  },
  noticeCard: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  noticeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  noticeCardTitle: {
    ...typography.headline,
    fontSize: 14,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand,
  },
  noticeCardBody: {
    ...typography.subhead,
    color: colors.textSecondary,
  },
  emptyNoticeText: {
    ...typography.subhead,
    color: colors.muted,
  },

  // Classes & Details Styles
  classesContainer: {
    gap: spacing.md,
  },
  backButtonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  backButtonText: {
    ...typography.callout,
    color: colors.brand,
    fontWeight: "600",
  },
  classDetailHeaderCard: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  detailBatchTitle: {
    ...typography.title2,
    marginTop: spacing.xs,
  },
  detailVenueText: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  presenceBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.md,
    marginTop: spacing.md,
  },
  presenceInfo: {
    flex: 1,
  },
  presenceStatusTitle: {
    ...typography.headline,
    fontSize: 13,
  },
  presenceSubText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  unsavedNotice: {
    ...typography.caption,
    color: colors.warning,
    fontWeight: "700",
  },
  rosterList: {
    gap: spacing.sm,
  },
  rosterCard: {
    padding: spacing.md,
    gap: spacing.md,
  },
  rosterStudentInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  studentAvatar: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  studentAvatarText: {
    ...typography.caption,
    color: colors.brand,
    fontWeight: "800",
  },
  rosterStudentName: {
    ...typography.headline,
    fontSize: 14,
  },
  attendanceButtonsRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  attendancePill: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  attendancePillActive: {
    borderColor: "transparent",
  },
  pillPresent: {
    backgroundColor: colors.success,
  },
  pillAbsent: {
    backgroundColor: colors.danger,
  },
  pillLate: {
    backgroundColor: colors.warning,
  },
  pillExcused: {
    backgroundColor: colors.info,
  },
  attendancePillText: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textSecondary,
  },
  attendancePillTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  attendanceActionFooter: {
    marginTop: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  completeCard: {
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  completeCardTitle: {
    ...typography.headline,
    fontSize: 14,
  },
  notesInput: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 2,
    fontSize: 13,
    color: colors.ink,
    minHeight: 70,
    textAlignVertical: "top",
  },
  segmentedToggle: {
    flexDirection: "row",
    backgroundColor: colors.border,
    borderRadius: radii.md,
    padding: 2,
    gap: 2,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    alignItems: "center",
    borderRadius: radii.sm + 2,
  },
  toggleBtnActive: {
    backgroundColor: colors.surface,
  },
  toggleBtnText: {
    ...typography.callout,
    fontSize: 12,
    color: colors.textSecondary,
  },
  toggleBtnTextActive: {
    color: colors.ink,
    fontWeight: "700",
  },
  classRowCard: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  classRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  classRowDate: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  classRowBatch: {
    ...typography.headline,
    fontSize: 15,
  },
  classRowVenue: {
    ...typography.subhead,
    color: colors.muted,
  },

  // Students Screen
  studentsContainer: {
    gap: spacing.md,
  },
  searchBarWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.ink,
  },
  studentRowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    padding: spacing.md,
  },
  studentRowInfo: {
    flex: 1,
  },
  studentRowName: {
    ...typography.headline,
    fontSize: 14,
  },
  studentRowBatches: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  studentProfileCard: {
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.xs,
  },
  studentProfileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  studentProfileAvatarText: {
    ...typography.title2,
    color: colors.brand,
  },
  studentProfileName: {
    ...typography.title2,
    fontSize: 18,
  },
  studentProfileBatches: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  feedbackCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  feedbackCardTitle: {
    ...typography.headline,
  },
  feedbackCardSubtitle: {
    ...typography.subhead,
    color: colors.textSecondary,
  },
  inputLabel: {
    ...typography.caption,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  historyCard: {
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  historyWeek: {
    ...typography.caption,
    color: colors.brand,
  },
  historyPerf: {
    ...typography.body,
    fontSize: 13,
  },
  historyGuidance: {
    ...typography.subhead,
    color: colors.textSecondary,
  },

  // My Work Screen
  workContainer: {
    gap: spacing.lg,
  },
  workSummaryGrid: {
    flexDirection: "row",
    gap: spacing.md,
  },
  summaryStatCard: {
    flex: 1,
    padding: spacing.md,
    alignItems: "center",
  },
  statNumber: {
    ...typography.title1,
    color: colors.brand,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  policyCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  policyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  policyText: {
    ...typography.subhead,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },

  // Profile Screen
  profileContainer: {
    gap: spacing.md,
  },
  profileCard: {
    alignItems: "center",
    padding: spacing.xl,
    gap: spacing.xxs,
  },
  profileAvatarLarge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  profileAvatarTextLarge: {
    ...typography.title1,
    color: colors.brand,
  },
  profileFullName: {
    ...typography.title2,
  },
  profileEmail: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  earningsCard: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  earningsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  earningsTitle: {
    ...typography.headline,
  },
  earningsSubText: {
    ...typography.subhead,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  earningsStatusBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  earningsStatusLabel: {
    ...typography.caption,
    color: colors.muted,
  },
  earningsStatusVal: {
    ...typography.caption,
    color: colors.brand,
    fontWeight: "700",
  },
  profileFormCard: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  formSectionTitle: {
    ...typography.headline,
    marginBottom: spacing.xs,
  },
  textInputSingle: {
    height: 44,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.ink,
  },

  // Notices Screen
  noticesContainer: {
    gap: spacing.md,
  },
  noticesHeading: {
    ...typography.title2,
  },
  noticeCardFull: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  noticeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  noticeTitleFull: {
    ...typography.headline,
  },
  noticeBodyFull: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 20,
  },

  // Bottom Navigation Bar
  bottomNav: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: Platform.OS === "ios" ? 20 : 8,
    paddingTop: 8,
  },
  navButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  navIconContainer: {
    width: 38,
    height: 28,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  navIconContainerActive: {
    backgroundColor: colors.brandSoft,
  },
  navLabel: {
    ...typography.caption,
    fontSize: 10,
    color: colors.muted,
  },
  navLabelActive: {
    color: colors.brand,
    fontWeight: "700",
  },

  // Shared alert / loader / empty styles
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxxl,
    gap: spacing.xs,
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    ...typography.headline,
    color: colors.ink,
  },
  emptyDetail: {
    ...typography.subhead,
    color: colors.muted,
    textAlign: "center",
  },
  emptyInline: {
    ...typography.subhead,
    color: colors.muted,
    paddingVertical: spacing.sm,
  },
  loaderWrap: {
    padding: spacing.xxxl,
    alignItems: "center",
    gap: spacing.sm,
  },
  loaderText: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  loaderPadding: {
    paddingVertical: spacing.lg,
  },
  queueBannerCard: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brandSoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  queueCopy: {
    flex: 1,
    marginRight: spacing.sm,
  },
  queueTitle: {
    ...typography.headline,
    fontSize: 13,
    color: colors.brandText,
  },
  queueDetail: {
    ...typography.caption,
    color: colors.brandText,
    marginTop: 2,
  },
  errorAlertCard: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  errorAlertText: {
    ...typography.callout,
    color: colors.dangerText,
    flex: 1,
  },
  successAlertCard: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  successAlertText: {
    ...typography.callout,
    color: colors.successText,
    flex: 1,
  },
  marginTopSm: {
    marginTop: spacing.sm,
  },
  marginTopMd: {
    marginTop: spacing.md,
  },
});

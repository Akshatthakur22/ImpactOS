import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
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

const coachIconByTab: Record<(typeof navItems)[number]["id"], WorkspaceIconName> = {
  today: "home",
  classes: "calendar",
  students: "students",
  profile: "profile",
};

const colors = {
  brand: "#176B58",
  brandSoft: "#E8F3EC",
  ink: "#183630",
  text: "#526B64",
  muted: "#7E928B",
  canvas: "#F4F7F4",
  surface: "#FFFFFF",
  subtle: "#EDF2EE",
  border: "#E2EAE4",
  success: "#23845B",
  successSoft: "#E9F5ED",
  warning: "#A96B19",
  warningSoft: "#FBF2DE",
  danger: "#B95043",
  dangerSoft: "#F9ECE8",
  coral: "#E28669",
  sunny: "#F3D27C",
};

const statusOptions = AttendanceStatusSchema.options;
const statusLabels: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "Excused",
};
const navItems = [
  { id: "today", label: "Today", icon: "home" },
  { id: "classes", label: "Classes", icon: "calendar" },
  { id: "students", label: "Students", icon: "students" },
  { id: "profile", label: "Profile", icon: "profile" },
] as const;
type CoachTab = (typeof navItems)[number]["id"] | "notices";

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

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </View>
  );
}

function SessionCard({
  session,
  timeZone,
  onPress,
  disabled,
}: {
  session: TrainingSession;
  timeZone: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const completed = session.status === "completed";
  const cancelled = session.status === "cancelled";
  const opensAt = new Date(session.startsAt).getTime() - 15 * 60_000;
  const now = Date.now();
  const actionLabel = completed
    ? "Done"
    : cancelled
      ? "Cancelled"
      : session.coachCheckedInAt
        ? "Checked in"
        : now >= new Date(session.endsAt).getTime()
          ? "Attendance still due"
          : now >= new Date(session.startsAt).getTime()
            ? "In progress"
        : now < opensAt
          ? `Check-in opens ${formatTime(new Date(opensAt).toISOString(), timeZone)}`
          : "Check in when you arrive";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || cancelled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sessionCard,
        pressed && styles.pressed,
        cancelled && styles.cancelledCard,
      ]}
    >
      <View style={styles.sessionTimeBlock}>
        <Text style={styles.sessionTime}>{formatTime(session.startsAt, timeZone)}</Text>
        <Text style={styles.sessionDate}>{formatDate(session.startsAt, timeZone)}</Text>
      </View>
      <View style={styles.sessionMain}>
        <Text style={styles.sessionName}>{session.batchName}</Text>
        <Text style={styles.sessionDetail}>
          {session.branchName ? `${session.branchName} · ` : ""}
          {session.venue ?? "Venue not set"}
        </Text>
        <Text style={[styles.sessionState, completed && styles.completedText, cancelled && styles.cancelledText]}>
          {actionLabel}
        </Text>
      </View>
      {!cancelled ? <Text style={styles.chevron}>{completed ? "›" : "›"}</Text> : null}
    </Pressable>
  );
}

export function CoachWorkspace({
  auth,
  onAuthUpdate,
  onLogout,
}: {
  auth: AuthData;
  onAuthUpdate: (nextAuth: AuthData) => void;
  onLogout: () => void;
}) {
  const timeZone = auth.user.academyTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [queuedAttendance, setQueuedAttendance] = useState<QueuedAttendance[]>([]);
  const [queueReady, setQueueReady] = useState(false);
  const queueSyncLock = useRef(false);
  const [selected, setSelected] = useState<TrainingSession | null>(null);
  const [roster, setRoster] = useState<SessionRoster | null>(null);
  const [attendance, setAttendance] = useState<Partial<Record<string, AttendanceStatus>>>({});
  const [progressDrafts, setProgressDrafts] = useState<
    Record<string, { name: string; value: string; note: string; parentVisible: boolean }>
  >({});
  const [progressOpenFor, setProgressOpenFor] = useState<string | null>(null);
  const [progressBusyId, setProgressBusyId] = useState<string | null>(null);
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
  const [oldestLoadedDays, setOldestLoadedDays] = useState(76);
  const [classView, setClassView] = useState<"upcoming" | "history">("upcoming");
  const [tab, setTab] = useState<CoachTab>("today");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcementError, setAnnouncementError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    const from = new Date(now - 76 * 86_400_000).toISOString();
    const to = new Date(now + 14 * 86_400_000).toISOString();
    const result = await requestMobileData(
      `/coach/me/sessions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      (value) => z.object({ sessions: TrainingSessionSchema.array() }).parse(value),
      auth,
      onAuthUpdate,
    );
    setSessions(result.sessions);
    void syncCoachClassReminders(result.sessions);
  }, [auth, onAuthUpdate]);

  async function syncQueueItem(item: QueuedAttendance) {
    if (item.coachUserId !== auth.user.id)
      throw new Error("Sign in as the coach who recorded this offline attendance to sync it.");
    const roster = await requestMobileData(
      `/coach/sessions/${item.sessionId}/roster`,
      (value) => SessionRosterSchema.parse(value),
      auth,
      onAuthUpdate,
    );
    if (roster.session.status === "completed") {
      const actual = new Map(roster.students.map((student) => [student.studentId, student.status]));
      const matches =
        item.records.length === roster.students.length &&
        item.records.every((record) => actual.get(record.studentId) === record.status);
      if (!matches)
        throw new Error(
          "This class is already complete with different attendance. Ask the academy to review it.",
        );
    } else {
      await requestMobileData(
        `/coach/sessions/${item.sessionId}/attendance`,
        (value) => value,
        auth,
        onAuthUpdate,
        { method: "PUT", body: JSON.stringify({ records: item.records }) },
      );
      await requestMobileData(
        `/coach/sessions/${item.sessionId}/complete`,
        (value) => value,
        auth,
        onAuthUpdate,
        { method: "POST" },
      );
    }
    const next = await removeQueuedAttendance(item.sessionId);
    setQueuedAttendance(next);
  }

  async function syncQueuedAttendance() {
    if (queueSyncLock.current) return;
    queueSyncLock.current = true;
    let synced = 0;
    let markedBusy = false;
    try {
      const pending = await readAttendanceQueue();
      setQueuedAttendance(pending);
      if (!pending.length) return;
      setBusy(true);
      markedBusy = true;
      setError(null);
      setNotice(null);
      for (const item of pending) {
        await syncQueueItem(item);
        synced += 1;
      }
      if (synced) {
        await loadSessions();
        setNotice(`${synced} queued attendance record${synced === 1 ? "" : "s"} synced.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sync queued attendance.");
      if (synced)
        setNotice(
          `${synced} queued class${synced === 1 ? "" : "es"} synced; the remaining entries are still saved on this device.`,
        );
    } finally {
      if (markedBusy) setBusy(false);
      queueSyncLock.current = false;
    }
  }

  const syncQueueRef = useRef(syncQueuedAttendance);
  syncQueueRef.current = syncQueuedAttendance;

  useEffect(() => {
    if (!queueReady || !queuedAttendance.length) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncQueueRef.current();
    });
    const onlineTarget = typeof window === "undefined" ? null : window;
    const handleOnline = () => void syncQueueRef.current();
    onlineTarget?.addEventListener("online", handleOnline);
    const retryTimer = setInterval(() => {
      if (AppState.currentState === "active") void syncQueueRef.current();
    }, 30_000);
    if (AppState.currentState === "active") void syncQueueRef.current();
    return () => {
      subscription.remove();
      onlineTarget?.removeEventListener("online", handleOnline);
      clearInterval(retryTimer);
    };
  }, [queueReady, queuedAttendance.length, auth.user.id]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadSessions()
      .catch((caught: unknown) => {
        if (active)
          setError(caught instanceof Error ? caught.message : "Could not load your classes.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadSessions]);

  useEffect(() => {
    let active = true;
    requestMobileData(
      "/coach/announcements",
      (value) => ParentAnnouncementListSchema.parse(value),
      auth,
      onAuthUpdate,
    )
      .then((result) => {
        if (active) setAnnouncements(result.announcements);
      })
      .catch((caught: unknown) => {
        if (active)
          setAnnouncementError(
            caught instanceof Error ? caught.message : "Could not load academy notices.",
          );
      })
      .finally(() => {
        if (active) setAnnouncementsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [auth, onAuthUpdate]);

  useEffect(() => {
    if (tab !== "students") return;
    let active = true;
    setStudentsLoading(true);
    requestMobileData(
      "/coach/me/students",
      (value) => z.object({ students: CoachStudentSchema.array() }).parse(value),
      auth,
      onAuthUpdate,
    )
      .then((result) => {
        if (active) setStudents(result.students);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(caught instanceof Error ? caught.message : "Could not load your students.");
      })
      .finally(() => {
        if (active) setStudentsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [auth, onAuthUpdate, tab]);

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [sessions],
  );
  const todaysSessions = useMemo(
    () =>
      sortedSessions.filter(
        (session) => session.status !== "cancelled" && sameLocalDay(session.startsAt, timeZone),
      ),
    [sortedSessions, timeZone],
  );
  const availableSessions = useMemo(
    () =>
      [...sortedSessions].sort((a, b) => {
        const rank = (session: TrainingSession) =>
          session.status === "scheduled" ? 0 : session.status === "completed" ? 1 : 2;
        const statusOrder = rank(a) - rank(b);
        if (statusOrder) return statusOrder;
        const timeOrder = new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
        return a.status === "scheduled" ? timeOrder : -timeOrder;
      }),
    [sortedSessions],
  );
  const unreadCount = announcements.filter((announcement) => !announcement.readAt).length;
  const completedToday = todaysSessions.filter((session) => session.status === "completed").length;
  const nextTodaySession =
    todaysSessions.find(
      (session) => session.status === "scheduled" && new Date(session.startsAt).getTime() > Date.now(),
    ) ?? [...todaysSessions].reverse().find((session) => session.status === "scheduled");
  const firstName = auth.user.displayName.trim().split(/\s+/)[0] || "Coach";

  async function refreshSessions() {
    setRefreshing(true);
    setError(null);
    try {
      await loadSessions();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not refresh your classes.");
    } finally {
      setRefreshing(false);
    }
  }

  async function loadOlderSessions() {
    const toDays = oldestLoadedDays;
    const fromDays = oldestLoadedDays + 90;
    setRefreshing(true);
    setError(null);
    try {
      const now = Date.now();
      const result = await requestMobileData(
        `/coach/me/sessions?from=${encodeURIComponent(new Date(now - fromDays * 86_400_000).toISOString())}&to=${encodeURIComponent(new Date(now - toDays * 86_400_000).toISOString())}`,
        (value) => z.object({ sessions: TrainingSessionSchema.array() }).parse(value),
        auth,
        onAuthUpdate,
      );
      setSessions((current) => {
        const byId = new Map(current.map((session) => [session.id, session]));
        for (const session of result.sessions) byId.set(session.id, session);
        return [...byId.values()];
      });
      setOldestLoadedDays(fromDays);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load earlier classes.");
    } finally {
      setRefreshing(false);
    }
  }

  async function openStudent(student: CoachStudent) {
    setSelectedStudent(student);
    setStudentFeedback([]);
    setStudentHistory(null);
    setFeedbackPerformance("");
    setFeedbackGuidance("");
    setStudentFeedbackLoading(true);
    setError(null);
    try {
      const [feedback, history] = await Promise.all([
        requestMobileData(
          `/coach/students/${student.studentId}/feedback`,
          (value) => z.object({ entries: CoachStudentFeedbackSchema.array() }).parse(value),
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
      setStudentFeedback(feedback.entries);
      setStudentHistory(history);
      const currentWeek = feedback.entries.find(
        (entry) => entry.weekOf === currentWeekStart(timeZone),
      );
      if (currentWeek) {
        setFeedbackPerformance(currentWeek.performance);
        setFeedbackGuidance(currentWeek.guidance);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this student’s history.");
    } finally {
      setStudentFeedbackLoading(false);
    }
  }

  async function saveWeeklyFeedback() {
    if (!selectedStudent || !feedbackPerformance.trim()) return;
    setFeedbackSaving(true);
    setError(null);
    try {
      const payload = CoachStudentFeedbackRequestSchema.parse({
        weekOf: currentWeekStart(timeZone),
        performance: feedbackPerformance,
        guidance: feedbackGuidance,
      });
      const saved = await requestMobileData(
        `/coach/students/${selectedStudent.studentId}/feedback`,
        (value) => CoachStudentFeedbackSchema.parse(value),
        auth,
        onAuthUpdate,
        { method: "PUT", body: JSON.stringify(payload) },
      );
      setStudentFeedback((current) => [
        saved,
        ...current.filter((entry) => entry.weekOf !== saved.weekOf),
      ]);
      setNotice("This week’s feedback is saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save weekly feedback.");
    } finally {
      setFeedbackSaving(false);
    }
  }

  async function saveCoachProfile() {
    setProfileSaving(true);
    setError(null);
    try {
      const input = UpdateCoachProfileRequestSchema.parse({ displayName: profileName });
      const profile = await requestMobileData(
        "/coach/me/profile",
        (value) =>
          z
            .object({ id: z.string().uuid(), displayName: z.string(), email: z.string() })
            .parse(value),
        auth,
        onAuthUpdate,
        { method: "PUT", body: JSON.stringify(input) },
      );
      onAuthUpdate({ ...auth, user: { ...auth.user, displayName: profile.displayName } });
      setNotice("Your profile is updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update your profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function changeCoachPassword() {
    setPasswordSaving(true);
    setError(null);
    try {
      const payload = ChangePasswordRequestSchema.parse({ currentPassword, newPassword });
      await requestMobileData(
        "/auth/password/change",
        (value) => z.object({ updated: z.boolean() }).parse(value),
        auth,
        onAuthUpdate,
        { method: "POST", body: JSON.stringify(payload) },
      );
      setCurrentPassword("");
      setNewPassword("");
      setNotice("Your password is changed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change your password.");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function markAnnouncementRead(announcementId: string) {
    setAnnouncementError(null);
    try {
      await requestMobileData(
        `/coach/announcements/${announcementId}/read`,
        (value) => value,
        auth,
        onAuthUpdate,
        { method: "POST" },
      );
      setAnnouncements((current) =>
        current.map((announcement) =>
          announcement.id === announcementId
            ? { ...announcement, readAt: new Date().toISOString() }
            : announcement,
        ),
      );
    } catch (caught) {
      setAnnouncementError(
        caught instanceof Error ? caught.message : "Could not mark this notice as read.",
      );
    }
  }

  async function openSession(session: TrainingSession) {
    setSelected(session);
    setRoster(null);
    setAttendance({});
    setError(null);
    setNotice(null);
    setRosterLoading(true);
    setTab("classes");
    try {
      const result = await requestMobileData(
        `/coach/sessions/${session.id}/roster`,
        (value) => SessionRosterSchema.parse(value),
        auth,
        onAuthUpdate,
      );
      setRoster(result);
      setSelected({ ...session, ...result.session });
      setAttendance(
        Object.fromEntries(
          result.students.flatMap((student) =>
            student.status ? [[student.studentId, student.status]] : [],
          ),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this class roster.");
    } finally {
      setRosterLoading(false);
    }
  }

  async function recordSessionTime(action: "check-in" | "check-out") {
    if (!selected) return;
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
        if (position.coords.accuracy === null || position.coords.accuracy > 50) {
          throw new Error("Your location is not accurate enough. Move outdoors and try again.");
        }
        body = JSON.stringify({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        });
      }
      const presence = await requestMobileData(
        `/coach/sessions/${selected.id}/${action}`,
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
        session.id === selected.id
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
          : "Your class check-out time is recorded.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not record ${action}.`);
    } finally {
      setBusy(false);
    }
  }

  function closeSession() {
    setSelected(null);
    setRoster(null);
    setAttendance({});
    setError(null);
  }

  async function saveAttendance() {
    if (!selected || !roster || selected.status !== "scheduled") return;
    if (!selected.coachCheckedInAt) {
      setError("Check in to this class before recording attendance.");
      return;
    }
    if (Date.now() < new Date(selected.startsAt).getTime()) {
      setError("Student attendance opens when the class starts.");
      return;
    }
    const allMarked = roster.students.every((student) => attendance[student.studentId]);
    if (!allMarked) {
      setError("Choose an attendance status for every student before saving.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    let queued: QueuedAttendance[];
    try {
      queued = await enqueueAttendance({
        sessionId: selected.id,
        coachUserId: auth.user.id,
        batchName: selected.batchName,
        startsAt: selected.startsAt,
        records: roster.students.map((student) => ({
          studentId: student.studentId,
          status: attendance[student.studentId]!,
        })),
        queuedAt: new Date().toISOString(),
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save attendance on this device.",
      );
      setNotice(null);
      setBusy(false);
      return;
    }
    setQueuedAttendance(queued);
    try {
      await syncQueueItem(queued.find((item) => item.sessionId === selected.id)!);
      closeSession();
      setNotice("Attendance saved and class completed.");
      await loadSessions();
    } catch (caught) {
      setNotice(
        Platform.OS === "web"
          ? "Attendance is saved in this browser session and will retry when you return online."
          : "Attendance is saved securely on this device and will retry when you return online.",
      );
      setError(caught instanceof Error ? caught.message : "Could not sync attendance yet.");
    } finally {
      setBusy(false);
    }
  }

  async function saveProgress(studentId: string) {
    if (!selected) return;
    const draft = progressDrafts[studentId];
    if (!draft || (!draft.value.trim() && !draft.note.trim())) return;
    setProgressBusyId(studentId);
    setError(null);
    try {
      await requestMobileData(
        `/coach/sessions/${selected.id}/progress`,
        (value) => value,
        auth,
        onAuthUpdate,
        {
          method: "POST",
          body: JSON.stringify({
            studentId,
            assessmentName: draft.name,
            value: draft.value || undefined,
            coachNote: draft.note || undefined,
            parentVisible: draft.parentVisible,
          }),
        },
      );
      setProgressDrafts((current) => ({
        ...current,
        [studentId]: { name: "", value: "", note: "", parentVisible: false },
      }));
      setProgressOpenFor(null);
      setNotice("Progress entry saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save progress entry.");
    } finally {
      setProgressBusyId(null);
    }
  }

  async function completeReadOnly(session: TrainingSession) {
    setSelected(session);
    setRoster(null);
    setError(null);
    setRosterLoading(true);
    setTab("classes");
    try {
      const result = await requestMobileData(
        `/coach/sessions/${session.id}/roster`,
        (value) => SessionRosterSchema.parse(value),
        auth,
        onAuthUpdate,
      );
      setRoster(result);
      setAttendance(
        Object.fromEntries(
          result.students.flatMap((student) =>
            student.status ? [[student.studentId, student.status]] : [],
          ),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this class roster.");
    } finally {
      setRosterLoading(false);
    }
  }

  function renderSessionList(items: TrainingSession[], emptyMessage: string) {
    if (loading) return <ActivityIndicator style={styles.loader} color={colors.brand} />;
    if (!items.length) return <EmptyState title="No classes scheduled" detail={emptyMessage} />;
    return items.map((session) => (
      <SessionCard
        key={session.id}
        session={session}
        timeZone={timeZone}
        onPress={() =>
          void (session.status === "scheduled" ? openSession(session) : completeReadOnly(session))
        }
      />
    ));
  }

  function renderNotices() {
    if (announcementError)
      return (
        <View>
          <Text accessibilityRole="alert" style={styles.error}>
            {announcementError}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setAnnouncementError(null);
              setAnnouncementsLoading(true);
              void requestMobileData(
                "/coach/announcements",
                (value) => ParentAnnouncementListSchema.parse(value),
                auth,
                onAuthUpdate,
              )
                .then((result) => setAnnouncements(result.announcements))
                .catch((caught) =>
                  setAnnouncementError(
                    caught instanceof Error ? caught.message : "Could not load academy notices.",
                  ),
                )
                .finally(() => setAnnouncementsLoading(false));
            }}
            style={styles.textButton}
          >
            <Text style={styles.textButtonLabel}>Retry notices</Text>
          </Pressable>
        </View>
      );
    if (announcementsLoading)
      return <ActivityIndicator style={styles.loader} color={colors.brand} />;
    if (!announcements.length)
      return (
        <EmptyState
          title="No academy notices"
          detail="Updates from the academy will appear here."
        />
      );
    return announcements.map((announcement) => (
      <View key={announcement.id} style={styles.noticeCard}>
        <View style={styles.noticeHeading}>
          <Text style={styles.noticeTitle}>{announcement.title}</Text>
          <Text
            style={[styles.noticeBadge, announcement.readAt ? styles.readBadge : styles.newBadge]}
          >
            {announcement.readAt ? "Read" : "New"}
          </Text>
        </View>
        <Text style={styles.supporting}>
          {announcement.batchName ? `${announcement.batchName} · ` : "Academy · "}
          {formatDate(announcement.publishedAt, timeZone)}
        </Text>
        <Text style={styles.noticeBody}>{announcement.body}</Text>
        {!announcement.readAt ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void markAnnouncementRead(announcement.id)}
            style={styles.textButton}
          >
            <Text style={styles.textButtonLabel}>Mark as read</Text>
          </Pressable>
        ) : null}
      </View>
    ));
  }

  function renderRoster() {
    if (rosterLoading) return <ActivityIndicator style={styles.loader} color={colors.brand} />;
    if (!selected) return null;
    if (!roster)
      return (
        <View>
          <Text style={styles.supporting}>The class roster could not be loaded.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              void (selected.status === "scheduled"
                ? openSession(selected)
                : completeReadOnly(selected))
            }
            style={styles.textButton}
          >
            <Text style={styles.textButtonLabel}>Retry roster</Text>
          </Pressable>
        </View>
      );
    const readOnly = selected.status !== "scheduled";
    const classStarted = Date.now() >= new Date(selected.startsAt).getTime();
    const checkInOpens = new Date(selected.startsAt).getTime() - 15 * 60_000;
    const checkInOpen = Date.now() >= checkInOpens;
    const canMarkAttendance = !readOnly && classStarted && !!selected.coachCheckedInAt;
    const remainingMarks = roster.students.filter(
      (student) => !attendance[student.studentId],
    ).length;
    return (
      <>
        <Pressable accessibilityRole="button" onPress={closeSession} style={styles.backButton}>
          <Text style={styles.backLabel}>‹ All classes</Text>
        </Pressable>
        <View style={styles.detailHeader}>
          <Text style={styles.eyebrow}>
            {formatDate(selected.startsAt, timeZone)} · {formatTime(selected.startsAt, timeZone)}
          </Text>
          <Text style={styles.pageTitle}>{selected.batchName}</Text>
          <Text style={styles.supporting}>
            {selected.branchName ? `${selected.branchName} · ` : ""}
            {selected.venue ?? "Venue not set"} · {formatTime(selected.endsAt, timeZone)} end · {roster.students.length} students
          </Text>
          {readOnly ? (
            <Text style={styles.readOnlyNote}>
              This class is complete. Attendance is read-only.
            </Text>
          ) : null}
          <View style={styles.sessionPresenceCard}>
            <Text style={styles.sessionPresenceTitle}>Class check-in</Text>
            {!selected.coachCheckedInAt ? (
              <Text style={styles.sessionPresenceHint}>
                {checkInOpen
                  ? "You’re in the check-in window. Check in when you arrive."
                  : `Check-in opens at ${formatTime(new Date(checkInOpens).toISOString(), timeZone)} — 15 minutes before class.`}
              </Text>
            ) : null}
            {selected.coachCheckedInAt ? (
              <Text style={styles.sessionPresenceText}>
                Checked in · {formatTime(selected.coachCheckedInAt, timeZone)}
              </Text>
            ) : null}
            {selected.coachCheckedOutAt ? (
              <Text style={styles.sessionPresenceText}>
                Checked out · {formatTime(selected.coachCheckedOutAt, timeZone)}
              </Text>
            ) : null}
            {!readOnly && !selected.coachCheckedInAt ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy || !checkInOpen}
                onPress={() => void recordSessionTime("check-in")}
                style={[styles.presenceButton, (busy || !checkInOpen) && styles.disabled]}
              >
                <Text style={styles.presenceButtonText}>I’ve arrived · Check in</Text>
              </Pressable>
            ) : null}
            {!readOnly && selected.coachCheckedInAt && !selected.coachCheckedOutAt ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void recordSessionTime("check-out")}
                style={[styles.presenceButton, busy && styles.disabled]}
              >
                <Text style={styles.presenceButtonText}>Check out of class</Text>
              </Pressable>
            ) : null}
            {selected.coachCheckedInAt && !classStarted && !readOnly ? (
              <Text style={styles.sessionPresenceHint}>Attendance opens when class starts.</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.workflowCard}>
          <View style={styles.workflowStep}>
            <View style={[styles.workflowNumber, selected.coachCheckedInAt && styles.workflowDone]}>
              <Text style={[styles.workflowNumberText, selected.coachCheckedInAt && styles.workflowDoneText]}>
                {selected.coachCheckedInAt ? "✓" : "1"}
              </Text>
            </View>
            <View style={styles.workflowCopy}>
              <Text style={styles.workflowTitle}>Arrive & check in</Text>
              <Text style={styles.workflowDetail}>Available 15 minutes before class</Text>
            </View>
          </View>
          <View style={styles.workflowRule} />
          <View style={styles.workflowStep}>
            <View style={[styles.workflowNumber, canMarkAttendance && styles.workflowCurrent]}>
              <Text style={[styles.workflowNumberText, canMarkAttendance && styles.workflowCurrentText]}>2</Text>
            </View>
            <View style={styles.workflowCopy}>
              <Text style={styles.workflowTitle}>Mark the group</Text>
              <Text style={styles.workflowDetail}>
                {!selected.coachCheckedInAt
                  ? "Check in first"
                  : classStarted
                    ? `${roster.students.length - remainingMarks} of ${roster.students.length} marked`
                    : "Opens at class start"}
              </Text>
            </View>
          </View>
        </View>
        {!roster.students.length ? (
          <EmptyState
            title="No active students"
            detail="There are no active enrollments in this class."
          />
        ) : (
          <>
            <View style={styles.attendanceHeading}>
              <View style={styles.workflowCopy}>
                <Text style={styles.sectionTitle}>Attendance</Text>
                <Text style={styles.supporting}>{roster.students.length - remainingMarks} of {roster.students.length} marked</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={!canMarkAttendance}
                onPress={() => setAttendance(Object.fromEntries(roster.students.map((student) => [student.studentId, "present" as const])))}
                style={[styles.markAllButton, !canMarkAttendance && styles.disabled]}
              >
                <Text style={styles.markAllLabel}>All present</Text>
              </Pressable>
            </View>
            <View style={styles.rosterCard}>
              {roster.students.map((student, index) => (
              <View
                key={student.studentId}
                style={[styles.progressRowWrap, index > 0 && styles.divider]}
              >
                <View style={styles.studentRow}>
                  <Text style={styles.studentName}>{student.studentName}</Text>
                  <View style={styles.statusChoices}>
                    {statusOptions.map((status) => {
                      const active = attendance[student.studentId] === status;
                      return (
                        <Pressable
                          key={status}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active, disabled: readOnly }}
                          disabled={!canMarkAttendance}
                          onPress={() =>
                            setAttendance((current) => ({
                              ...current,
                              [student.studentId]: status,
                            }))
                          }
                          style={[
                            styles.statusChoice,
                            active && styles.statusChoiceActive,
                            !canMarkAttendance && styles.readOnlyChoice,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusChoiceText,
                              active && styles.statusChoiceTextActive,
                            ]}
                          >
                            {status === "present" ? "Present" : status === "absent" ? "Absent" : statusLabels[status]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    setProgressOpenFor((current) =>
                      current === student.studentId ? null : student.studentId,
                    )
                  }
                  style={styles.progressToggle}
                >
                  <Text style={styles.progressToggleText}>
                    {progressOpenFor === student.studentId
                      ? "Close progress entry"
                      : "Add assessment or coach note"}
                  </Text>
                </Pressable>
                {progressOpenFor === student.studentId
                  ? (() => {
                      const draft = progressDrafts[student.studentId] ?? {
                        name: "",
                        value: "",
                        note: "",
                        parentVisible: false,
                      };
                      const update = (changes: Partial<typeof draft>) =>
                        setProgressDrafts((current) => ({
                          ...current,
                          [student.studentId]: { ...draft, ...changes },
                        }));
                      return (
                        <View style={styles.progressForm}>
                          <TextInput
                            accessibilityLabel="Assessment name"
                            placeholder="Assessment (for example: sprint speed)"
                            value={draft.name}
                            onChangeText={(name) => update({ name })}
                            style={styles.progressInput}
                            maxLength={100}
                          />
                          <TextInput
                            accessibilityLabel="Assessment result"
                            placeholder="Result or value (optional)"
                            value={draft.value}
                            onChangeText={(value) => update({ value })}
                            style={styles.progressInput}
                            maxLength={120}
                          />
                          <TextInput
                            accessibilityLabel="Coach note"
                            placeholder="Coach note"
                            value={draft.note}
                            onChangeText={(note) => update({ note })}
                            style={[styles.progressInput, styles.progressNote]}
                            multiline
                            maxLength={1000}
                          />
                          <View style={styles.shareRow}>
                            <Text style={styles.shareLabel}>Share with parent</Text>
                            <Switch
                              value={draft.parentVisible}
                              onValueChange={(parentVisible) => update({ parentVisible })}
                              trackColor={{ true: colors.brand }}
                            />
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            disabled={
                              progressBusyId === student.studentId ||
                              !draft.name.trim() ||
                              (!draft.value.trim() && !draft.note.trim())
                            }
                            onPress={() => void saveProgress(student.studentId)}
                            style={[
                              styles.progressSave,
                              (progressBusyId === student.studentId ||
                                !draft.name.trim() ||
                                (!draft.value.trim() && !draft.note.trim())) &&
                                styles.disabled,
                            ]}
                          >
                            <Text style={styles.progressSaveText}>
                              {progressBusyId === student.studentId ? "Saving…" : "Save progress"}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })()
                  : null}
              </View>
              ))}
            </View>
          </>
        )}
        {!readOnly && roster.students.length ? (
          <>
            <Pressable
              accessibilityRole="button"
              disabled={busy || remainingMarks > 0 || !canMarkAttendance}
              onPress={() => void saveAttendance()}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
                (busy || remainingMarks > 0 || !canMarkAttendance) && styles.disabled,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {busy
                  ? "Saving attendance…"
                  : !selected.coachCheckedInAt
                    ? "Check in to take attendance"
                    : !classStarted
                      ? "Attendance opens at class time"
                      : remainingMarks > 0
                        ? `Mark ${remainingMarks} more students`
                        : "Save and finish class"}
              </Text>
            </Pressable>
            <Text style={styles.finishHint}>Finishing also checks you out if you haven’t already.</Text>
          </>
        ) : null}
      </>
    );
  }

  function renderContent() {
    if (tab === "notices") return renderNotices();
    if (tab === "profile") {
      return (
        <>
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{firstName.slice(0, 1).toUpperCase()}</Text>
            </View>
            <Text style={styles.profileName}>{auth.user.displayName}</Text>
            <Text style={styles.supporting}>{auth.user.email}</Text>
            <Text style={styles.academyName}>{auth.user.academyName}</Text>
          </View>
          <View style={styles.profileForm}>
            <Text style={styles.formLabel}>Display name</Text>
            <TextInput
              accessibilityLabel="Display name"
              value={profileName}
              onChangeText={setProfileName}
              style={styles.progressInput}
              maxLength={160}
            />
            <Pressable
              accessibilityRole="button"
              disabled={profileSaving || !profileName.trim()}
              onPress={() => void saveCoachProfile()}
              style={[
                styles.primaryButton,
                (profileSaving || !profileName.trim()) && styles.disabled,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {profileSaving ? "Saving…" : "Save profile"}
              </Text>
            </Pressable>
          </View>
          <View style={styles.profileForm}>
            <Text style={styles.sectionTitle}>Change password</Text>
            <TextInput
              accessibilityLabel="Current password"
              placeholder="Current password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              style={styles.progressInput}
            />
            <TextInput
              accessibilityLabel="New password"
              placeholder="New password (at least 14 characters)"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              style={styles.progressInput}
            />
            <Pressable
              accessibilityRole="button"
              disabled={passwordSaving || !currentPassword || newPassword.length < 14}
              onPress={() => void changeCoachPassword()}
              style={[
                styles.primaryButton,
                (passwordSaving || !currentPassword || newPassword.length < 14) && styles.disabled,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {passwordSaving ? "Updating…" : "Update password"}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.profileNote}>
            Contact your academy administrator if your email or account access needs to change.
          </Text>
          <Pressable accessibilityRole="button" onPress={onLogout} style={styles.logoutButton}>
            <Text style={styles.logoutLabel}>Sign out</Text>
          </Pressable>
        </>
      );
    }
    if (tab === "classes" && selected) return renderRoster();
    if (tab === "classes")
      return (
        <>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Your classes</Text>
            <Text style={styles.supporting}>{availableSessions.length} scheduled and past</Text>
          </View>
          <View style={styles.classFilter}>
            {(["upcoming", "history"] as const).map((view) => (
              <Pressable
                key={view}
                accessibilityRole="button"
                accessibilityState={{ selected: classView === view }}
                onPress={() => setClassView(view)}
                style={[styles.classFilterOption, classView === view && styles.classFilterOptionActive]}
              >
                <Text style={[styles.classFilterText, classView === view && styles.classFilterTextActive]}>
                  {view === "upcoming" ? "Upcoming" : "Class history"}
                </Text>
              </Pressable>
            ))}
          </View>
          {renderSessionList(
            availableSessions.filter((session) =>
              classView === "upcoming" ? session.status === "scheduled" : session.status !== "scheduled",
            ),
            classView === "upcoming" ? "Your next assigned classes will appear here." : "Completed class history will appear here.",
          )}
          {!loading && classView === "history" ? (
            <Pressable
              accessibilityRole="button"
              disabled={refreshing}
              onPress={() => void loadOlderSessions()}
              style={styles.textButton}
            >
              <Text style={styles.textButtonLabel}>
                {refreshing ? "Loading…" : "Load earlier history"}
              </Text>
            </Pressable>
          ) : null}
        </>
      );
    if (tab === "students") {
      if (selectedStudent) {
        const attendanceTotal = studentHistory?.attendance.length ?? 0;
        const presentCount =
          studentHistory?.attendance.filter(
            (item) => item.status === "present" || item.status === "late",
          ).length ?? 0;
        return (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSelectedStudent(null);
                setStudentHistory(null);
              }}
              style={styles.backButton}
            >
              <Text style={styles.backLabel}>‹ All students</Text>
            </Pressable>
            <View style={styles.detailHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {selectedStudent.studentName.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.pageTitle}>{selectedStudent.studentName}</Text>
              <Text style={styles.supporting}>
                {selectedStudent.batches.map((batch) => batch.name).join(" · ")}
              </Text>
            </View>
            {studentFeedbackLoading ? (
              <ActivityIndicator style={styles.loader} color={colors.brand} />
            ) : null}
            {!studentFeedbackLoading && !studentHistory ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void openStudent(selectedStudent)}
                style={styles.textButton}
              >
                <Text style={styles.textButtonLabel}>Retry student details</Text>
              </Pressable>
            ) : null}
            {studentHistory ? (
              <>
                <View style={styles.historySummary}>
                  <Text style={styles.sectionTitle}>Attendance</Text>
                  <Text style={styles.historyMetric}>
                    {presentCount}/{attendanceTotal} present or late
                  </Text>
                  <Text style={styles.supporting}>Across recorded classes</Text>
                </View>
                <View style={styles.historyCard}>
                  <Text style={styles.sectionTitle}>Recent classes</Text>
                  {studentHistory.attendance.slice(0, 8).map((entry) => (
                    <View key={entry.id} style={styles.historyRow}>
                      <View>
                        <Text style={styles.studentName}>{entry.batchName}</Text>
                        <Text style={styles.supporting}>
                          {formatDate(entry.scheduledStart, timeZone)}
                        </Text>
                      </View>
                      <Text style={styles.historyStatus}>{statusLabels[entry.status]}</Text>
                    </View>
                  ))}
                  {!studentHistory.attendance.length ? (
                    <Text style={styles.supporting}>No attendance has been recorded.</Text>
                  ) : null}
                </View>
                <View style={styles.historyCard}>
                  <Text style={styles.sectionTitle}>Progress assessments</Text>
                  {studentHistory.progress.slice(0, 6).map((entry) => (
                    <View key={entry.id} style={styles.historyRow}>
                      <View style={styles.studentListMain}>
                        <Text style={styles.studentName}>{entry.assessmentName}</Text>
                        <Text style={styles.supporting}>
                          {entry.value || entry.coachNote || "Progress note"}
                        </Text>
                      </View>
                      <Text style={styles.supporting}>{formatDate(entry.createdAt, timeZone)}</Text>
                    </View>
                  ))}
                  {!studentHistory.progress.length ? (
                    <Text style={styles.supporting}>No assessments have been recorded.</Text>
                  ) : null}
                </View>
              </>
            ) : null}
            <View style={styles.historyCard}>
              <Text style={styles.sectionTitle}>
                Weekly feedback · week of{" "}
                {formatDate(`${currentWeekStart(timeZone)}T12:00:00.000Z`, timeZone)}
              </Text>
              <Text style={styles.formLabel}>Performance and effort</Text>
              <TextInput
                accessibilityLabel="Weekly performance feedback"
                placeholder="What went well this week?"
                value={feedbackPerformance}
                onChangeText={setFeedbackPerformance}
                multiline
                style={[styles.progressInput, styles.progressNote]}
                maxLength={1200}
              />
              <Text style={styles.formLabel}>Next steps and guidance</Text>
              <TextInput
                accessibilityLabel="Weekly guidance"
                placeholder="What should the student focus on next?"
                value={feedbackGuidance}
                onChangeText={setFeedbackGuidance}
                multiline
                style={[styles.progressInput, styles.progressNote]}
                maxLength={1200}
              />
              <Pressable
                accessibilityRole="button"
                disabled={feedbackSaving || !feedbackPerformance.trim()}
                onPress={() => void saveWeeklyFeedback()}
                style={[
                  styles.primaryButton,
                  (feedbackSaving || !feedbackPerformance.trim()) && styles.disabled,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {feedbackSaving ? "Saving…" : "Save this week’s feedback"}
                </Text>
              </Pressable>
            </View>
            <View style={styles.historyCard}>
              <Text style={styles.sectionTitle}>Past weekly feedback</Text>
              {studentFeedback
                .filter((entry) => entry.weekOf !== currentWeekStart(timeZone))
                .map((entry) => (
                  <View key={entry.id} style={styles.feedbackHistory}>
                    <Text style={styles.formLabel}>
                      Week of {formatDate(`${entry.weekOf}T12:00:00.000Z`, timeZone)}
                    </Text>
                    <Text style={styles.supporting}>{entry.performance}</Text>
                    {entry.guidance ? (
                      <Text style={styles.feedbackGuidance}>{entry.guidance}</Text>
                    ) : null}
                  </View>
                ))}
              {!studentFeedback.some((entry) => entry.weekOf !== currentWeekStart(timeZone)) ? (
                <Text style={styles.supporting}>Your weekly notes will build a history here.</Text>
              ) : null}
            </View>
          </>
        );
      }
      if (studentsLoading) return <ActivityIndicator style={styles.loader} color={colors.brand} />;
      if (error && !students.length)
        return (
          <>
            <Text style={styles.error}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setError(null);
                setStudentsLoading(true);
                void requestMobileData(
                  "/coach/me/students",
                  (value) => z.object({ students: CoachStudentSchema.array() }).parse(value),
                  auth,
                  onAuthUpdate,
                )
                  .then((result) => setStudents(result.students))
                  .catch((caught) =>
                    setError(
                      caught instanceof Error ? caught.message : "Could not load your students.",
                    ),
                  )
                  .finally(() => setStudentsLoading(false));
              }}
              style={styles.textButton}
            >
              <Text style={styles.textButtonLabel}>Retry students</Text>
            </Pressable>
          </>
        );
      if (!students.length)
        return (
          <EmptyState
            title="No assigned students"
            detail="Students appear here when you are assigned to an active class with enrolled students."
          />
        );
      return (
        <>
          <Text style={styles.studentsIntro}>
            {students.length} students across your active classes
          </Text>
          <View style={styles.studentsCard}>
            {students.map((student, index) => (
              <Pressable
                key={student.studentId}
                accessibilityRole="button"
                onPress={() => void openStudent(student)}
                style={[styles.studentListRow, index > 0 && styles.divider]}
              >
                <View style={styles.avatarSmall}>
                  <Text style={styles.avatarSmallText}>
                    {student.studentName.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.studentListMain}>
                  <Text style={styles.studentName}>{student.studentName}</Text>
                  <Text style={styles.supporting}>
                    {student.batches.map((batch) => batch.name).join(" · ")}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </>
      );
    }

    return (
      <>
        <View style={styles.todaySummary}>
          <View style={styles.summaryTopline}>
            <View>
              <Text style={styles.summaryLabel}>TODAY</Text>
              <Text style={styles.summaryDate}>
                {new Date().toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone,
                })}
              </Text>
            </View>
            <View style={styles.summaryCountBadge}>
              <Text style={styles.summaryCount}>{completedToday}</Text>
              <Text style={styles.summaryCountTotal}>/{todaysSessions.length}</Text>
            </View>
          </View>
          <Text style={styles.summaryCaption}>
            {todaysSessions.length ? "Classes completed" : "No classes on your schedule today"}
          </Text>
        </View>
        {nextTodaySession ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void openSession(nextTodaySession)}
            style={({ pressed }) => [styles.nextClassCard, pressed && styles.pressed]}
          >
            <View style={styles.nextClassTop}>
              <View style={styles.nextClassTag}>
                <View style={styles.nextClassDot} />
                <Text style={styles.nextClassTagText}>
                  {new Date(nextTodaySession.endsAt).getTime() <= Date.now()
                    ? "ATTENDANCE DUE"
                    : new Date(nextTodaySession.startsAt).getTime() > Date.now()
                      ? "UP NEXT"
                      : "IN PROGRESS"}
                </Text>
              </View>
              <WorkspaceIcon name="calendar" color={colors.brand} size={19} />
            </View>
            <Text style={styles.nextClassName}>{nextTodaySession.batchName}</Text>
            <Text style={styles.nextClassMeta}>
              {formatTime(nextTodaySession.startsAt, timeZone)} – {formatTime(nextTodaySession.endsAt, timeZone)}
            </Text>
            <Text style={styles.nextClassMeta}>
              {[nextTodaySession.branchName, nextTodaySession.venue].filter(Boolean).join(" · ") || "Location to be confirmed"}
            </Text>
            <View style={styles.nextClassActionRow}>
              <Text style={styles.nextClassAction}>Open class</Text>
              <Text style={styles.nextClassArrow}>›</Text>
            </View>
          </Pressable>
        ) : null}
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Today’s classes</Text>
          <Pressable accessibilityRole="button" onPress={() => setTab("classes")}>
            <Text style={styles.linkText}>All classes</Text>
          </Pressable>
        </View>
        {todaysSessions.some((session) => session.id !== nextTodaySession?.id)
          ? renderSessionList(
              todaysSessions.filter((session) => session.id !== nextTodaySession?.id),
              "Your next assigned classes are available in Classes.",
            )
          : null}
        {!todaysSessions.length && !loading ? (
          <EmptyState title="A clear day ahead" detail="You have no classes scheduled today." />
        ) : null}
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Academy notices</Text>
          <Pressable accessibilityRole="button" onPress={() => setTab("notices")}>
            <Text style={styles.linkText}>
              {unreadCount ? `${unreadCount} unread` : "View notices"}
            </Text>
          </Pressable>
        </View>
        {announcementsLoading ? (
          <ActivityIndicator style={styles.noticeLoader} color={colors.brand} />
        ) : (
          announcements.slice(0, 2).map((announcement) => (
            <Pressable
              key={announcement.id}
              accessibilityRole="button"
              onPress={() => setTab("notices")}
              style={styles.noticePreview}
            >
              <Text style={styles.noticeTitle}>{announcement.title}</Text>
              <Text numberOfLines={2} style={styles.supporting}>
                {announcement.body}
              </Text>
            </Pressable>
          ))
        )}
        {!announcementsLoading && !announcements.length ? (
          <Text style={styles.emptyInline}>No new academy notices.</Text>
        ) : null}
      </>
    );
  }

  const pageTitle =
    tab === "today"
      ? `Hello, ${firstName}.`
      : tab === "classes"
        ? selected
          ? "Class details"
          : "My classes"
        : tab === "students"
          ? "My students"
          : tab === "profile"
            ? "Profile"
            : "Academy notices";
  const pageSubtitle =
    tab === "today"
      ? "Your classes and tasks for the day."
      : tab === "classes" && selected && selected.status === "scheduled"
        ? "Mark attendance and record progress for this class."
        : tab === "profile"
          ? "Your coach account."
          : auth.user.academyName;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.brandLockup}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>S</Text>
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.brand}>SportDesk</Text>
            <Text numberOfLines={1} style={styles.academyName}>
              {auth.user.academyName}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Academy notices${unreadCount ? `, ${unreadCount} unread` : ""}`}
          onPress={() => setTab(tab === "notices" ? "today" : "notices")}
          style={[styles.bellButton, tab === "notices" && styles.bellButtonActive]}
        >
          <WorkspaceIcon name="bell" color={tab === "notices" ? colors.brand : colors.muted} />
          {unreadCount > 0 ? <View style={styles.unreadDot} /> : null}
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshSessions()}
            tintColor={colors.brand}
          />
        }
      >
        <View style={styles.pageHeading}>
          <Text style={styles.pageTitle}>{pageTitle}</Text>
          <Text style={styles.pageSubtitle}>{pageSubtitle}</Text>
        </View>
        {queuedAttendance.length > 0 ? (
          <View style={styles.queueBanner}>
            <View style={styles.queueCopy}>
              <Text style={styles.queueTitle}>
                {queuedAttendance.length} class{queuedAttendance.length === 1 ? "" : "es"} waiting
                to sync
              </Text>
              <Text style={styles.queueDetail}>
                {Platform.OS === "web"
                  ? "Saved in this browser session; syncing when the app is active."
                  : "Encrypted on this device; syncing when the app is active."}
              </Text>
              {queuedAttendance.map((item) => (
                <Text key={item.sessionId} style={styles.queueDetail}>
                  {item.batchName} · {formatDate(item.startsAt, timeZone)}
                </Text>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void syncQueuedAttendance()}
              style={[styles.syncButton, busy && styles.disabled]}
            >
              <Text style={styles.syncButtonText}>{busy ? "Syncing…" : "Sync now"}</Text>
            </Pressable>
          </View>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        {notice ? (
          <Text accessibilityRole="alert" style={styles.successMessage}>
            {notice}
          </Text>
        ) : null}
        {renderContent()}
      </ScrollView>
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
                setTab(item.id);
              }}
              style={styles.navButton}
            >
              <View style={[styles.navIconWrap, active && styles.navIconWrapActive]}>
                <WorkspaceIcon name={coachIconByTab[item.id]} color={active ? colors.brand : colors.muted} size={20} />
              </View>
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  brandLockup: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
  },
  brandMarkText: { color: colors.surface, fontSize: 18, fontWeight: "800" },
  headerCopy: { flex: 1 },
  brand: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  academyName: { marginTop: 2, color: colors.muted, fontSize: 12 },
  bellButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.subtle,
  },
  bellButtonActive: { backgroundColor: colors.brandSoft },
  unreadDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.surface,
    backgroundColor: colors.danger,
  },
  content: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 21, paddingBottom: 28 },
  pageHeading: { marginBottom: 19 },
  pageTitle: {
    color: colors.ink,
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  pageSubtitle: { marginTop: 5, color: colors.muted, fontSize: 13, lineHeight: 19 },
  queueBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 15,
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FCD34D",
    backgroundColor: "#FFFBEB",
  },
  queueCopy: { flex: 1, gap: 3 },
  queueTitle: { color: "#92400E", fontSize: 13, fontWeight: "700" },
  queueDetail: { color: "#92400E", fontSize: 11, lineHeight: 15 },
  syncButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#92400E",
  },
  syncButtonText: { color: colors.surface, fontSize: 12, fontWeight: "700" },
  todaySummary: { padding: 17, borderRadius: 20, borderWidth: 1, borderColor: "#DBEADF", backgroundColor: "#EAF3EB" },
  summaryTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryLabel: { color: colors.brand, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  summaryDate: { marginTop: 5, color: colors.ink, fontSize: 17, fontWeight: "700" },
  summaryCount: { color: colors.brand, fontSize: 22, fontWeight: "800" },
  summaryCountBadge: { flexDirection: "row", alignItems: "baseline" },
  summaryCountTotal: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  summaryCaption: { marginTop: 10, color: colors.text, fontSize: 12 },
  nextClassCard: { marginTop: 12, padding: 17, borderRadius: 20, borderWidth: 1, borderColor: "#E7E8D9", backgroundColor: "#FFFDF4" },
  nextClassTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  nextClassTag: { flexDirection: "row", alignItems: "center", gap: 7 },
  nextClassDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.coral },
  nextClassTagText: { color: colors.warning, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  nextClassName: { marginTop: 13, color: colors.ink, fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
  nextClassMeta: { marginTop: 5, color: colors.text, fontSize: 12, lineHeight: 17 },
  nextClassActionRow: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#EEEBDD", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  nextClassAction: { color: colors.brand, fontSize: 13, fontWeight: "700" },
  nextClassArrow: { color: colors.brand, fontSize: 21, lineHeight: 22 },
  sectionHeading: {
    marginTop: 24,
    marginBottom: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  linkText: { color: colors.brand, fontSize: 12, fontWeight: "600" },
  classFilter: { flexDirection: "row", gap: 7, padding: 4, marginBottom: 13, borderRadius: 13, backgroundColor: "#E9EEEA" },
  classFilterOption: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 36, paddingHorizontal: 10, borderRadius: 10 },
  classFilterOptionActive: { backgroundColor: colors.surface, shadowColor: "#24483D", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 1 },
  classFilterText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  classFilterTextActive: { color: colors.ink, fontWeight: "700" },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 9,
    padding: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.75 },
  cancelledCard: { opacity: 0.55 },
  sessionTimeBlock: { minWidth: 61 },
  sessionTime: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  sessionDate: { marginTop: 4, color: colors.muted, fontSize: 10 },
  sessionMain: { flex: 1 },
  sessionName: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  sessionDetail: { marginTop: 4, color: colors.muted, fontSize: 11, lineHeight: 16 },
  sessionPresenceCard: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sessionPresenceTitle: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  sessionPresenceText: { marginTop: 6, color: colors.text, fontSize: 12 },
  sessionPresenceHint: { marginTop: 7, color: colors.muted, fontSize: 11 },
  presenceButton: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: colors.brandSoft,
  },
  presenceButtonText: { color: colors.brand, fontSize: 12, fontWeight: "700" },
  sessionState: { marginTop: 5, color: colors.brand, fontSize: 10, fontWeight: "600" },
  workflowCard: { marginBottom: 15, paddingHorizontal: 15, paddingVertical: 13, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  workflowStep: { flexDirection: "row", alignItems: "center", gap: 11, minHeight: 43 },
  workflowRule: { marginLeft: 13, height: 13, borderLeftWidth: 1, borderColor: colors.border },
  workflowNumber: { width: 27, height: 27, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas },
  workflowNumberText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  workflowDone: { borderColor: "#B7D8C3", backgroundColor: colors.successSoft },
  workflowDoneText: { color: colors.success },
  workflowCurrent: { borderColor: "#C9E3D3", backgroundColor: colors.brandSoft },
  workflowCurrentText: { color: colors.brand },
  workflowCopy: { flex: 1 },
  workflowTitle: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  workflowDetail: { marginTop: 2, color: colors.muted, fontSize: 11 },
  attendanceHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4, marginBottom: 9 },
  markAllButton: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.brandSoft },
  markAllLabel: { color: colors.brand, fontSize: 11, fontWeight: "700" },
  completedText: { color: colors.success },
  cancelledText: { color: colors.muted },
  chevron: { color: colors.muted, fontSize: 21 },
  noticePreview: {
    marginBottom: 8,
    padding: 14,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  noticeCard: {
    marginBottom: 10,
    padding: 15,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  noticeHeading: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  noticeTitle: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  noticeBadge: {
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    fontSize: 10,
    fontWeight: "700",
  },
  newBadge: { color: colors.brand, backgroundColor: colors.brandSoft },
  readBadge: { color: colors.muted, backgroundColor: colors.subtle },
  supporting: { marginTop: 5, color: colors.muted, fontSize: 12, lineHeight: 17 },
  noticeBody: { marginTop: 10, color: colors.text, fontSize: 13, lineHeight: 20 },
  textButton: { alignSelf: "flex-start", marginTop: 10, paddingVertical: 5 },
  textButtonLabel: { color: colors.brand, fontSize: 13, fontWeight: "600" },
  emptyInline: { marginTop: 4, color: colors.muted, fontSize: 13 },
  noticeLoader: { marginTop: 8 },
  backButton: { alignSelf: "flex-start", paddingVertical: 5 },
  backLabel: { color: colors.brand, fontSize: 13, fontWeight: "600" },
  detailHeader: { marginTop: 15, marginBottom: 17 },
  eyebrow: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  rosterCard: {
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  studentRow: { paddingVertical: 14 },
  progressRowWrap: { paddingHorizontal: 14 },
  progressToggle: { paddingBottom: 12 },
  progressToggleText: { color: colors.brand, fontSize: 12, fontWeight: "700" },
  progressForm: { gap: 9, paddingBottom: 14 },
  progressInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    backgroundColor: colors.surface,
    fontSize: 13,
  },
  progressNote: { minHeight: 72, textAlignVertical: "top" },
  shareRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  shareLabel: { color: colors.text, fontSize: 13 },
  progressSave: {
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: colors.brand,
    padding: 11,
  },
  progressSaveText: { color: "white", fontSize: 13, fontWeight: "700" },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  studentName: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  statusChoices: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  statusChoice: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statusChoiceActive: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  statusChoiceText: { color: colors.text, fontSize: 11, fontWeight: "500" },
  statusChoiceTextActive: { color: colors.brand, fontWeight: "700" },
  readOnlyChoice: { opacity: 0.8 },
  readOnlyNote: { marginTop: 10, color: colors.success, fontSize: 12, fontWeight: "600" },
  primaryButton: {
    minHeight: 48,
    marginTop: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.brand,
  },
  primaryButtonText: { color: colors.surface, fontSize: 14, fontWeight: "700" },
  finishHint: { marginTop: 8, color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: "center" },
  disabled: { opacity: 0.55 },
  profileCard: {
    alignItems: "center",
    padding: 22,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  studentsIntro: { marginBottom: 11, color: colors.muted, fontSize: 13 },
  studentsCard: {
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  studentListRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 13 },
  avatarSmall: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandSoft,
  },
  avatarSmallText: { color: colors.brand, fontSize: 15, fontWeight: "700" },
  studentListMain: { flex: 1 },
  profileForm: {
    marginTop: 12,
    padding: 15,
    gap: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  formLabel: { marginTop: 4, color: colors.text, fontSize: 12, fontWeight: "700" },
  historySummary: {
    marginBottom: 11,
    padding: 15,
    borderRadius: 14,
    backgroundColor: colors.brandSoft,
  },
  historyMetric: { marginTop: 7, color: colors.brand, fontSize: 21, fontWeight: "700" },
  historyCard: {
    marginBottom: 11,
    padding: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  historyStatus: { color: colors.brand, fontSize: 11, fontWeight: "700" },
  feedbackHistory: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  feedbackGuidance: { marginTop: 6, color: colors.text, fontSize: 12, lineHeight: 18 },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandSoft,
  },
  avatarText: { color: colors.brand, fontSize: 24, fontWeight: "700" },
  profileName: { marginTop: 12, color: colors.ink, fontSize: 18, fontWeight: "700" },
  profileNote: {
    marginTop: 12,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  logoutButton: {
    alignItems: "center",
    marginTop: 20,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  logoutLabel: { color: colors.danger, fontSize: 14, fontWeight: "600" },
  error: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.dangerSoft,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  successMessage: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.successSoft,
    color: colors.success,
    fontSize: 13,
    lineHeight: 19,
  },
  loader: { marginVertical: 32 },
  emptyState: {
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyTitle: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  emptyDetail: { marginTop: 5, color: colors.muted, fontSize: 13, lineHeight: 19 },
  bottomNav: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 9,
    paddingBottom: 7,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  navButton: {
    minWidth: 60,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 2,
  },
  navIconWrap: {
    width: 38,
    height: 27,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  navIconWrapActive: { backgroundColor: colors.brandSoft },
  navLabel: { color: colors.muted, fontSize: 10, fontWeight: "500" },
  navLabelActive: { color: colors.brand, fontWeight: "700" },
} as const);

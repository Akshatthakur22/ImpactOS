import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
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
  CoachStudentSchema,
  ParentAnnouncementListSchema,
  SessionRosterSchema,
  TrainingSessionSchema,
  type AttendanceStatus,
  type AuthData,
  type CoachStudent,
  type ParentAnnouncement,
  type SessionRoster,
  type TrainingSession,
} from "@sportdesk/contracts";
import { z } from "zod";
import { requestMobileData } from "@/lib/api";
import {
  enqueueAttendance,
  readAttendanceQueue,
  removeQueuedAttendance,
  type QueuedAttendance,
} from "@/lib/attendance-queue";

const colors = {
  brand: "#2563EB",
  brandSoft: "#EFF6FF",
  ink: "#111827",
  text: "#4B5563",
  muted: "#6B7280",
  canvas: "#F7F8FA",
  surface: "#FFFFFF",
  subtle: "#F3F4F6",
  border: "#E5E7EB",
  success: "#15803D",
  successSoft: "#F0FDF4",
  warning: "#B45309",
  warningSoft: "#FFFBEB",
  danger: "#B91C1C",
  dangerSoft: "#FEF2F2",
};

const statusOptions = AttendanceStatusSchema.options;
const statusLabels: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "Excused",
};
const navItems = [
  { id: "today", label: "Today", icon: "⌂" },
  { id: "attendance", label: "Attend", icon: "✓" },
  { id: "classes", label: "Classes", icon: "▦" },
  { id: "students", label: "Students", icon: "◎" },
  { id: "profile", label: "Profile", icon: "○" },
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
        <Text
          style={[
            styles.sessionState,
            completed && styles.completedText,
            cancelled && styles.cancelledText,
          ]}
        >
          {completed ? "Completed" : cancelled ? "Cancelled" : "Attendance ready"}
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
      .finally(() => {
        if (active) setQueueReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadSessions = useCallback(async () => {
    const result = await requestMobileData(
      "/coach/me/sessions",
      (value) => z.object({ sessions: TrainingSessionSchema.array() }).parse(value),
      auth,
      onAuthUpdate,
    );
    setSessions(result.sessions);
  }, [auth, onAuthUpdate]);

  async function syncQueueItem(item: QueuedAttendance) {
    if (item.coachUserId !== auth.user.id)
      throw new Error("Sign in as the coach who recorded this offline attendance to sync it.");
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
    const next = await removeQueuedAttendance(item.sessionId);
    setQueuedAttendance(next);
  }

  async function syncQueuedAttendance() {
    if (queueSyncLock.current) return;
    queueSyncLock.current = true;
    const pending = await readAttendanceQueue();
    setQueuedAttendance(pending);
    if (!pending.length) {
      queueSyncLock.current = false;
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    let synced = 0;
    try {
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
      setBusy(false);
      queueSyncLock.current = false;
    }
  }

  useEffect(() => {
    if (!queueReady || !queuedAttendance.length) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncQueuedAttendance();
    });
    if (AppState.currentState === "active") void syncQueuedAttendance();
    return () => subscription.remove();
  }, [queueReady, auth.user.id]);

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
    () => sortedSessions.filter((session) => sameLocalDay(session.startsAt, timeZone)),
    [sortedSessions, timeZone],
  );
  const availableSessions = useMemo(
    () => sortedSessions.filter((session) => session.status !== "cancelled"),
    [sortedSessions],
  );
  const unreadCount = announcements.filter((announcement) => !announcement.readAt).length;
  const completedToday = todaysSessions.filter((session) => session.status === "completed").length;
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
    setTab("attendance");
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
      setSelected(null);
    } finally {
      setRosterLoading(false);
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
    const allMarked = roster.students.every((student) => attendance[student.studentId]);
    if (!allMarked) {
      setError("Choose an attendance status for every student before saving.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const queued = await enqueueAttendance({
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
      setQueuedAttendance(queued);
      await syncQueueItem(queued.find((item) => item.sessionId === selected.id)!);
      closeSession();
      setNotice("Attendance saved and class completed.");
      await loadSessions();
    } catch (caught) {
      setNotice(
        "Attendance is saved securely on this device and queued to sync when the connection returns.",
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
    setTab("attendance");
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
      setSelected(null);
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
        <Text accessibilityRole="alert" style={styles.error}>
          {announcementError}
        </Text>
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
    if (!selected || !roster) return null;
    const readOnly = selected.status !== "scheduled";
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
            {selected.venue ?? "Venue not set"} · {roster.students.length} students
          </Text>
          {readOnly ? (
            <Text style={styles.readOnlyNote}>
              This class is complete. Attendance is read-only.
            </Text>
          ) : null}
        </View>
        {!roster.students.length ? (
          <EmptyState
            title="No active students"
            detail="There are no active enrollments in this class."
          />
        ) : (
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
                          disabled={readOnly}
                          onPress={() =>
                            setAttendance((current) => ({
                              ...current,
                              [student.studentId]: status,
                            }))
                          }
                          style={[
                            styles.statusChoice,
                            active && styles.statusChoiceActive,
                            readOnly && styles.readOnlyChoice,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusChoiceText,
                              active && styles.statusChoiceTextActive,
                            ]}
                          >
                            {statusLabels[status]}
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
        )}
        {!readOnly && roster.students.length ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy || remainingMarks > 0}
            onPress={() => void saveAttendance()}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
              (busy || remainingMarks > 0) && styles.disabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {busy
                ? "Saving attendance…"
                : remainingMarks > 0
                  ? `Mark ${remainingMarks} more students`
                  : "Save and finish class"}
            </Text>
          </Pressable>
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
          <Text style={styles.profileNote}>
            Your academy administrator manages coach contact details and account access.
          </Text>
          <Pressable accessibilityRole="button" onPress={onLogout} style={styles.logoutButton}>
            <Text style={styles.logoutLabel}>Sign out</Text>
          </Pressable>
        </>
      );
    }
    if (tab === "attendance" && selected) return renderRoster();
    if (tab === "attendance") {
      return (
        <>
          {renderSessionList(
            availableSessions.filter((session) => session.status === "scheduled"),
            "You have no upcoming classes that need attendance.",
          )}
        </>
      );
    }
    if (tab === "classes")
      return renderSessionList(
        availableSessions,
        "Your upcoming classes will appear here when the academy schedules them.",
      );
    if (tab === "students") {
      if (studentsLoading) return <ActivityIndicator style={styles.loader} color={colors.brand} />;
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
              <View
                key={student.studentId}
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
              </View>
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
            <Text style={styles.summaryCount}>
              {completedToday}/{todaysSessions.length}
            </Text>
          </View>
          <Text style={styles.summaryCaption}>
            {todaysSessions.length ? "Classes completed" : "No classes on your schedule today"}
          </Text>
        </View>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Today’s classes</Text>
          <Pressable accessibilityRole="button" onPress={() => setTab("classes")}>
            <Text style={styles.linkText}>All classes</Text>
          </Pressable>
        </View>
        {renderSessionList(todaysSessions, "Your next assigned classes are available in Classes.")}
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
      : tab === "attendance"
        ? selected
          ? "Take attendance"
          : "Attendance"
        : tab === "classes"
          ? "My classes"
          : tab === "students"
            ? "My students"
            : tab === "profile"
              ? "Profile"
              : "Academy notices";
  const pageSubtitle =
    tab === "today"
      ? "Your classes and tasks for the day."
      : tab === "attendance" && selected
        ? "Mark each student’s attendance for this class."
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
          <Text style={[styles.bellIcon, tab === "notices" && styles.bellIconActive]}>♢</Text>
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
                Attendance is encrypted on this device and will retry when the app is active.
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
                <Text style={[styles.navIcon, active && styles.navIconActive]}>{item.icon}</Text>
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
  bellIcon: { color: colors.text, fontSize: 23 },
  bellIconActive: { color: colors.brand },
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
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 28 },
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
  todaySummary: { padding: 17, borderRadius: 16, backgroundColor: colors.ink },
  summaryTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryLabel: { color: "#D1D5DB", fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  summaryDate: { marginTop: 5, color: colors.surface, fontSize: 17, fontWeight: "700" },
  summaryCount: { color: colors.surface, fontSize: 25, fontWeight: "700" },
  summaryCaption: { marginTop: 10, color: "#D1D5DB", fontSize: 12 },
  sectionHeading: {
    marginTop: 24,
    marginBottom: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  linkText: { color: colors.brand, fontSize: 12, fontWeight: "600" },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 9,
    padding: 14,
    borderRadius: 14,
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
  sessionState: { marginTop: 5, color: colors.brand, fontSize: 10, fontWeight: "600" },
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
    borderRadius: 14,
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
  disabled: { opacity: 0.55 },
  profileCard: {
    alignItems: "center",
    padding: 22,
    borderRadius: 16,
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
  navIcon: { color: colors.muted, fontSize: 18, lineHeight: 21, fontWeight: "600" },
  navIconActive: { color: colors.brand },
  navLabel: { color: colors.muted, fontSize: 10, fontWeight: "500" },
  navLabelActive: { color: colors.brand, fontWeight: "700" },
} as const);

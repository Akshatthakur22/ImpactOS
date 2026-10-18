import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  AttendanceStatusSchema,
  ParentAnnouncementListSchema,
  SessionRosterSchema,
  TrainingSessionSchema,
  type AttendanceStatus,
  type AuthData,
  type ParentAnnouncement,
  type SessionRoster,
  type TrainingSession,
} from "@sportdesk/contracts";
import { z } from "zod";
import { requestMobileData } from "@/lib/api";

const statusOptions = AttendanceStatusSchema.options;
const statusLabels: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "Excused",
};

export function CoachWorkspace({
  auth,
  onAuthUpdate,
  onLogout,
}: {
  auth: AuthData;
  onAuthUpdate: (nextAuth: AuthData) => void;
  onLogout: () => void;
}) {
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [selected, setSelected] = useState<TrainingSession | null>(null);
  const [roster, setRoster] = useState<SessionRoster | null>(null);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [announcements, setAnnouncements] = useState<ParentAnnouncement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const [announcementError, setAnnouncementError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    const result = await requestMobileData(
      "/coach/me/sessions",
      (value) => z.object({ sessions: TrainingSessionSchema.array() }).parse(value),
      auth,
      onAuthUpdate,
    );
    setSessions(result.sessions);
  }, [auth, onAuthUpdate]);

  useEffect(() => {
    setLoading(true);
    loadSessions()
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : "Could not load your sessions."),
      )
      .finally(() => setLoading(false));
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

  async function markAnnouncementRead(announcementId: string) {
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
        caught instanceof Error ? caught.message : "Could not mark the notice as read.",
      );
    }
  }

  async function openSession(session: TrainingSession) {
    setSelected(session);
    setRoster(null);
    setError(null);
    setNotice(null);
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
          result.students.map((student) => [student.studentId, student.status ?? "present"]),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the student roster.");
    }
  }

  async function saveAttendance() {
    if (!selected || !roster) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await requestMobileData(
        `/coach/sessions/${selected.id}/attendance`,
        (value) => value,
        auth,
        onAuthUpdate,
        {
          method: "PUT",
          body: JSON.stringify({
            records: roster.students.map((student) => ({
              studentId: student.studentId,
              status: attendance[student.studentId] ?? "present",
            })),
          }),
        },
      );
      await requestMobileData(
        `/coach/sessions/${selected.id}/complete`,
        (value) => value,
        auth,
        onAuthUpdate,
        { method: "POST" },
      );
      setNotice("Attendance saved and session completed.");
      setSelected(null);
      setRoster(null);
      await loadSessions();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save attendance.");
    } finally {
      setBusy(false);
    }
  }

  const firstName = auth.user.displayName.split(" ")[0];

  return (
    <SafeAreaWorkspace
      title={`Hello, ${firstName}.`}
      eyebrow="COACH WORKSPACE"
      email={auth.user.email}
      onLogout={onLogout}
    >
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {notice ? (
        <Text accessibilityRole="alert" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
      {!selected ? (
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>ACADEMY UPDATES</Text>
          <Text style={styles.cardTitle}>Notices</Text>
          {announcementError ? (
            <Text accessibilityRole="alert" style={styles.error}>{announcementError}</Text>
          ) : null}
          {announcementsLoading ? (
            <ActivityIndicator style={styles.spinner} color="#176e67" />
          ) : announcements.length ? (
            announcements.map((announcement) => (
              <View key={announcement.id} style={styles.announcementRow}>
                <View style={styles.announcementHeading}>
                  <Text style={styles.studentName}>{announcement.title}</Text>
                  <Text style={announcement.readAt ? styles.readLabel : styles.unreadLabel}>
                    {announcement.readAt ? "READ" : "NEW"}
                  </Text>
                </View>
                <Text style={styles.announcementMeta}>
                  {announcement.batchName ? `${announcement.batchName} · ` : "Academy · "}
                  {new Date(announcement.publishedAt).toLocaleDateString()}
                </Text>
                <Text style={styles.announcementBody}>{announcement.body}</Text>
                {!announcement.readAt ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void markAnnouncementRead(announcement.id)}
                    style={styles.readButton}
                  >
                    <Text style={styles.readButtonText}>Mark as read</Text>
                  </Pressable>
                ) : null}
              </View>
            ))
          ) : (
            <Text style={styles.empty}>No academy notices right now.</Text>
          )}
        </View>
      ) : null}
      {selected && roster ? (
        <View style={styles.card}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSelected(null);
              setRoster(null);
            }}
          >
            <Text style={styles.back}>‹ All sessions</Text>
          </Pressable>
          <Text style={styles.cardEyebrow}>{formatSessionTime(selected)}</Text>
          <Text style={styles.cardTitle}>{selected.batchName}</Text>
          <Text style={styles.cardBody}>
            {selected.venue ?? "Training venue not set"} · {roster.students.length} students
          </Text>
          <View style={styles.roster}>
            {roster.students.map((student) => {
              const selectedStatus = attendance[student.studentId] ?? "present";
              return (
                <View key={student.studentId} style={styles.studentRow}>
                  <Text style={styles.studentName}>{student.studentName}</Text>
                  <View style={styles.statusRow}>
                    {statusOptions.map((status) => (
                      <Pressable
                        key={status}
                        accessibilityRole="button"
                        accessibilityState={{ selected: selectedStatus === status }}
                        onPress={() =>
                          setAttendance((current) => ({ ...current, [student.studentId]: status }))
                        }
                        style={[
                          styles.statusButton,
                          selectedStatus === status && styles.statusButtonActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            selectedStatus === status && styles.statusTextActive,
                          ]}
                        >
                          {statusLabels[status]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy || roster.students.length === 0}
            onPress={() => void saveAttendance()}
            style={[
              styles.primaryButton,
              (busy || roster.students.length === 0) && styles.disabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {busy ? "Saving…" : "Save attendance and finish"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>YOUR SCHEDULE</Text>
          <Text style={styles.cardTitle}>Upcoming sessions</Text>
          <Text style={styles.cardBody}>
            Choose a session to open its roster and record attendance.
          </Text>
          {loading ? (
            <ActivityIndicator style={styles.spinner} color="#176e67" />
          ) : sessions.length ? (
            sessions.map((session) => (
              <Pressable
                key={session.id}
                accessibilityRole="button"
                disabled={session.status !== "scheduled"}
                onPress={() => void openSession(session)}
                style={[styles.sessionRow, session.status !== "scheduled" && styles.sessionRowDone]}
              >
                <View style={styles.sessionIcon}>
                  <Text style={styles.sessionIconText}>{new Date(session.startsAt).getDate()}</Text>
                </View>
                <View style={styles.sessionInfo}>
                  <Text style={styles.studentName}>{session.batchName}</Text>
                  <Text style={styles.cardBody}>
                    {formatSessionTime(session)} · {session.branchName ? `${session.branchName} · ` : ""}{session.venue ?? "Venue not set"}
                  </Text>
                  <Text style={styles.sessionStatus}>
                    {session.status === "scheduled"
                      ? "Ready for attendance"
                      : session.status === "completed"
                        ? "Completed"
                        : "Cancelled"}
                  </Text>
                </View>
                <Text style={styles.chevron}>{session.status === "scheduled" ? "›" : ""}</Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.empty}>No sessions are assigned to you in the next two weeks.</Text>
          )}
        </View>
      )}
    </SafeAreaWorkspace>
  );
}

function formatSessionTime(session: TrainingSession) {
  return new Date(session.startsAt).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SafeAreaWorkspace({
  title,
  eyebrow,
  email,
  onLogout,
  children,
}: {
  title: string;
  eyebrow: string;
  email: string;
  onLogout: () => void;
  children: ReactNode;
}) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.topline}>
        <View>
          <Text style={styles.brand}>SportDesk</Text>
          <Text style={styles.email}>{email}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onLogout} style={styles.signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>Your academy schedule, ready for the floor.</Text>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 40,
    backgroundColor: "#f5f6f8",
  },
  topline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 34,
  },
  brand: { color: "#17212d", fontSize: 17, fontWeight: "800" },
  email: { marginTop: 3, color: "#87939c", fontSize: 11 },
  signOut: {
    borderRadius: 10,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  signOutText: { color: "#53616b", fontSize: 12, fontWeight: "600" },
  eyebrow: { color: "#176e67", fontSize: 11, fontWeight: "700", letterSpacing: 1.4 },
  title: { marginTop: 8, color: "#17212d", fontSize: 29, fontWeight: "700", letterSpacing: -0.9 },
  subtitle: { marginTop: 8, color: "#667481", fontSize: 13, lineHeight: 20 },
  card: {
    marginTop: 24,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    padding: 18,
    shadowColor: "#182734",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  cardEyebrow: { color: "#87939c", fontSize: 10, fontWeight: "700", letterSpacing: 1.1 },
  cardTitle: { marginTop: 8, color: "#17212d", fontSize: 19, fontWeight: "700" },
  cardBody: { marginTop: 5, color: "#667481", fontSize: 12, lineHeight: 18 },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#edf0f1",
    paddingVertical: 13,
  },
  sessionRowDone: { opacity: 0.72 },
  sessionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e5f3f0",
  },
  sessionIconText: { color: "#176e67", fontSize: 14, fontWeight: "700" },
  sessionInfo: { flex: 1 },
  sessionStatus: { marginTop: 4, color: "#176e67", fontSize: 10, fontWeight: "700" },
  studentName: { color: "#26333d", fontSize: 13, fontWeight: "600" },
  chevron: { color: "#87939c", fontSize: 22 },
  empty: { marginTop: 18, color: "#87939c", fontSize: 13, lineHeight: 19 },
  spinner: { marginTop: 22, marginBottom: 10 },
  error: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: "#fff0ed",
    padding: 12,
    color: "#984d3f",
    fontSize: 12,
    lineHeight: 18,
  },
  notice: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: "#eaf5f1",
    padding: 12,
    color: "#176e67",
    fontSize: 12,
    lineHeight: 18,
  },
  announcementRow: { borderTopWidth: 1, borderTopColor: "#edf0f1", paddingVertical: 13 },
  announcementHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  announcementMeta: { marginTop: 5, color: "#87939c", fontSize: 10 },
  announcementBody: { marginTop: 8, color: "#53616b", fontSize: 12, lineHeight: 19 },
  unreadLabel: { color: "#176e67", fontSize: 9, fontWeight: "800" },
  readLabel: { color: "#87939c", fontSize: 9, fontWeight: "800" },
  readButton: { alignSelf: "flex-start", marginTop: 10, paddingVertical: 5 },
  readButtonText: { color: "#176e67", fontSize: 11, fontWeight: "700" },
  back: { marginBottom: 18, color: "#176e67", fontSize: 13, fontWeight: "700" },
  roster: { marginTop: 10 },
  studentRow: { borderTopWidth: 1, borderTopColor: "#edf0f1", paddingVertical: 13 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 9 },
  statusButton: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#e4e9eb",
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  statusButtonActive: { borderColor: "#176e67", backgroundColor: "#e5f3f0" },
  statusText: { color: "#71808a", fontSize: 10, fontWeight: "600" },
  statusTextActive: { color: "#176e67" },
  primaryButton: {
    marginTop: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#176e67",
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  primaryButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  disabled: { opacity: 0.55 },
});

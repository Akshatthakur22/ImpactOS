import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ParentAttendanceSchema,
  ParentScheduleSchema,
  ParentStudentSchema,
  type AuthData,
  type ParentAttendance,
  type ParentSchedule,
  type ParentStudent,
} from "@sportdesk/contracts";
import { z } from "zod";
import { requestMobileData } from "@/lib/api";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ParentWorkspace({
  auth,
  onAuthUpdate,
  onLogout,
}: {
  auth: AuthData;
  onAuthUpdate: (nextAuth: AuthData) => void;
  onLogout: () => void;
}) {
  const [students, setStudents] = useState<ParentStudent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<ParentSchedule[]>([]);
  const [attendance, setAttendance] = useState<ParentAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStudents = useCallback(async () => {
    const result = await requestMobileData(
      "/parent/me/students",
      (value) => z.object({ students: ParentStudentSchema.array() }).parse(value),
      auth,
      onAuthUpdate,
    );
    setStudents(result.students);
    setSelectedId((current) =>
      current && result.students.some((student) => student.id === current)
        ? current
        : (result.students[0]?.id ?? null),
    );
  }, [auth, onAuthUpdate]);

  useEffect(() => {
    setLoading(true);
    loadStudents()
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : "Could not load linked children."),
      )
      .finally(() => setLoading(false));
  }, [loadStudents]);

  useEffect(() => {
    if (!selectedId) {
      setSchedules([]);
      setAttendance([]);
      return;
    }
    let active = true;
    setError(null);
    Promise.all([
      requestMobileData(
        `/parent/students/${selectedId}/schedule`,
        (value) => z.object({ schedules: ParentScheduleSchema.array() }).parse(value),
        auth,
        onAuthUpdate,
      ),
      requestMobileData(
        `/parent/students/${selectedId}/attendance`,
        (value) => z.object({ records: ParentAttendanceSchema.array() }).parse(value),
        auth,
        onAuthUpdate,
      ),
    ])
      .then(([scheduleResult, attendanceResult]) => {
        if (!active) return;
        setSchedules(scheduleResult.schedules);
        setAttendance(attendanceResult.records);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load the child schedule and attendance.",
          );
      });
    return () => {
      active = false;
    };
  }, [auth, onAuthUpdate, selectedId]);

  const selected = students.find((student) => student.id === selectedId) ?? null;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.topline}>
        <View>
          <Text style={styles.brand}>SportDesk</Text>
          <Text style={styles.email}>{auth.user.email}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onLogout} style={styles.signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
      <Text style={styles.eyebrow}>FAMILY WORKSPACE</Text>
      <Text style={styles.title}>Your child’s training</Text>
      <Text style={styles.subtitle}>Schedules and attendance from {auth.user.academyName}.</Text>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {loading ? (
        <ActivityIndicator style={styles.spinner} color="#176e67" />
      ) : students.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>No linked children yet</Text>
          <Text style={styles.body}>
            Ask the academy to check the parent invite and student link.
          </Text>
        </View>
      ) : (
        <>
          {students.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.childSelector}
            >
              {students.map((student) => {
                const active = student.id === selectedId;
                return (
                  <Pressable
                    key={student.id}
                    onPress={() => setSelectedId(student.id)}
                    style={[styles.childPill, active && styles.childPillActive]}
                  >
                    <Text style={[styles.childPillText, active && styles.childPillTextActive]}>
                      {student.firstName}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
          {selected ? (
            <View style={styles.card}>
              <Text style={styles.cardEyebrow}>STUDENT</Text>
              <Text style={styles.cardTitle}>
                {selected.firstName} {selected.lastName}
              </Text>
              {selected.batchNames.length ? (
                <Text style={styles.body}>{selected.batchNames.join(" · ")}</Text>
              ) : (
                <Text style={styles.body}>No active batch</Text>
              )}
              <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Weekly schedule</Text>
              {schedules.length ? (
                schedules.map((schedule) => (
                  <View key={schedule.id} style={styles.row}>
                    <View style={styles.dayIcon}>
                      <Text style={styles.dayIconText}>
                        {(weekdays[schedule.dayOfWeek] ?? "Day").slice(0, 3)}
                      </Text>
                    </View>
                    <View style={styles.rowContent}>
                      <Text style={styles.rowTitle}>{schedule.batchName}</Text>
                      <Text style={styles.body}>
                        {schedule.startTime}–{schedule.endTime}
                        {schedule.venue ? ` · ${schedule.venue}` : ""}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.empty}>The academy has not added a weekly schedule yet.</Text>
              )}
              <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Attendance</Text>
              {attendance.length ? (
                attendance.map((record) => (
                  <View key={record.id} style={styles.attendanceRow}>
                    <View style={styles.rowContent}>
                      <Text style={styles.rowTitle}>{record.batchName}</Text>
                      <Text style={styles.body}>
                        {new Date(record.scheduledStart).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.status,
                        styles[`status_${record.status}` as keyof typeof styles],
                      ]}
                    >
                      {record.status.toUpperCase()}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.empty}>No attendance records yet.</Text>
              )}
            </View>
          ) : null}
        </>
      )}
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
  childSelector: { flexDirection: "row", gap: 8, marginTop: 20 },
  childPill: {
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#e1e6e9",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  childPillActive: { borderColor: "#176e67", backgroundColor: "#e5f3f0" },
  childPillText: { color: "#667481", fontSize: 12, fontWeight: "600" },
  childPillTextActive: { color: "#176e67" },
  card: {
    marginTop: 20,
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
  sectionTitle: { color: "#26333d", fontSize: 14, fontWeight: "700" },
  body: { marginTop: 5, color: "#667481", fontSize: 12, lineHeight: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#edf0f1",
    paddingVertical: 13,
  },
  rowContent: { flex: 1 },
  rowTitle: { color: "#26333d", fontSize: 13, fontWeight: "600" },
  dayIcon: {
    borderRadius: 9,
    backgroundColor: "#e5f3f0",
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  dayIconText: { color: "#176e67", fontSize: 10, fontWeight: "700" },
  attendanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#edf0f1",
    paddingVertical: 12,
  },
  status: {
    overflow: "hidden",
    borderRadius: 99,
    paddingHorizontal: 9,
    paddingVertical: 6,
    fontSize: 9,
    fontWeight: "700",
  },
  status_present: { backgroundColor: "#e5f3f0", color: "#176e67" },
  status_late: { backgroundColor: "#fff3dc", color: "#8a6418" },
  status_absent: { backgroundColor: "#fff0ed", color: "#984d3f" },
  status_excused: { backgroundColor: "#eef2f4", color: "#667481" },
  empty: { marginTop: 10, color: "#87939c", fontSize: 12, lineHeight: 18 },
  spinner: { marginTop: 28 },
  error: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: "#fff0ed",
    padding: 12,
    color: "#984d3f",
    fontSize: 12,
    lineHeight: 18,
  },
});

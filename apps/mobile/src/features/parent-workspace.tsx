import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ParentAttendanceSchema,
  ParentAnnouncementListSchema,
  ParentScheduleSchema,
  ParentStudentFinanceSchema,
  ParentStudentSchema,
  ProgressEntrySchema,
  UpdatedRecordSchema,
  type AuthData,
  type ParentAttendance,
  type ParentAnnouncement,
  type ParentSchedule,
  type ParentStudent,
  type ParentStudentFinance,
  type ProgressEntry,
} from "@sportdesk/contracts";
import { z } from "zod";
import { requestMobileData } from "@/lib/api";

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

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const tabs = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "schedule", label: "Schedule", icon: "▦" },
  { id: "attendance", label: "Attendance", icon: "✓" },
  { id: "progress", label: "Progress", icon: "↗" },
  { id: "payments", label: "Payments", icon: "₹" },
  { id: "profile", label: "Profile", icon: "○" },
] as const;
type Tab = (typeof tabs)[number]["id"] | "announcements";

function formatCurrency(amountPaise: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountPaise / 100);
}

function formatDate(value: string, timeZone: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function SectionTitle({ children, trailing }: { children: string; trailing?: string | undefined }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {trailing ? <Text style={styles.sectionTrailing}>{trailing}</Text> : null}
    </View>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </View>
  );
}

function ScheduleList({ schedules }: { schedules: ParentSchedule[] }) {
  if (!schedules.length) {
    return (
      <EmptyState
        title="No schedule yet"
        detail="The academy has not added a weekly schedule for this child."
      />
    );
  }
  return (
    <View style={styles.listCard}>
      {schedules.map((schedule, index) => (
        <View key={schedule.id} style={[styles.scheduleRow, index > 0 && styles.rowDivider]}>
          <View style={styles.dayBadge}>
            <Text style={styles.dayBadgeDay}>
              {(weekdays[schedule.dayOfWeek] ?? "Day").slice(0, 3)}
            </Text>
          </View>
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle}>{schedule.batchName}</Text>
            <Text style={styles.rowDetail}>
              {schedule.startTime}–{schedule.endTime}
              {schedule.branchName ? ` · ${schedule.branchName}` : ""}
              {schedule.venue ? ` · ${schedule.venue}` : ""}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function ParentWorkspace({
  auth,
  onAuthUpdate,
  onLogout,
}: {
  auth: AuthData;
  onAuthUpdate: (nextAuth: AuthData) => void;
  onLogout: () => void;
}) {
  const timeZone = auth.user.academyTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [students, setStudents] = useState<ParentStudent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [schedules, setSchedules] = useState<ParentSchedule[]>([]);
  const [attendance, setAttendance] = useState<ParentAttendance[]>([]);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [finance, setFinance] = useState<ParentStudentFinance | null>(null);
  const [announcements, setAnnouncements] = useState<ParentAnnouncement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const [announcementError, setAnnouncementError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
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
    let active = true;
    setLoading(true);
    loadStudents()
      .catch((caught: unknown) => {
        if (active)
          setError(caught instanceof Error ? caught.message : "Could not load linked children.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadStudents]);

  useEffect(() => {
    let active = true;
    requestMobileData(
      "/parent/announcements",
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
            caught instanceof Error ? caught.message : "Could not load academy announcements.",
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
    if (!selectedId) {
      setSchedules([]);
      setAttendance([]);
      setProgress([]);
      setFinance(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
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
      requestMobileData(
        `/parent/students/${selectedId}/finance`,
        (value) => ParentStudentFinanceSchema.parse(value),
        auth,
        onAuthUpdate,
      ),
      requestMobileData(
        `/parent/students/${selectedId}/progress`,
        (value) => z.object({ entries: ProgressEntrySchema.array() }).parse(value),
        auth,
        onAuthUpdate,
      ),
    ])
      .then(([scheduleResult, attendanceResult, financeResult, progressResult]) => {
        if (!active) return;
        setSchedules(scheduleResult.schedules);
        setAttendance(attendanceResult.records);
        setFinance(financeResult);
        setProgress(progressResult.entries);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error ? caught.message : "Could not load this child's information.",
          );
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [auth, onAuthUpdate, selectedId]);

  async function markAnnouncementRead(announcementId: string) {
    setAnnouncementError(null);
    try {
      await requestMobileData(
        `/parent/announcements/${announcementId}/read`,
        (value) => UpdatedRecordSchema.parse(value),
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

  const selected = students.find((student) => student.id === selectedId) ?? null;
  const unreadCount = announcements.filter((announcement) => !announcement.readAt).length;
  const presentCount = attendance.filter(
    (record) => record.status === "present" || record.status === "late",
  ).length;
  const attendanceRate = attendance.length
    ? Math.round((presentCount / attendance.length) * 100)
    : null;
  const dueTotal = finance?.charges.reduce((sum, charge) => sum + charge.balancePaise, 0) ?? 0;
  const studentSchedules = useMemo(
    () => [...schedules].sort((a, b) => a.dayOfWeek - b.dayOfWeek),
    [schedules],
  );

  function renderAnnouncements() {
    if (announcementsLoading)
      return <ActivityIndicator style={styles.loader} color={colors.brand} />;
    if (!announcements.length)
      return (
        <EmptyState title="You’re all caught up" detail="Academy announcements will appear here." />
      );
    return announcements.map((announcement) => (
      <View key={announcement.id} style={styles.noticeCard}>
        <View style={styles.noticeTopline}>
          <Text style={styles.noticeTitle}>{announcement.title}</Text>
          <Text
            style={[styles.noticeBadge, announcement.readAt ? styles.readBadge : styles.newBadge]}
          >
            {announcement.readAt ? "Read" : "New"}
          </Text>
        </View>
        <Text style={styles.rowDetail}>
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

  function renderAttendanceRows(records: ParentAttendance[]) {
    if (!records.length)
      return (
        <EmptyState
          title="No attendance records yet"
          detail="Attendance will appear after a coach records a session."
        />
      );
    return (
      <View style={styles.listCard}>
        {records.map((record, index) => (
          <View key={record.id} style={[styles.attendanceRow, index > 0 && styles.rowDivider]}>
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{record.batchName}</Text>
              <Text style={styles.rowDetail}>{formatDate(record.scheduledStart, timeZone)}</Text>
            </View>
            <Text style={[styles.statusBadge, attendanceStatusStyles[record.status]]}>
              {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  function renderProgress() {
    if (!progress.length)
      return (
        <EmptyState
          title="No shared progress yet"
          detail="Coach-shared assessments and notes will appear here."
        />
      );
    return (
      <View style={styles.listCard}>
        {progress.map((entry, index) => (
          <View key={entry.id} style={[styles.progressEntry, index > 0 && styles.rowDivider]}>
            <Text style={styles.rowTitle}>
              {entry.sportName} · {entry.assessmentName}
              {entry.value ? ` · ${entry.value}` : ""}
            </Text>
            <Text style={styles.rowDetail}>
              {entry.batchName} · {formatDate(entry.createdAt, timeZone)} · {entry.coachName}
            </Text>
            {entry.coachNote ? <Text style={styles.noticeBody}>{entry.coachNote}</Text> : null}
          </View>
        ))}
      </View>
    );
  }

  function renderPayments() {
    if (!finance?.charges.length)
      return (
        <EmptyState
          title="No invoices yet"
          detail="When the academy adds a fee, its balance and payment history will show here."
        />
      );
    return (
      <>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Outstanding balance</Text>
          <Text style={styles.balanceAmount}>{formatCurrency(dueTotal, finance.currency)}</Text>
          <Text style={styles.balanceNote}>Payment records are managed by the academy.</Text>
        </View>
        <View style={styles.listCard}>
          {finance.charges.map((charge, index) => (
            <View key={charge.id} style={[styles.chargeRow, index > 0 && styles.rowDivider]}>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{charge.description}</Text>
                <Text style={styles.rowDetail}>
                  {charge.invoiceNumber} · Due {charge.dueDate}
                </Text>
                <Text style={styles.amountLine}>
                  {charge.payments.length
                    ? `${formatCurrency(charge.amountPaise - charge.balancePaise, finance.currency)} paid`
                    : "No payments recorded"}
                  {charge.balancePaise > 0
                    ? ` · ${formatCurrency(charge.balancePaise, finance.currency)} due`
                    : ""}
                </Text>
                {charge.payments.flatMap((payment) => [
                  <Text key={payment.id} style={styles.receiptLine}>
                    Receipt {payment.receiptNumber} ·{" "}
                    {formatCurrency(payment.amountPaise, finance.currency)} ·{" "}
                    {formatDate(payment.receivedAt, timeZone)}
                  </Text>,
                  ...payment.refunds.map((refund) => (
                    <Text key={refund.id} style={styles.receiptLine}>
                      Refund · {formatCurrency(refund.amountPaise, finance.currency)} ·{" "}
                      {refund.reason}
                    </Text>
                  )),
                ])}
              </View>
              <Text
                style={[
                  styles.statusBadge,
                  charge.balancePaise === 0 ? styles.paidBadge : styles.dueBadge,
                ]}
              >
                {charge.status === "voided"
                  ? "Voided"
                  : charge.amountPaise === charge.discountPaise
                    ? "Waived"
                    : charge.balancePaise === 0
                      ? "Paid"
                      : "Due"}
              </Text>
            </View>
          ))}
        </View>
      </>
    );
  }

  function renderContent() {
    if (loading) return <ActivityIndicator style={styles.loader} color={colors.brand} />;
    if (error && !selected) {
      return (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      );
    }
    if (tab === "announcements") {
      return (
        <>
          {announcementError ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {announcementError}
            </Text>
          ) : null}
          {renderAnnouncements()}
        </>
      );
    }
    if (!selected) {
      return (
        <EmptyState
          title="No linked children yet"
          detail="Contact the academy administrator to connect your parent account to a student."
        />
      );
    }
    if (detailLoading) return <ActivityIndicator style={styles.loader} color={colors.brand} />;
    if (tab === "profile") {
      return (
        <>
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {auth.user.displayName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.profileName}>{auth.user.displayName}</Text>
            <Text style={styles.profileEmail}>{auth.user.email}</Text>
          </View>
          <SectionTitle>Linked students</SectionTitle>
          <View style={styles.listCard}>
            {students.map((student, index) => (
              <Pressable
                key={student.id}
                accessibilityRole="button"
                onPress={() => {
                  setSelectedId(student.id);
                  setTab("home");
                }}
                style={[styles.profileStudent, index > 0 && styles.rowDivider]}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>
                    {student.firstName} {student.lastName}
                  </Text>
                  <Text style={styles.rowDetail}>
                    {student.batchNames.length ? student.batchNames.join(" · ") : "No active batch"}
                  </Text>
                </View>
                <Text style={styles.rowDetail}>
                  {student.id === selectedId ? "Selected" : "View"}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="button" onPress={onLogout} style={styles.logoutButton}>
            <Text style={styles.logoutLabel}>Sign out</Text>
          </Pressable>
        </>
      );
    }
    if (tab === "schedule") {
      return (
        <>
          <SectionTitle>Weekly schedule</SectionTitle>
          <ScheduleList schedules={studentSchedules} />
        </>
      );
    }
    if (tab === "attendance") {
      return (
        <>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>
                {attendanceRate === null ? "—" : `${attendanceRate}%`}
              </Text>
              <Text style={styles.summaryLabel}>Attendance</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{presentCount}</Text>
              <Text style={styles.summaryLabel}>Sessions attended</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>
                {attendance.filter((record) => record.status === "absent").length}
              </Text>
              <Text style={styles.summaryLabel}>Missed</Text>
            </View>
          </View>
          <SectionTitle trailing={`${attendance.length} sessions`}>Session history</SectionTitle>
          {renderAttendanceRows(attendance)}
        </>
      );
    }
    if (tab === "progress")
      return (
        <>
          <SectionTitle trailing={`${progress.length} shared`}>
            Coach assessments and notes
          </SectionTitle>
          {renderProgress()}
        </>
      );
    if (tab === "payments") return renderPayments();

    return (
      <>
        <View style={styles.studentCard}>
          <Text style={styles.eyebrow}>SELECTED STUDENT</Text>
          <Text style={styles.studentName}>
            {selected.firstName} {selected.lastName}
          </Text>
          <Text style={styles.studentDetail}>
            {selected.batchNames.length ? selected.batchNames.join(" · ") : "No active batch"}
          </Text>
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
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
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
        </View>
        <SectionTitle
          trailing={attendanceRate === null ? undefined : `${attendanceRate}% attendance`}
        >
          Progress
        </SectionTitle>
        <Pressable
          accessibilityRole="button"
          onPress={() => setTab("attendance")}
          style={styles.progressCard}
        >
          <View style={styles.progressTopline}>
            <Text style={styles.progressTitle}>Attendance</Text>
            <Text style={styles.linkLabel}>View history</Text>
          </View>
          <Text style={styles.progressValue}>
            {attendanceRate === null
              ? "No sessions recorded"
              : `${presentCount} of ${attendance.length} sessions attended`}
          </Text>
          {attendanceRate !== null ? (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${attendanceRate}%` }]} />
            </View>
          ) : null}
        </Pressable>
        <SectionTitle trailing={`${Math.min(studentSchedules.length, 3)} shown`}>
          This week
        </SectionTitle>
        <ScheduleList schedules={studentSchedules.slice(0, 3)} />
        <View style={styles.homeQuickRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setTab("payments")}
            style={styles.quickCard}
          >
            <Text style={styles.quickLabel}>Outstanding fees</Text>
            <Text style={styles.quickValue}>
              {finance ? formatCurrency(dueTotal, finance.currency) : "—"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setTab("announcements")}
            style={styles.quickCard}
          >
            <Text style={styles.quickLabel}>Academy notices</Text>
            <Text style={styles.quickValue}>
              {unreadCount ? `${unreadCount} unread` : "All caught up"}
            </Text>
          </Pressable>
        </View>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </>
    );
  }

  const title =
    tab === "home"
      ? "Your family"
      : tab === "announcements"
        ? "Announcements"
        : tab === "attendance"
          ? "Attendance"
          : tab === "progress"
            ? "Progress"
            : tab === "payments"
              ? "Payments"
              : tab === "profile"
                ? "Profile"
                : "Schedule";

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerIdentity}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>S</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.brand}>SportDesk</Text>
            <Text numberOfLines={1} style={styles.academy}>
              {auth.user.academyName}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Announcements${unreadCount ? `, ${unreadCount} unread` : ""}`}
          onPress={() => setTab(tab === "announcements" ? "home" : "announcements")}
          style={[styles.noticeButton, tab === "announcements" && styles.noticeButtonActive]}
        >
          <Text style={[styles.noticeIcon, tab === "announcements" && styles.noticeIconActive]}>
            ♧
          </Text>
          {unreadCount > 0 ? <View style={styles.noticeDot} /> : null}
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.pageHeading}>
          <View style={styles.headingCopy}>
            <Text style={styles.pageTitle}>{title}</Text>
            <Text style={styles.pageSubtitle}>
              {tab === "profile"
                ? "Your parent account and linked students."
                : selected
                  ? `${selected.firstName} ${selected.lastName} · ${auth.user.academyName}`
                  : auth.user.academyName}
            </Text>
          </View>
          {tab === "home" && selected ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setTab("profile")}
              style={styles.avatarSmall}
            >
              <Text style={styles.avatarSmallText}>
                {selected.firstName.slice(0, 1).toUpperCase()}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {renderContent()}
      </ScrollView>
      <View style={styles.bottomNav}>
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(item.id)}
              style={styles.tabButton}
            >
              <View style={[styles.tabIconWrap, active && styles.tabIconWrapActive]}>
                <Text style={[styles.tabIcon, active && styles.tabIconActive]}>{item.icon}</Text>
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text>
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
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerIdentity: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  brandMarkText: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  headerText: { flex: 1 },
  brand: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  academy: { marginTop: 2, color: colors.muted, fontSize: 12 },
  noticeButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.subtle,
  },
  noticeButtonActive: { backgroundColor: colors.brandSoft },
  noticeIcon: { color: colors.text, fontSize: 22 },
  noticeIconActive: { color: colors.brand },
  noticeDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
    top: 8,
    right: 8,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 },
  pageHeading: {
    marginBottom: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headingCopy: { flex: 1 },
  pageTitle: {
    color: colors.ink,
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  pageSubtitle: { marginTop: 5, color: colors.muted, fontSize: 13, lineHeight: 19 },
  avatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSmallText: { color: colors.brand, fontSize: 16, fontWeight: "700" },
  eyebrow: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  studentCard: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  studentName: { marginTop: 8, color: colors.ink, fontSize: 20, fontWeight: "700" },
  studentDetail: { marginTop: 4, color: colors.text, fontSize: 13, lineHeight: 19 },
  childSelector: { flexDirection: "row", gap: 8, paddingTop: 14 },
  childPill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  childPillActive: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  childPillText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  childPillTextActive: { color: colors.brand },
  sectionHeading: {
    marginTop: 24,
    marginBottom: 11,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  sectionTrailing: { color: colors.brand, fontSize: 12, fontWeight: "600" },
  progressCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  progressTopline: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressTitle: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  linkLabel: { color: colors.brand, fontSize: 12, fontWeight: "600" },
  progressValue: { marginTop: 10, color: colors.text, fontSize: 13 },
  progressTrack: {
    height: 7,
    marginTop: 13,
    overflow: "hidden",
    borderRadius: 4,
    backgroundColor: colors.subtle,
  },
  progressFill: { height: 7, borderRadius: 4, backgroundColor: colors.brand },
  listCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  scheduleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  dayBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  dayBadgeDay: { color: colors.brand, fontSize: 11, fontWeight: "700" },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowMain: { flex: 1 },
  rowTitle: { color: colors.ink, fontSize: 14, lineHeight: 19, fontWeight: "600" },
  rowDetail: { marginTop: 4, color: colors.muted, fontSize: 12, lineHeight: 17 },
  homeQuickRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  quickCard: {
    flex: 1,
    minHeight: 86,
    justifyContent: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  quickLabel: { color: colors.muted, fontSize: 12 },
  quickValue: { marginTop: 7, color: colors.ink, fontSize: 15, fontWeight: "700" },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 2 },
  summaryCard: {
    flex: 1,
    minHeight: 86,
    justifyContent: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  summaryValue: { color: colors.ink, fontSize: 20, fontWeight: "700" },
  summaryLabel: { marginTop: 5, color: colors.muted, fontSize: 11, lineHeight: 15 },
  attendanceRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  progressEntry: { paddingVertical: 15, paddingHorizontal: 16 },
  statusBadge: {
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    color: colors.text,
    backgroundColor: colors.subtle,
    fontSize: 11,
    fontWeight: "600",
  },
  status_present: { color: colors.success, backgroundColor: colors.successSoft },
  status_late: { color: colors.warning, backgroundColor: colors.warningSoft },
  status_absent: { color: colors.danger, backgroundColor: colors.dangerSoft },
  status_excused: { color: colors.text, backgroundColor: colors.subtle },
  balanceCard: { marginBottom: 12, padding: 18, borderRadius: 16, backgroundColor: colors.ink },
  balanceLabel: { color: "#D1D5DB", fontSize: 12 },
  balanceAmount: { marginTop: 7, color: "#FFFFFF", fontSize: 27, fontWeight: "700" },
  balanceNote: { marginTop: 7, color: "#D1D5DB", fontSize: 12, lineHeight: 17 },
  chargeRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 15 },
  amountLine: { marginTop: 7, color: colors.text, fontSize: 12, fontWeight: "600" },
  receiptLine: { marginTop: 5, color: colors.muted, fontSize: 11, lineHeight: 16 },
  paidBadge: { color: colors.success, backgroundColor: colors.successSoft },
  dueBadge: { color: colors.warning, backgroundColor: colors.warningSoft },
  noticeCard: {
    marginBottom: 10,
    padding: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  noticeTopline: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  noticeTitle: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: "700" },
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
  noticeBody: { marginTop: 10, color: colors.text, fontSize: 13, lineHeight: 20 },
  textButton: { alignSelf: "flex-start", marginTop: 10, paddingVertical: 5 },
  textButtonLabel: { color: colors.brand, fontSize: 13, fontWeight: "600" },
  emptyState: {
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyTitle: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  emptyDetail: { marginTop: 5, color: colors.muted, fontSize: 13, lineHeight: 19 },
  profileCard: {
    alignItems: "center",
    padding: 22,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.brand, fontSize: 24, fontWeight: "700" },
  profileName: { marginTop: 12, color: colors.ink, fontSize: 18, fontWeight: "700" },
  profileEmail: { marginTop: 4, color: colors.muted, fontSize: 13 },
  profileStudent: { flexDirection: "row", alignItems: "center", paddingVertical: 15, gap: 10 },
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
  error: { marginBottom: 14, color: colors.danger, fontSize: 13, lineHeight: 19 },
  loader: { marginTop: 48 },
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
  tabButton: {
    minWidth: 60,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 2,
  },
  tabIconWrap: {
    width: 38,
    height: 27,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tabIconWrapActive: { backgroundColor: colors.brandSoft },
  tabIcon: { color: colors.muted, fontSize: 18, lineHeight: 21, fontWeight: "600" },
  tabIconActive: { color: colors.brand },
  tabLabel: { color: colors.muted, fontSize: 10, fontWeight: "500" },
  tabLabelActive: { color: colors.brand, fontWeight: "700" },
} as const);

const attendanceStatusStyles = {
  present: styles.status_present,
  late: styles.status_late,
  absent: styles.status_absent,
  excused: styles.status_excused,
};

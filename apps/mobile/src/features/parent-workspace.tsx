import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ChangePasswordRequestSchema,
  ParentAnnouncementListSchema,
  ParentAttendanceSchema,
  ParentProfileSchema,
  ParentScheduleSchema,
  ParentStudentFinanceSchema,
  ParentStudentSchema,
  ProgressEntrySchema,
  UpdatedRecordSchema,
  UpdateParentProfileRequestSchema,
  type AuthData,
  type ParentAnnouncement,
  type ParentAttendance,
  type ParentSchedule,
  type ParentStudent,
  type ParentStudentFinance,
  type ProgressEntry,
} from "@sportdesk/contracts";
import { z } from "zod";
import { requestMobileData } from "@/lib/api";
import { WorkspaceIcon, type WorkspaceIconName } from "@/components/workspace-icon";

const palette = {
  ink: "#172C29",
  text: "#4D625D",
  muted: "#7B8B86",
  canvas: "#F5F7F4",
  card: "#FFFFFF",
  line: "#E5EBE6",
  forest: "#14584B",
  forestDark: "#103F37",
  mint: "#E5F2EB",
  mintDeep: "#CFE7D9",
  sunny: "#F7D985",
  sunnySoft: "#FBF4DE",
  coral: "#D16C55",
  coralSoft: "#F9E9E3",
  blue: "#5887A1",
  blueSoft: "#E8F0F4",
  white: "#FFFFFF",
};

const navItems = [
  { id: "home", label: "Today" },
  { id: "schedule", label: "Schedule" },
  { id: "attendance", label: "Attendance" },
  { id: "progress", label: "Progress" },
  { id: "payments", label: "Fees" },
  { id: "profile", label: "Account" },
] as const;
type Tab = (typeof navItems)[number]["id"] | "announcements";
type DetailKey = "schedule" | "attendance" | "progress" | "payments";
type AccountPage = "overview" | "personal" | "children" | "security";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function money(amountPaise: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountPaise / 100);
}

function academyDate(value: string, timeZone: string, options: Intl.DateTimeFormatOptions) {
  return new Date(value).toLocaleDateString("en-IN", { timeZone, ...options });
}

function formatTime(time: string) {
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "pm" : "am";
  return `${hour % 12 || 12}:${minuteText} ${suffix}`;
}

function SectionHeading({
  title,
  detail,
  onPress,
}: {
  title: string;
  detail?: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {detail ? (
        onPress ? (
          <Pressable accessibilityRole="button" onPress={onPress}>
            <Text style={styles.sectionAction}>{detail}</Text>
          </Pressable>
        ) : (
          <Text style={styles.sectionDetail}>{detail}</Text>
        )
      ) : null}
    </View>
  );
}

function BellIcon({ active, animated }: { active: boolean; animated: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(1800),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [animated, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  return (
    <Animated.View style={[styles.bell, { transform: [{ scale }] }]}>
      <View style={[styles.bellDome, active && styles.bellDomeActive]} />
      <View style={[styles.bellClapper, active && styles.bellClapperActive]} />
      <View style={[styles.bellLip, active && styles.bellLipActive]} />
    </Animated.View>
  );
}

function SettingsRow({
  title,
  detail,
  onPress,
}: {
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.settingsRow}>
      <View style={styles.rowMain}>
        <Text style={styles.settingsRowTitle}>{title}</Text>
        <Text style={styles.settingsRowDetail}>{detail}</Text>
      </View>
      <Text style={styles.settingsChevron}>›</Text>
    </Pressable>
  );
}

function ChildAvatar({ size }: { size: number }) {
  const outline = Math.max(1.5, size * 0.055);
  return (
    <View
      style={[
        styles.avatarArt,
        { width: size, height: size, borderRadius: size / 2, borderWidth: outline },
      ]}
    >
      <View style={[styles.avatarCoral, { width: size * 0.44 }]} />
      <View
        style={[
          styles.avatarHead,
          {
            top: size * 0.22,
            width: size * 0.34,
            height: size * 0.34,
            borderRadius: size * 0.18,
            borderWidth: outline,
          },
        ]}
      />
      <View
        style={[
          styles.avatarShoulders,
          {
            bottom: -size * 0.035,
            width: size * 0.67,
            height: size * 0.39,
            borderTopLeftRadius: size * 0.38,
            borderTopRightRadius: size * 0.38,
            borderWidth: outline,
          },
        ]}
      />
    </View>
  );
}

function TabIcon({ id, active }: { id: (typeof navItems)[number]["id"]; active: boolean }) {
  const color = active ? palette.forest : palette.muted;
  const iconByTab: Record<(typeof navItems)[number]["id"], WorkspaceIconName> = {
    home: "home",
    schedule: "calendar",
    attendance: "attendance",
    progress: "progress",
    payments: "wallet",
    profile: "profile",
  };
  return <WorkspaceIcon name={iconByTab[id]} color={color} size={20} />;
}

function EmptyState({ symbol, title, detail }: { symbol: string; title: string; detail: string }) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptySymbolWrap}>
        <Text style={styles.emptySymbol}>{symbol}</Text>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </View>
  );
}

function ScheduleCard({ schedule, today }: { schedule: ParentSchedule; today?: boolean }) {
  const day = weekdays[schedule.dayOfWeek] ?? "Class day";
  return (
    <View style={[styles.scheduleCard, today && styles.scheduleCardToday]}>
      <View style={[styles.scheduleDay, today && styles.scheduleDayToday]}>
        <Text style={[styles.scheduleDayName, today && styles.scheduleDayNameToday]}>
          {day.slice(0, 3)}
        </Text>
        {today ? <View style={styles.todayDot} /> : null}
      </View>
      <View style={styles.scheduleInfo}>
        <Text style={styles.scheduleBatch}>{schedule.batchName}</Text>
        <Text style={styles.scheduleMeta}>
          {formatTime(schedule.startTime)} – {formatTime(schedule.endTime)}
        </Text>
        {schedule.branchName || schedule.venue ? (
          <Text style={styles.scheduleLocation}>
            {[schedule.branchName, schedule.venue].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
      </View>
      {today ? <Text style={styles.todayLabel}>TODAY</Text> : null}
    </View>
  );
}

function AttendanceRows({ records, timeZone }: { records: ParentAttendance[]; timeZone: string }) {
  if (!records.length) {
    return (
      <EmptyState
        symbol="✓"
        title="The first class is ahead"
        detail="Attendance will show here after the coach records a session."
      />
    );
  }
  return (
    <View style={styles.listCard}>
      {records.map((record, index) => (
        <View key={record.id} style={[styles.attendanceRow, index > 0 && styles.rowDivider]}>
          <View
            style={[
              styles.attendanceMark,
              record.status === "absent" && styles.attendanceMarkAbsent,
              record.status === "late" && styles.attendanceMarkLate,
              record.status === "excused" && styles.attendanceMarkExcused,
            ]}
          >
            <Text style={styles.attendanceMarkText}>
              {record.status === "absent" ? "–" : record.status === "excused" ? "·" : "✓"}
            </Text>
          </View>
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle}>{record.batchName}</Text>
            <Text style={styles.rowDetail}>
              {academyDate(record.scheduledStart, timeZone, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </Text>
          </View>
          <Text
            style={[
              styles.attendanceStatus,
              record.status === "absent" && styles.attendanceAbsent,
              record.status === "late" && styles.attendanceLate,
            ]}
          >
            {record.status === "present"
              ? "Attended"
              : record.status.charAt(0).toUpperCase() + record.status.slice(1)}
          </Text>
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
  const [accountPage, setAccountPage] = useState<AccountPage>("overview");
  const [attendanceChartWidth, setAttendanceChartWidth] = useState(0);
  const [selectedAttendanceWeek, setSelectedAttendanceWeek] = useState<number | null>(null);
  const [schedules, setSchedules] = useState<ParentSchedule[]>([]);
  const [attendance, setAttendance] = useState<ParentAttendance[]>([]);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [finance, setFinance] = useState<ParentStudentFinance | null>(null);
  const [announcements, setAnnouncements] = useState<ParentAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [announcementLoading, setAnnouncementLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState<Record<DetailKey, boolean>>({
    schedule: true,
    attendance: true,
    progress: true,
    payments: true,
  });
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [profileName, setProfileName] = useState(auth.user.displayName);
  const [registeredPhone, setRegisteredPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedAttendanceWeek(null);
  }, [selectedId]);

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
          setError(caught instanceof Error ? caught.message : "Could not load your account.");
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
    setAnnouncementLoading(true);
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
          setSectionErrors((previous) => ({
            ...previous,
            announcements: caught instanceof Error ? caught.message : "Could not load notices.",
          }));
      })
      .finally(() => {
        if (active) setAnnouncementLoading(false);
      });
    return () => {
      active = false;
    };
  }, [auth, onAuthUpdate]);

  useEffect(() => {
    let active = true;
    setProfileLoading(true);
    requestMobileData(
      "/parent/me/profile",
      (value) => ParentProfileSchema.parse(value),
      auth,
      onAuthUpdate,
    )
      .then((profile) => {
        if (active) {
          setProfileName(profile.displayName);
          setRegisteredPhone(profile.phone ?? "");
        }
      })
      .catch((caught: unknown) => {
        if (active)
          setSectionErrors((previous) => ({
            ...previous,
            profile: caught instanceof Error ? caught.message : "Could not load your details.",
          }));
      })
      .finally(() => {
        if (active) setProfileLoading(false);
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
      setSectionLoading({ schedule: false, attendance: false, progress: false, payments: false });
      setSectionErrors((previous) => ({
        ...previous,
        schedule: "",
        attendance: "",
        progress: "",
        payments: "",
      }));
      return;
    }
    let active = true;
    setSchedules([]);
    setAttendance([]);
    setProgress([]);
    setFinance(null);
    setSectionLoading({ schedule: true, attendance: true, progress: true, payments: true });
    setSectionErrors((previous) => ({
      ...previous,
      schedule: "",
      attendance: "",
      progress: "",
      payments: "",
    }));

    const load = <T,>(
      key: DetailKey,
      path: string,
      parse: (value: unknown) => T,
      read: (value: T) => void,
    ) => {
      void requestMobileData(path, parse, auth, onAuthUpdate)
        .then((result) => {
          if (active) read(result);
        })
        .catch((caught: unknown) => {
          if (active)
            setSectionErrors((previous) => ({
              ...previous,
              [key]: caught instanceof Error ? caught.message : "Could not load this section.",
            }));
        })
        .finally(() => {
          if (active) setSectionLoading((previous) => ({ ...previous, [key]: false }));
        });
    };

    load(
      "schedule",
      `/parent/students/${selectedId}/schedule`,
      (value) => z.object({ schedules: ParentScheduleSchema.array() }).parse(value),
      (value) => setSchedules(value.schedules),
    );
    load(
      "attendance",
      `/parent/students/${selectedId}/attendance`,
      (value) => z.object({ records: ParentAttendanceSchema.array() }).parse(value),
      (value) => setAttendance(value.records),
    );
    load(
      "payments",
      `/parent/students/${selectedId}/finance`,
      (value) => ParentStudentFinanceSchema.parse(value),
      (value) => setFinance(value),
    );
    load(
      "progress",
      `/parent/students/${selectedId}/progress`,
      (value) => z.object({ entries: ProgressEntrySchema.array() }).parse(value),
      (value) => setProgress(value.entries),
    );

    return () => {
      active = false;
    };
  }, [auth, onAuthUpdate, selectedId]);

  const selected = students.find((student) => student.id === selectedId) ?? null;
  const todayIndex = weekdays.indexOf(
    new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(new Date()),
  );
  const academyClock = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  const [academyHour = "0", academyMinute = "0"] = academyClock.split(":");
  const academyMinutes = Number(academyHour) * 60 + Number(academyMinute);
  const sortedSchedules = useMemo(
    () =>
      [...schedules].sort((a, b) => {
        const offset = (schedule: ParentSchedule) => {
          const dayOffset = (schedule.dayOfWeek - todayIndex + 7) % 7;
          const [hour = "0", minute = "0"] = schedule.startTime.split(":");
          return dayOffset === 0 && Number(hour) * 60 + Number(minute) < academyMinutes
            ? 7
            : dayOffset;
        };
        return offset(a) - offset(b) || a.startTime.localeCompare(b.startTime);
      }),
    [academyMinutes, schedules, todayIndex],
  );
  const attendedCount = attendance.filter(
    (record) => record.status === "present" || record.status === "late",
  ).length;
  const absentCount = attendance.filter((record) => record.status === "absent").length;
  const excusedCount = attendance.filter((record) => record.status === "excused").length;
  const eligibleAttendanceCount = attendance.length - excusedCount;
  const attendanceRate = eligibleAttendanceCount
    ? Math.round((attendedCount / eligibleAttendanceCount) * 100)
    : null;
  const dueTotal = finance?.charges.reduce((total, charge) => total + charge.balancePaise, 0) ?? 0;
  const unreadCount = announcements.filter((item) => !item.readAt).length;
  const childName = (selected?.firstName ?? profileName.split(" ")[0]) || "there";
  const attendanceWeeks = useMemo(() => {
    const weeks = Array.from({ length: 4 }, () => ({ attended: 0, missed: 0, excused: 0 }));
    const now = Date.now();
    for (const record of attendance) {
      const age = Math.floor((now - new Date(record.scheduledStart).getTime()) / 86_400_000);
      if (age < 0 || age >= 28) continue;
      const weekIndex = 3 - Math.floor(age / 7);
      const week = weeks[weekIndex];
      if (!week) continue;
      if (record.status === "present" || record.status === "late") week.attended += 1;
      if (record.status === "absent") week.missed += 1;
      if (record.status === "excused") week.excused += 1;
    }
    return weeks;
  }, [attendance]);
  const hasRecentAttendance = attendanceWeeks.some((week) => week.attended + week.missed > 0);
  const recentAttendanceTotals = attendanceWeeks.map((week) => ({
    attended: week.attended,
    eligible: week.attended + week.missed,
  }));
  const earlyWindow = recentAttendanceTotals.slice(0, 2).reduce(
    (total, week) => ({
      attended: total.attended + week.attended,
      eligible: total.eligible + week.eligible,
    }),
    { attended: 0, eligible: 0 },
  );
  const recentWindow = recentAttendanceTotals.slice(2).reduce(
    (total, week) => ({
      attended: total.attended + week.attended,
      eligible: total.eligible + week.eligible,
    }),
    { attended: 0, eligible: 0 },
  );
  const recentFourWeekCount = recentAttendanceTotals.reduce(
    (total, week) => total + week.eligible,
    0,
  );
  const recentFourWeekRate = recentFourWeekCount
    ? Math.round(
        (recentAttendanceTotals.reduce((total, week) => total + week.attended, 0) /
          recentFourWeekCount) *
          100,
      )
    : null;
  const attendanceInsight = !hasRecentAttendance
    ? attendance.length
      ? `No attendance recorded in the last 4 weeks. ${attendance.length} earlier ${attendance.length === 1 ? "session is" : "sessions are"} in the history below.`
      : "No attendance has been recorded yet. Once sessions are marked, this will show how regularly classes are attended."
    : earlyWindow.eligible && recentWindow.eligible
      ? (() => {
          const earlyRate = (earlyWindow.attended / earlyWindow.eligible) * 100;
          const recentRate = (recentWindow.attended / recentWindow.eligible) * 100;
          const change = Math.round(recentRate - earlyRate);
          const comparison =
            change > 0
              ? `up ${change} percentage points`
              : change < 0
                ? `down ${Math.abs(change)} percentage points`
                : "holding steady";
          return `Attendance is ${comparison} in the last 2 weeks (${recentWindow.attended}/${recentWindow.eligible} sessions), compared with the 2 weeks before.`;
        })()
      : `${recentFourWeekRate}% attendance across ${recentFourWeekCount} marked sessions in the last 4 weeks. More sessions will make the trend clearer.`;

  async function markAnnouncementRead(item: ParentAnnouncement) {
    setSectionErrors((previous) => ({ ...previous, announcements: "" }));
    try {
      await requestMobileData(
        `/parent/announcements/${item.id}/read`,
        (value) => UpdatedRecordSchema.parse(value),
        auth,
        onAuthUpdate,
        { method: "POST" },
      );
      setAnnouncements((items) =>
        items.map((current) =>
          current.id === item.id ? { ...current, readAt: new Date().toISOString() } : current,
        ),
      );
    } catch (caught) {
      setSectionErrors((previous) => ({
        ...previous,
        announcements: caught instanceof Error ? caught.message : "Could not update this notice.",
      }));
    }
  }

  async function saveParentProfile() {
    setSaving(true);
    setFormMessage(null);
    try {
      const input = UpdateParentProfileRequestSchema.parse({
        displayName: profileName,
      });
      await requestMobileData(
        "/parent/me/profile",
        (value) => UpdatedRecordSchema.parse(value),
        auth,
        onAuthUpdate,
        {
          method: "PATCH",
          body: JSON.stringify(input),
        },
      );
      onAuthUpdate({ ...auth, user: { ...auth.user, displayName: input.displayName } });
      setFormMessage("Your details are up to date.");
    } catch (caught) {
      setFormMessage(caught instanceof Error ? caught.message : "Could not update your details.");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    setSaving(true);
    setFormMessage(null);
    try {
      const input = ChangePasswordRequestSchema.parse({ currentPassword, newPassword });
      await requestMobileData(
        "/auth/password/change",
        (value) => UpdatedRecordSchema.parse(value),
        auth,
        onAuthUpdate,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      );
      setCurrentPassword("");
      setNewPassword("");
      onLogout();
    } catch (caught) {
      setFormMessage(caught instanceof Error ? caught.message : "Could not change your password.");
    } finally {
      setSaving(false);
    }
  }

  function renderNotices() {
    if (announcementLoading)
      return <ActivityIndicator style={styles.loader} color={palette.forest} />;
    if (!announcements.length) {
      return (
        <EmptyState
          symbol="✳"
          title="All caught up"
          detail="Academy updates will appear here when there’s something to share."
        />
      );
    }
    return announcements.map((item) => (
      <View key={item.id} style={styles.noticeCard}>
        <View style={styles.noticeTop}>
          <View style={styles.noticeMark}>
            <Text style={styles.noticeMarkText}>✳</Text>
          </View>
          <View style={styles.rowMain}>
            <Text style={styles.noticeTitle}>{item.title}</Text>
            <Text style={styles.rowDetail}>
              {item.batchName ?? auth.user.academyName} ·{" "}
              {academyDate(item.publishedAt, timeZone, { day: "numeric", month: "short" })}
            </Text>
          </View>
          {!item.readAt ? <View style={styles.unreadPip} /> : null}
        </View>
        <Text style={styles.noticeBody}>{item.body}</Text>
        {!item.readAt ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void markAnnouncementRead(item)}
            style={styles.textAction}
          >
            <Text style={styles.textActionLabel}>Mark as read</Text>
          </Pressable>
        ) : null}
      </View>
    ));
  }

  function renderHome() {
    if (!selected) {
      return (
        <EmptyState
          symbol="⌂"
          title="Your child’s academy life, at a glance"
          detail="When the academy connects your account, their schedule, attendance and progress will appear here."
        />
      );
    }
    return (
      <>
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeDecorOne} />
          <View style={styles.welcomeDecorTwo} />
          <Text style={styles.welcomeKicker}>A LITTLE UPDATE FROM THE ACADEMY</Text>
          <Text style={styles.welcomeTitle}>
            {childName} is growing{"\n"}stronger every week.
          </Text>
          <Text style={styles.welcomeCaption}>
            Here’s what’s happening at {auth.user.academyName}.
          </Text>
          {students.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.childChips}
            >
              {students.map((student) => {
                const active = student.id === selectedId;
                return (
                  <Pressable
                    key={student.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setSelectedId(student.id)}
                    style={[styles.childChip, active && styles.childChipActive]}
                  >
                    <Text style={[styles.childChipText, active && styles.childChipTextActive]}>
                      {student.firstName}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </View>

        <SectionHeading
          title="A good rhythm"
          detail="Attendance"
          onPress={() => setTab("attendance")}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => setTab("attendance")}
          style={styles.attendanceHomeCard}
        >
          <View style={styles.attendanceHomeTop}>
            <View style={styles.attendanceRing}>
              <Text style={styles.attendanceRingValue}>
                {attendanceRate === null ? "—" : `${attendanceRate}%`}
              </Text>
            </View>
            <View style={styles.attendanceHomeCopy}>
              <Text style={styles.homeCardTitle}>
                {attendanceRate === null
                  ? "Ready when class begins"
                  : attendanceRate >= 85
                    ? "Showing up strong"
                    : "Building a steady habit"}
              </Text>
              <Text style={styles.homeCardDetail}>
                {attendanceRate === null
                  ? "No sessions recorded yet"
                  : `${attendedCount} of ${attendance.length} sessions attended`}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
          <View style={styles.attendanceBreakdown}>
            <Text style={styles.breakdownGood}>{attendedCount} attended</Text>
            <Text style={styles.breakdownDivider}>·</Text>
            <Text style={styles.breakdownQuiet}>{absentCount} missed</Text>
            {excusedCount ? (
              <>
                <Text style={styles.breakdownDivider}>·</Text>
                <Text style={styles.breakdownQuiet}>{excusedCount} excused</Text>
              </>
            ) : null}
          </View>
        </Pressable>

        <SectionHeading
          title="Next on the mat"
          detail="Full schedule"
          onPress={() => setTab("schedule")}
        />
        {sectionLoading.schedule ? (
          <ActivityIndicator style={styles.inlineLoader} color={palette.forest} />
        ) : sortedSchedules.length ? (
          <View style={styles.cardStack}>
            {sortedSchedules.slice(0, 2).map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                today={schedule.dayOfWeek === todayIndex}
              />
            ))}
          </View>
        ) : (
          <EmptyState
            symbol="▦"
            title="No sessions on the calendar yet"
            detail="The academy will add a weekly schedule here."
          />
        )}

        <SectionHeading
          title="A note from the academy"
          detail={unreadCount ? `${unreadCount} new` : "See all"}
          onPress={() => setTab("announcements")}
        />
        {announcementLoading ? (
          <ActivityIndicator style={styles.inlineLoader} color={palette.forest} />
        ) : announcements[0] ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setTab("announcements")}
            style={styles.latestNotice}
          >
            <View style={styles.noticeMark}>
              <Text style={styles.noticeMarkText}>✳</Text>
            </View>
            <View style={styles.rowMain}>
              <Text style={styles.latestNoticeTitle}>{announcements[0].title}</Text>
              <Text numberOfLines={2} style={styles.latestNoticeBody}>
                {announcements[0].body}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ) : (
          <View style={styles.quietNotice}>
            <Text style={styles.quietNoticeText}>No new notes. We’ll keep you posted.</Text>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => setTab("payments")}
          style={styles.feeShortcut}
        >
          <View>
            <Text style={styles.feeShortcutLabel}>Academy fees</Text>
            <Text style={styles.feeShortcutValue}>
              {finance ? money(dueTotal, finance.currency) : "View statements and receipts"}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </>
    );
  }

  function renderSchedule() {
    if (sectionLoading.schedule)
      return <ActivityIndicator style={styles.loader} color={palette.forest} />;
    if (sectionErrors.schedule)
      return (
        <Text accessibilityRole="alert" style={styles.error}>
          {sectionErrors.schedule}
        </Text>
      );
    if (!sortedSchedules.length)
      return (
        <EmptyState
          symbol="▦"
          title="No weekly schedule yet"
          detail="As soon as the academy adds class times, you’ll find them here."
        />
      );

    return (
      <>
        <View style={styles.pageIntroCard}>
          <Text style={styles.pageIntroEyebrow}>{childName.toUpperCase()}’S WEEK</Text>
          <Text style={styles.pageIntroTitle}>A simple plan for the week.</Text>
          <Text style={styles.pageIntroBody}>
            Class times are shown in {auth.user.academyTimezone ?? "your academy’s local time"}.
          </Text>
        </View>
        <View style={styles.weekPlan}>
          {sortedSchedules.map((schedule) => (
            <View key={schedule.id}>
              <View style={styles.dayHeadingRow}>
                <Text
                  style={[
                    styles.dayHeading,
                    schedule.dayOfWeek === todayIndex && styles.dayHeadingToday,
                  ]}
                >
                  {weekdays[schedule.dayOfWeek]}
                </Text>
                {schedule.dayOfWeek === todayIndex ? (
                  <Text style={styles.todayPill}>TODAY</Text>
                ) : null}
              </View>
              <ScheduleCard schedule={schedule} today={schedule.dayOfWeek === todayIndex} />
            </View>
          ))}
        </View>
      </>
    );
  }

  function renderAttendance() {
    if (sectionLoading.attendance)
      return <ActivityIndicator style={styles.loader} color={palette.forest} />;
    if (sectionErrors.attendance)
      return (
        <Text accessibilityRole="alert" style={styles.error}>
          {sectionErrors.attendance}
        </Text>
      );
    const chartPlotHeight = 148;
    const chartWeeks = attendanceWeeks.map((week, index) => {
      const eligible = week.attended + week.missed;
      const rate = eligible ? (week.attended / eligible) * 100 : null;
      const anchor = new Date(Date.now() - (3 - index) * 7 * 86_400_000).toISOString();
      return {
        ...week,
        eligible,
        rate,
        date: academyDate(anchor, timeZone, { day: "numeric", month: "short" }),
      };
    });
    const chartPoints = chartWeeks.map((week, index) => ({
      x: 8 + (Math.max(0, attendanceChartWidth - 16) * index) / 3,
      y: week.rate === null ? null : chartPlotHeight - (week.rate / 100) * chartPlotHeight,
    }));
    const selectedWeek =
      selectedAttendanceWeek === null ? null : chartWeeks[selectedAttendanceWeek];
    return (
      <>
        <View style={styles.pageIntroCard}>
          <Text style={styles.pageIntroEyebrow}>{childName.toUpperCase()}’S CLASSES</Text>
          <Text style={styles.pageIntroTitle}>Every class counts.</Text>
          <Text style={styles.pageIntroBody}>
            A clear look at the sessions {childName} has made it to.
          </Text>
        </View>
        <View style={styles.attendanceKpis}>
          <View style={styles.attendanceKpi}>
            <Text style={styles.kpiLabel}>ATTENDANCE</Text>
            <Text style={styles.kpiRate}>
              {attendanceRate === null ? "—" : `${attendanceRate}%`}
            </Text>
          </View>
          <View style={styles.attendanceKpi}>
            <Text style={styles.kpiLabel}>ATTENDED</Text>
            <Text style={[styles.kpiCount, styles.kpiGood]}>{attendedCount}</Text>
          </View>
          <View style={styles.attendanceKpi}>
            <Text style={styles.kpiLabel}>MISSED</Text>
            <Text style={[styles.kpiCount, styles.kpiMissed]}>{absentCount}</Text>
          </View>
        </View>

        <View style={styles.attendanceMainStat}>
          <View style={styles.chartHeadingRow}>
            <View>
              <Text style={styles.chartTitle}>Session breakdown</Text>
              <Text style={styles.chartCaption}>
                {attendance.length
                  ? `Across ${attendance.length} recorded sessions`
                  : "No sessions recorded yet"}
              </Text>
            </View>
            {excusedCount > 0 ? (
              <Text style={styles.excusedSummary}>{excusedCount} excused</Text>
            ) : null}
          </View>
          <View style={styles.segmentTrack}>
            {attendedCount > 0 ? (
              <View style={[styles.segmentGood, { flex: attendedCount }]} />
            ) : null}
            {absentCount > 0 ? (
              <View style={[styles.segmentMissed, { flex: absentCount }]} />
            ) : null}
            {excusedCount > 0 ? (
              <View style={[styles.segmentExcused, { flex: excusedCount }]} />
            ) : null}
          </View>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={styles.legendDotGood} />
              <Text style={styles.legendLabel}>Present / late</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={styles.legendDotMissed} />
              <Text style={styles.legendLabel}>Absent</Text>
            </View>
            {excusedCount > 0 ? (
              <View style={styles.legendItem}>
                <View style={styles.legendDotExcused} />
                <Text style={styles.legendLabel}>Excused</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.weeklyChart}>
          <Text style={styles.chartTitle}>4-week attendance trend</Text>
          <Text style={styles.chartCaption}>Present or late ÷ sessions not excused</Text>
          <View style={styles.attendanceInsight}>
            <Text style={styles.attendanceInsightLabel}>
              {hasRecentAttendance
                ? `${recentFourWeekRate}% · ${recentFourWeekCount} sessions`
                : "Attendance insight"}
            </Text>
            <Text style={styles.attendanceInsightText}>{attendanceInsight}</Text>
          </View>
          {hasRecentAttendance ? (
            <>
              <View style={styles.chartGraph}>
                <View style={styles.chartYAxis}>
                  {[100, 75, 50, 25, 0].map((label, index) => (
                    <Text
                      key={label}
                      style={[styles.chartAxisLabel, { top: (chartPlotHeight * index) / 4 }]}
                    >
                      {label}
                    </Text>
                  ))}
                </View>
                <View
                  style={[styles.chartPlot, { height: chartPlotHeight }]}
                  onLayout={(event) => {
                    const width = event.nativeEvent.layout.width;
                    if (width !== attendanceChartWidth) setAttendanceChartWidth(width);
                  }}
                >
                  {[0, 25, 50, 75, 100].map((value) => (
                    <View
                      key={`horizontal-${value}`}
                      style={[styles.chartHorizontalGrid, { top: chartPlotHeight * (value / 100) }]}
                    />
                  ))}
                  {chartPoints.map((point, index) => (
                    <View
                      key={`vertical-${index}`}
                      style={[styles.chartVerticalGrid, { left: point.x }]}
                    />
                  ))}
                  {chartPoints.slice(0, -1).map((point, index) => {
                    const nextPoint = chartPoints[index + 1];
                    if (point.y === null || !nextPoint || nextPoint.y === null) return null;
                    const dx = nextPoint.x - point.x;
                    const dy = nextPoint.y - point.y;
                    const length = Math.sqrt(dx * dx + dy * dy);
                    const angle = `${(Math.atan2(dy, dx) * 180) / Math.PI}deg`;
                    return (
                      <View
                        key={`trend-${index}`}
                        style={[
                          styles.chartTrendLine,
                          {
                            left: point.x,
                            top: (point.y + nextPoint.y) / 2 - 1,
                            width: length,
                            transform: [{ rotate: angle }],
                          },
                        ]}
                      />
                    );
                  })}
                  {chartPoints.map((point, index) => {
                    const week = chartWeeks[index];
                    if (point.y === null || !week) return null;
                    return (
                      <Pressable
                        key={`point-${index}`}
                        accessibilityRole="button"
                        accessibilityLabel={`${week.date}: ${week.attended} present out of ${week.eligible} marked sessions, ${week.rate?.toFixed(1)} percent attendance`}
                        onPress={() => setSelectedAttendanceWeek(index)}
                        style={[styles.chartPointHit, { left: point.x - 12, top: point.y - 12 }]}
                      >
                        <View style={styles.chartPoint} />
                      </Pressable>
                    );
                  })}
                  {selectedWeek && selectedAttendanceWeek !== null
                    ? (() => {
                        const point = chartPoints[selectedAttendanceWeek];
                        if (!point || point.y === null) return null;
                        const tooltipWidth = 132;
                        const tooltipLeft = Math.max(
                          0,
                          Math.min(point.x - tooltipWidth / 2, attendanceChartWidth - tooltipWidth),
                        );
                        const tooltipTop = Math.max(
                          4,
                          Math.min(point.y - 70, chartPlotHeight - 66),
                        );
                        return (
                          <View
                            style={[styles.chartTooltip, { left: tooltipLeft, top: tooltipTop }]}
                          >
                            <Text style={styles.tooltipDate}>{selectedWeek.date}</Text>
                            <Text style={styles.tooltipPresent}>
                              Attended: {selectedWeek.attended}/{selectedWeek.eligible}
                            </Text>
                            <Text style={styles.tooltipRate}>{selectedWeek.rate?.toFixed(1)}%</Text>
                          </View>
                        );
                      })()
                    : null}
                </View>
              </View>
              <View style={styles.chartXAxis}>
                {chartWeeks.map((week, index) => (
                  <Text key={`date-${index}`} style={styles.chartDateLabel}>
                    {week.date}
                  </Text>
                ))}
              </View>
              <View style={styles.chartLegend}>
                <View style={styles.chartLegendDot} />
                <Text style={styles.chartLegendText}>Attendance %</Text>
              </View>
            </>
          ) : (
            <View style={styles.chartEmpty}>
              <Text style={styles.chartEmptyText}>
                No eligible attendance marks in the last 4 weeks.
              </Text>
            </View>
          )}
        </View>

        <SectionHeading title="Session history" detail={`${attendance.length} total`} />
        <AttendanceRows records={attendance} timeZone={timeZone} />
      </>
    );
  }

  function renderProgress() {
    if (sectionLoading.progress)
      return <ActivityIndicator style={styles.loader} color={palette.forest} />;
    if (sectionErrors.progress)
      return (
        <Text accessibilityRole="alert" style={styles.error}>
          {sectionErrors.progress}
        </Text>
      );
    return (
      <>
        <View style={styles.progressWelcome}>
          <View style={styles.progressWelcomeIcon}>
            <Text style={styles.progressWelcomeGlyph}>✦</Text>
          </View>
          <Text style={styles.progressWelcomeTitle}>Small steps, real progress.</Text>
          <Text style={styles.progressWelcomeBody}>
            Coach-shared moments from {childName}’s training.
          </Text>
        </View>
        {progress.length ? (
          <>
            {progress[0] ? (
              <View style={styles.latestProgressCard}>
                <Text style={styles.latestProgressEyebrow}>LATEST UPDATE</Text>
                <Text style={styles.latestProgressTitle}>{progress[0].assessmentName}</Text>
                {progress[0].value ? (
                  <Text style={styles.latestProgressValue}>{progress[0].value}</Text>
                ) : null}
                {progress[0].coachNote ? (
                  <Text style={styles.latestProgressNote}>{progress[0].coachNote}</Text>
                ) : null}
                <Text style={styles.latestProgressMeta}>
                  {progress[0].sportName} · {progress[0].coachName} ·{" "}
                  {academyDate(progress[0].createdAt, timeZone, { day: "numeric", month: "short" })}
                </Text>
              </View>
            ) : null}
            <SectionHeading title="Earlier moments" detail={`${progress.length} updates`} />
            <View style={styles.timeline}>
              {progress.slice(1).map((entry) => (
                <View key={entry.id} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View style={styles.timelineDot} />
                  </View>
                  <View style={styles.timelineCard}>
                    <Text style={styles.timelineDate}>
                      {academyDate(entry.createdAt, timeZone, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                    <Text style={styles.rowTitle}>
                      {entry.assessmentName}
                      {entry.value ? ` · ${entry.value}` : ""}
                    </Text>
                    <Text style={styles.rowDetail}>
                      {entry.sportName} · {entry.coachName}
                    </Text>
                    {entry.coachNote ? (
                      <Text style={styles.timelineNote}>{entry.coachNote}</Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : (
          <EmptyState
            symbol="✦"
            title="The journey is just beginning"
            detail="When a coach shares an assessment or note, it will appear here."
          />
        )}
      </>
    );
  }

  function renderFees() {
    if (sectionLoading.payments)
      return <ActivityIndicator style={styles.loader} color={palette.forest} />;
    if (sectionErrors.payments)
      return (
        <Text accessibilityRole="alert" style={styles.error}>
          {sectionErrors.payments}
        </Text>
      );
    if (!finance?.charges.length)
      return (
        <EmptyState
          symbol="₹"
          title="No fee statements yet"
          detail="Statements and receipts from the academy will be collected here."
        />
      );
    return (
      <>
        <View style={styles.feeHero}>
          <Text style={styles.feeHeroLabel}>BALANCE TO THE ACADEMY</Text>
          <Text style={styles.feeHeroAmount}>{money(dueTotal, finance.currency)}</Text>
          <Text style={styles.feeHeroNote}>Your fee statements and receipts, all together.</Text>
        </View>
        <SectionHeading title="Statements" detail={`${finance.charges.length} total`} />
        <View style={styles.cardStack}>
          {finance.charges.map((charge) => (
            <View key={charge.id} style={styles.invoiceCard}>
              <View style={styles.invoiceTop}>
                <View style={styles.rowMain}>
                  <Text style={styles.invoiceTitle}>{charge.description}</Text>
                  <Text style={styles.rowDetail}>
                    Due {charge.dueDate} · {charge.invoiceNumber}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.invoiceState,
                    charge.balancePaise === 0 ? styles.invoicePaid : styles.invoiceDue,
                  ]}
                >
                  {charge.status === "voided"
                    ? "Voided"
                    : charge.balancePaise === 0
                      ? "Paid"
                      : "Due"}
                </Text>
              </View>
              <View style={styles.invoiceTotals}>
                <Text style={styles.invoiceTotalLabel}>
                  Total {money(charge.amountPaise, finance.currency)}
                </Text>
                <Text style={styles.invoiceBalance}>
                  {charge.balancePaise > 0
                    ? `${money(charge.balancePaise, finance.currency)} due`
                    : "Settled"}
                </Text>
              </View>
              {charge.payments.map((payment) => (
                <View key={payment.id} style={styles.receiptRow}>
                  <View>
                    <Text style={styles.receiptTitle}>Receipt {payment.receiptNumber}</Text>
                    <Text style={styles.rowDetail}>
                      {academyDate(payment.receivedAt, timeZone, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                  <Text style={styles.receiptAmount}>
                    {money(payment.amountPaise, finance.currency)}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
        <Text style={styles.feeFootnote}>
          Payments are handled by the academy. Please contact them for help with a statement.
        </Text>
      </>
    );
  }

  function renderAccount() {
    const goBack = () => {
      setFormMessage(null);
      setAccountPage("overview");
    };
    if (accountPage === "overview") {
      return (
        <>
          <View style={styles.accountHeader}>
            <ChildAvatar size={52} />
            <View style={styles.rowMain}>
              <Text style={styles.accountChildName}>{profileName || auth.user.displayName}</Text>
              <Text style={styles.accountCaption}>Parent account</Text>
              <Text style={styles.accountEmail}>{auth.user.email}</Text>
            </View>
          </View>

          <View style={styles.formCard}>
            <SectionHeading title="My children" detail={`${students.length} linked`} />
            {students.length ? (
              students.map((student) => (
                <Pressable
                  key={student.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setSelectedId(student.id);
                    setAccountPage("children");
                  }}
                  style={styles.childSettingRow}
                >
                  <ChildAvatar size={38} />
                  <View style={styles.rowMain}>
                    <Text style={styles.settingsRowTitle}>
                      {student.firstName} {student.lastName}
                    </Text>
                    <Text style={styles.settingsRowDetail}>
                      {student.batchNames.join(" · ") || "Student profile"}
                    </Text>
                  </View>
                  <Text style={styles.settingsChevron}>›</Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.formHint}>
                No student profiles are linked to this account yet.
              </Text>
            )}
          </View>

          <View style={styles.formCard}>
            <SectionHeading title="Account & preferences" />
            <SettingsRow
              title="Personal information"
              detail="Name, phone and email"
              onPress={() => setAccountPage("personal")}
            />
            <SettingsRow
              title="Security"
              detail="Change your password"
              onPress={() => setAccountPage("security")}
            />
            <SettingsRow
              title="Notifications"
              detail="Academy announcements and updates"
              onPress={() => setTab("announcements")}
            />
            <View style={styles.supportNote}>
              <Text style={styles.supportTitle}>Help & support</Text>
              <Text style={styles.settingsRowDetail}>
                For help with your account, contact {auth.user.academyName}.
              </Text>
            </View>
          </View>

          <Pressable accessibilityRole="button" onPress={onLogout} style={styles.signOutButton}>
            <Text style={styles.signOutText}>Log out</Text>
          </Pressable>
        </>
      );
    }

    return (
      <>
        <Pressable accessibilityRole="button" onPress={goBack} style={styles.settingsBack}>
          <Text style={styles.settingsBackText}>‹ Your account</Text>
        </Pressable>

        {accountPage === "personal" ? (
          <View style={styles.formCard}>
            {profileLoading ? (
              <ActivityIndicator style={styles.inlineLoader} color={palette.forest} />
            ) : (
              <>
                {sectionErrors.profile ? (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {sectionErrors.profile}
                  </Text>
                ) : null}
                <Text style={styles.inputLabel}>Full name</Text>
                <TextInput
                  accessibilityLabel="Your name"
                  value={profileName}
                  onChangeText={setProfileName}
                  placeholder="Your name"
                  style={styles.input}
                />
                <Text style={styles.inputLabel}>Mobile number</Text>
                <Text style={styles.emailValue}>{registeredPhone || "Not provided"}</Text>
                <Text style={styles.formHint}>
                  Changing a registered number requires verification. Contact the academy for help.
                </Text>
                <Text style={styles.inputLabel}>Registered email</Text>
                <Text style={styles.emailValue}>{auth.user.email}</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={() => void saveParentProfile()}
                  style={styles.secondaryButton}
                >
                  {saving ? (
                    <ActivityIndicator color={palette.forest} />
                  ) : (
                    <Text style={styles.secondaryButtonText}>Save changes</Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        ) : null}

        {accountPage === "children" && selected ? (
          <>
            {students.length > 1 ? (
              <View style={styles.formCard}>
                <SectionHeading title="Choose a child" />
                {students.map((student) => {
                  const active = student.id === selected.id;
                  return (
                    <Pressable
                      key={student.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        setSelectedId(student.id);
                      }}
                      style={[styles.accountChildChoice, active && styles.accountChildChoiceActive]}
                    >
                      <Text
                        style={[
                          styles.accountChildChoiceText,
                          active && styles.accountChildChoiceTextActive,
                        ]}
                      >
                        {student.firstName} {student.lastName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <View style={styles.formCard}>
              <View style={styles.studentProfileSummary}>
                <ChildAvatar size={48} />
                <View style={styles.rowMain}>
                  <Text style={styles.accountChildName}>
                    {selected.firstName} {selected.lastName}
                  </Text>
                  <Text style={styles.accountCaption}>
                    {selected.batchNames.join(" · ") || "Student profile"}
                  </Text>
                  <Text style={styles.accountCaption}>{selected.status}</Text>
                </View>
              </View>
              <SectionHeading title="Official student details" />
              <View style={styles.readOnlyField}>
                <Text style={styles.inputLabel}>Full name</Text>
                <Text style={styles.readOnlyValue}>
                  {selected.firstName} {selected.lastName}
                </Text>
              </View>
              <View style={styles.correctionNote}>
                <Text style={styles.supportTitle}>Need a correction?</Text>
                <Text style={styles.settingsRowDetail}>
                  Student identity and enrollment details are managed by the academy. Contact{" "}
                  {auth.user.academyName} to request a change.
                </Text>
              </View>
            </View>
            <View style={styles.formCard}>
              <SectionHeading title="Student information" />
              <SettingsRow
                title="Schedule"
                detail="View upcoming training sessions"
                onPress={() => setTab("schedule")}
              />
              <SettingsRow
                title="Attendance"
                detail="View attendance history"
                onPress={() => setTab("attendance")}
              />
              <SettingsRow
                title="Progress"
                detail="View published progress updates"
                onPress={() => setTab("progress")}
              />
              <SettingsRow
                title="Fees & receipts"
                detail="View invoices and payment history"
                onPress={() => setTab("payments")}
              />
            </View>
          </>
        ) : null}

        {accountPage === "security" ? (
          <View style={styles.formCard}>
            <Text style={styles.formHint}>
              Choose a new password with at least 14 characters. You’ll be signed out after it
              changes.
            </Text>
            <Text style={styles.inputLabel}>Current password</Text>
            <TextInput
              accessibilityLabel="Current password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Current password"
              secureTextEntry
              style={styles.input}
            />
            <Text style={styles.inputLabel}>New password</Text>
            <TextInput
              accessibilityLabel="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password"
              secureTextEntry
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => void changePassword()}
              style={styles.secondaryButton}
            >
              {saving ? (
                <ActivityIndicator color={palette.forest} />
              ) : (
                <Text style={styles.secondaryButtonText}>Update password</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {formMessage ? (
          <Text accessibilityRole="alert" style={styles.formMessage}>
            {formMessage}
          </Text>
        ) : null}
      </>
    );
  }

  const title =
    tab === "home"
      ? "Today"
      : tab === "announcements"
        ? "Academy notes"
        : tab === "attendance"
          ? "Attendance"
          : tab === "progress"
            ? "Progress"
            : tab === "payments"
              ? "Fees"
              : tab === "profile"
                ? accountPage === "overview"
                  ? "Your account"
                  : accountPage === "personal"
                    ? "Personal information"
                    : accountPage === "children"
                      ? "My children"
                      : "Security"
                : "Schedule";

  function renderContent() {
    if (loading) return <ActivityIndicator style={styles.loader} color={palette.forest} />;
    if (error && !selected)
      return (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      );
    if (tab === "announcements")
      return (
        <>
          {sectionErrors.announcements ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {sectionErrors.announcements}
            </Text>
          ) : null}
          {renderNotices()}
        </>
      );
    if (tab === "schedule") return renderSchedule();
    if (tab === "attendance") return renderAttendance();
    if (tab === "progress") return renderProgress();
    if (tab === "payments") return renderFees();
    if (tab === "profile") return renderAccount();
    return renderHome();
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>S</Text>
          </View>
          <View>
            <Text style={styles.brandName}>SportDesk</Text>
            <Text style={styles.academyName}>{auth.user.academyName}</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Academy notes${unreadCount ? `, ${unreadCount} unread` : ""}`}
          accessibilityState={{ selected: tab === "announcements" }}
          onPress={() => setTab(tab === "announcements" ? "home" : "announcements")}
          style={[
            styles.notificationButton,
            tab === "announcements" && styles.notificationButtonActive,
          ]}
        >
          <BellIcon active={tab === "announcements"} animated={unreadCount > 0} />
          {unreadCount > 0 ? <View style={styles.unreadDot} /> : null}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageHeading}>
          <View style={styles.headingCopy}>
            <Text style={styles.pageTitle}>
              {tab === "home" && selected ? `Hello, ${childName}` : title}
            </Text>
            <Text style={styles.pageSubtitle}>
              {tab === "home" && selected
                ? "A little look at their academy week."
                : tab === "profile"
                  ? accountPage === "overview"
                    ? "Manage your family account and preferences."
                    : accountPage === "personal"
                      ? "Your contact details and registered email."
                      : accountPage === "children"
                        ? "Profiles and information for your children."
                        : "Keep your account protected."
                  : selected
                    ? `${selected.firstName} · ${auth.user.academyName}`
                    : auth.user.academyName}
            </Text>
          </View>
          {tab === "home" && selected ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open account"
              onPress={() => setTab("profile")}
              style={styles.profileShortcut}
            >
              <ChildAvatar size={38} />
            </Pressable>
          ) : null}
        </View>
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
                if (item.id === "profile") setAccountPage("overview");
                setTab(item.id);
              }}
              style={styles.navButton}
            >
              <View style={[styles.navGlyphWrap, active && styles.navGlyphWrapActive]}>
                <TabIcon id={item.id} active={active} />
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
  screen: { flex: 1, backgroundColor: palette.canvas },
  header: {
    minHeight: 62,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: palette.canvas,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerBrand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: palette.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  brandMarkText: { color: palette.white, fontSize: 17, fontWeight: "800" },
  brandName: { color: palette.ink, fontSize: 14, fontWeight: "700", letterSpacing: -0.2 },
  academyName: { marginTop: 2, color: palette.muted, fontSize: 11 },
  notificationButton: {
    position: "relative",
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: "#DCE4F0",
  },
  notificationButtonActive: { backgroundColor: palette.mint, borderColor: palette.mintDeep },
  bell: { width: 26, height: 28, alignItems: "center", justifyContent: "center" },
  bellDome: {
    position: "absolute",
    top: 2,
    width: 16,
    height: 19,
    borderWidth: 2,
    borderColor: "#46566A",
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    borderBottomWidth: 0,
  },
  bellDomeActive: { borderColor: palette.forest },
  bellLip: {
    position: "absolute",
    bottom: 3,
    width: 23,
    height: 7,
    borderWidth: 2,
    borderColor: "#46566A",
    borderRadius: 5,
    backgroundColor: palette.card,
  },
  bellLipActive: { borderColor: palette.forest },
  bellClapper: {
    position: "absolute",
    bottom: 0,
    width: 5,
    height: 5,
    borderWidth: 1.7,
    borderRadius: 3,
    borderColor: "#46566A",
    backgroundColor: palette.card,
  },
  bellClapperActive: { borderColor: palette.forest },
  avatarArt: {
    overflow: "hidden",
    alignItems: "center",
    backgroundColor: "#F6A000",
    borderColor: "#183C78",
  },
  avatarCoral: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "#F27662" },
  avatarHead: { position: "absolute", backgroundColor: "#80D0D4", borderColor: "#183C78" },
  avatarShoulders: { position: "absolute", backgroundColor: "#80D0D4", borderColor: "#183C78" },
  iconHome: { width: 19, height: 19, alignItems: "center", justifyContent: "flex-end" },
  iconHomeRoof: {
    position: "absolute",
    top: 3,
    width: 11,
    height: 11,
    borderTopWidth: 1.7,
    borderLeftWidth: 1.7,
    transform: [{ rotate: "45deg" }],
  },
  iconHomeBody: {
    width: 15,
    height: 10,
    borderWidth: 1.7,
    borderTopWidth: 0,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  iconHomeDoor: { width: 3, height: 5, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  iconCalendar: { width: 17, height: 17, borderWidth: 1.6, borderRadius: 4, overflow: "hidden" },
  iconCalendarTop: { height: 5, borderBottomWidth: 1.2 },
  iconCalendarGrid: {
    paddingHorizontal: 3,
    paddingTop: 2,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
  },
  iconCalendarCell: { width: 3, height: 3, borderRadius: 1 },
  iconCheckCircle: {
    width: 18,
    height: 18,
    borderWidth: 1.6,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCheck: { fontSize: 11, lineHeight: 13, fontWeight: "700" },
  iconBars: { height: 19, flexDirection: "row", alignItems: "flex-end", gap: 2 },
  iconBar: { width: 4, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  iconWallet: {
    width: 18,
    height: 15,
    borderWidth: 1.6,
    borderRadius: 4,
    justifyContent: "center",
    paddingLeft: 2,
  },
  iconWalletFlap: { position: "absolute", right: -1, top: 3, width: 7, height: 7, borderRadius: 2 },
  iconWalletDot: { width: 2.5, height: 2.5, borderRadius: 2 },
  unreadDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: palette.coral,
    borderWidth: 1,
    borderColor: palette.card,
  },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 },
  pageHeading: {
    marginBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headingCopy: { flex: 1 },
  pageTitle: {
    color: palette.ink,
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -0.6,
    fontWeight: "700",
  },
  pageSubtitle: { marginTop: 4, color: palette.muted, fontSize: 12, lineHeight: 17 },
  profileShortcut: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeCard: {
    position: "relative",
    overflow: "hidden",
    padding: 20,
    borderRadius: 22,
    backgroundColor: palette.forest,
    minHeight: 188,
  },
  welcomeDecorOne: {
    position: "absolute",
    top: -38,
    right: -14,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  welcomeDecorTwo: {
    position: "absolute",
    bottom: -54,
    right: 77,
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: "rgba(247,217,133,0.13)",
  },
  welcomeKicker: { color: "#C8E4D6", fontSize: 9, letterSpacing: 1.3, fontWeight: "700" },
  welcomeTitle: {
    marginTop: 12,
    color: palette.white,
    fontSize: 23,
    lineHeight: 28,
    letterSpacing: -0.4,
    fontWeight: "700",
  },
  welcomeCaption: { maxWidth: 250, marginTop: 7, color: "#D3E4DD", fontSize: 12, lineHeight: 17 },
  childChips: { gap: 7, paddingTop: 13 },
  childChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.11)",
  },
  childChipActive: { backgroundColor: palette.white },
  childChipText: { color: "#E0EEE8", fontSize: 11, fontWeight: "600" },
  childChipTextActive: { color: palette.forest },
  sectionHeading: {
    marginTop: 23,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  sectionTitle: { color: palette.ink, fontSize: 15, letterSpacing: -0.2, fontWeight: "700" },
  sectionDetail: { color: palette.muted, fontSize: 11 },
  sectionAction: { color: palette.forest, fontSize: 11, fontWeight: "600" },
  attendanceHomeCard: {
    padding: 15,
    borderRadius: 17,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
  },
  attendanceHomeTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  attendanceRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 4,
    borderColor: palette.mintDeep,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.mint,
  },
  attendanceRingValue: { color: palette.forest, fontSize: 13, fontWeight: "700" },
  attendanceHomeCopy: { flex: 1 },
  homeCardTitle: { color: palette.ink, fontSize: 14, fontWeight: "600" },
  homeCardDetail: { marginTop: 4, color: palette.muted, fontSize: 11, lineHeight: 16 },
  chevron: { color: "#9BA9A3", fontSize: 24, lineHeight: 26, fontWeight: "300" },
  attendanceBreakdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 11,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  breakdownGood: { color: palette.forest, fontSize: 10, fontWeight: "600" },
  breakdownDivider: { color: "#B1BDB7", fontSize: 12 },
  breakdownQuiet: { color: palette.muted, fontSize: 10 },
  cardStack: { gap: 8 },
  scheduleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
  },
  scheduleCardToday: { borderColor: palette.mintDeep },
  scheduleDay: {
    width: 45,
    height: 46,
    borderRadius: 13,
    backgroundColor: palette.canvas,
    alignItems: "center",
    justifyContent: "center",
  },
  scheduleDayToday: { backgroundColor: palette.mint },
  scheduleDayName: { color: palette.muted, fontSize: 11, fontWeight: "700" },
  scheduleDayNameToday: { color: palette.forest },
  todayDot: { marginTop: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: palette.forest },
  scheduleInfo: { flex: 1 },
  scheduleBatch: { color: palette.ink, fontSize: 13, fontWeight: "600" },
  scheduleMeta: { marginTop: 4, color: palette.text, fontSize: 11 },
  scheduleLocation: { marginTop: 3, color: palette.muted, fontSize: 10 },
  todayLabel: { color: palette.forest, fontSize: 8, letterSpacing: 0.6, fontWeight: "800" },
  latestNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 13,
    borderRadius: 16,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
  },
  noticeMark: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: palette.sunnySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  noticeMarkText: { color: "#A47B19", fontSize: 15, fontWeight: "700" },
  latestNoticeTitle: { color: palette.ink, fontSize: 12, fontWeight: "600" },
  latestNoticeBody: { marginTop: 3, color: palette.muted, fontSize: 10, lineHeight: 14 },
  quietNotice: {
    padding: 14,
    borderRadius: 15,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
  },
  quietNoticeText: { color: palette.muted, fontSize: 11 },
  feeShortcut: {
    marginTop: 11,
    padding: 15,
    borderRadius: 16,
    backgroundColor: palette.sunnySoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  feeShortcutLabel: { color: palette.text, fontSize: 10 },
  feeShortcutValue: { marginTop: 4, color: palette.ink, fontSize: 13, fontWeight: "700" },
  pageIntroCard: { padding: 18, borderRadius: 19, backgroundColor: palette.mint },
  pageIntroEyebrow: { color: palette.forest, fontSize: 9, letterSpacing: 1.1, fontWeight: "700" },
  pageIntroTitle: {
    marginTop: 8,
    color: palette.ink,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: -0.35,
    fontWeight: "700",
  },
  pageIntroBody: { marginTop: 5, color: palette.text, fontSize: 11, lineHeight: 16 },
  weekPlan: { marginTop: 20, gap: 19 },
  dayHeadingRow: { marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  dayHeading: { color: palette.ink, fontSize: 12, fontWeight: "700" },
  dayHeadingToday: { color: palette.forest },
  todayPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: palette.mint,
    color: palette.forest,
    fontSize: 8,
    fontWeight: "800",
  },
  attendanceKpis: { marginTop: 13, marginBottom: 10, flexDirection: "row", gap: 8 },
  attendanceKpi: {
    flex: 1,
    minHeight: 74,
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderRadius: 15,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
  },
  kpiLabel: { color: palette.muted, fontSize: 8, letterSpacing: 0.65, fontWeight: "700" },
  kpiRate: { marginTop: 7, color: palette.forest, fontSize: 21, lineHeight: 25, fontWeight: "700" },
  kpiCount: { marginTop: 7, fontSize: 21, lineHeight: 25, fontWeight: "700" },
  kpiGood: { color: palette.forest },
  kpiMissed: { color: palette.coral },
  attendanceMainStat: {
    padding: 17,
    borderRadius: 18,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
  },
  chartHeadingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  excusedSummary: { color: palette.blue, fontSize: 10, fontWeight: "600" },
  segmentTrack: {
    height: 8,
    flexDirection: "row",
    gap: 3,
    overflow: "hidden",
    marginTop: 16,
    borderRadius: 5,
    backgroundColor: palette.canvas,
  },
  segmentGood: { borderRadius: 5, backgroundColor: palette.forest },
  segmentMissed: { borderRadius: 5, backgroundColor: palette.coral },
  segmentExcused: { borderRadius: 5, backgroundColor: palette.blue },
  legendRow: { marginTop: 12, flexDirection: "row", gap: 15 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDotGood: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.forest },
  legendDotMissed: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.coral },
  legendDotExcused: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.blue },
  legendLabel: { color: palette.text, fontSize: 10 },
  weeklyChart: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
  },
  chartTitle: { color: palette.ink, fontSize: 13, fontWeight: "700" },
  chartCaption: { marginTop: 3, color: palette.muted, fontSize: 10 },
  attendanceInsight: {
    marginTop: 13,
    padding: 12,
    borderRadius: 13,
    backgroundColor: palette.mint,
  },
  attendanceInsightLabel: { color: palette.forest, fontSize: 12, fontWeight: "700" },
  attendanceInsightText: { marginTop: 4, color: palette.text, fontSize: 10, lineHeight: 15 },
  chartGraph: { marginTop: 18, flexDirection: "row", alignItems: "stretch", gap: 6 },
  chartYAxis: { width: 24, height: 148, position: "relative" },
  chartAxisLabel: {
    position: "absolute",
    right: 1,
    width: 22,
    color: palette.text,
    fontSize: 9,
    textAlign: "right",
    transform: [{ translateY: -5 }],
  },
  chartPlot: { flex: 1, position: "relative", overflow: "visible" },
  chartHorizontalGrid: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: "#DFE5EE",
    borderStyle: "dashed",
  },
  chartVerticalGrid: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderLeftWidth: 1,
    borderLeftColor: "#E7EBF2",
    borderStyle: "dashed",
  },
  chartTrendLine: {
    position: "absolute",
    height: 2,
    borderRadius: 2,
    backgroundColor: "#1677F8",
  },
  chartPointHit: {
    position: "absolute",
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  chartPoint: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: palette.card,
    backgroundColor: "#1677F8",
  },
  chartTooltip: {
    position: "absolute",
    zIndex: 3,
    width: 132,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.card,
    shadowColor: "#26364A",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  tooltipDate: { color: palette.ink, fontSize: 10, fontWeight: "600" },
  tooltipPresent: { marginTop: 5, color: "#1CA34A", fontSize: 10 },
  tooltipRate: { marginTop: 3, color: "#1677F8", fontSize: 12, fontWeight: "700" },
  chartXAxis: {
    marginLeft: 30,
    marginTop: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  chartDateLabel: { color: palette.text, fontSize: 8 },
  chartLegend: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  chartLegendDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#1677F8" },
  chartLegendText: { color: "#1677F8", fontSize: 11, fontWeight: "500" },
  chartEmpty: {
    minHeight: 96,
    marginTop: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: palette.canvas,
  },
  chartEmptyText: { color: palette.muted, fontSize: 10, textAlign: "center" },
  listCard: {
    paddingHorizontal: 13,
    borderRadius: 17,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
  },
  attendanceRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  rowDivider: { borderTopWidth: 1, borderTopColor: palette.line },
  attendanceMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  attendanceMarkAbsent: { backgroundColor: palette.coralSoft },
  attendanceMarkLate: { backgroundColor: palette.sunnySoft },
  attendanceMarkExcused: { backgroundColor: palette.blueSoft },
  attendanceMarkText: { color: palette.forest, fontSize: 12, fontWeight: "800" },
  rowMain: { flex: 1 },
  rowTitle: { color: palette.ink, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  rowDetail: { marginTop: 3, color: palette.muted, fontSize: 10, lineHeight: 14 },
  attendanceStatus: { color: palette.forest, fontSize: 10, fontWeight: "600" },
  attendanceAbsent: { color: palette.coral },
  attendanceLate: { color: "#9A7415" },
  progressWelcome: {
    alignItems: "center",
    padding: 20,
    borderRadius: 19,
    backgroundColor: palette.sunnySoft,
  },
  progressWelcomeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.sunny,
  },
  progressWelcomeGlyph: { color: "#876211", fontSize: 18 },
  progressWelcomeTitle: { marginTop: 10, color: palette.ink, fontSize: 16, fontWeight: "700" },
  progressWelcomeBody: {
    marginTop: 4,
    color: palette.text,
    textAlign: "center",
    fontSize: 11,
    lineHeight: 16,
  },
  latestProgressCard: {
    marginTop: 14,
    padding: 17,
    borderRadius: 18,
    backgroundColor: palette.forest,
  },
  latestProgressEyebrow: { color: "#C8E4D6", fontSize: 9, letterSpacing: 1.1, fontWeight: "700" },
  latestProgressTitle: { marginTop: 10, color: palette.white, fontSize: 17, fontWeight: "700" },
  latestProgressValue: { marginTop: 5, color: palette.sunny, fontSize: 16, fontWeight: "600" },
  latestProgressNote: { marginTop: 8, color: "#E3EEE9", fontSize: 11, lineHeight: 17 },
  latestProgressMeta: { marginTop: 13, color: "#C8E4D6", fontSize: 9 },
  timeline: { gap: 0 },
  timelineRow: { flexDirection: "row", gap: 11, minHeight: 86 },
  timelineRail: { width: 14, alignItems: "center" },
  timelineDot: {
    marginTop: 16,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: palette.forest,
    borderWidth: 2,
    borderColor: palette.mintDeep,
  },
  timelineCard: {
    flex: 1,
    padding: 13,
    marginBottom: 8,
    borderRadius: 15,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
  },
  timelineDate: { marginBottom: 5, color: palette.muted, fontSize: 9, fontWeight: "600" },
  timelineNote: { marginTop: 7, color: palette.text, fontSize: 11, lineHeight: 16 },
  feeHero: { padding: 18, borderRadius: 19, backgroundColor: palette.forest },
  feeHeroLabel: { color: "#C8E4D6", fontSize: 9, letterSpacing: 1.1, fontWeight: "700" },
  feeHeroAmount: {
    marginTop: 8,
    color: palette.white,
    fontSize: 29,
    letterSpacing: -0.5,
    fontWeight: "700",
  },
  feeHeroNote: { marginTop: 4, color: "#D3E4DD", fontSize: 10 },
  invoiceCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
  },
  invoiceTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  invoiceTitle: { color: palette.ink, fontSize: 13, fontWeight: "700" },
  invoiceState: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    overflow: "hidden",
    borderRadius: 8,
    fontSize: 9,
    fontWeight: "700",
  },
  invoicePaid: { color: palette.forest, backgroundColor: palette.mint },
  invoiceDue: { color: "#8A6814", backgroundColor: palette.sunnySoft },
  invoiceTotals: {
    marginTop: 13,
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  invoiceTotalLabel: { color: palette.text, fontSize: 10 },
  invoiceBalance: { color: palette.ink, fontSize: 10, fontWeight: "700" },
  receiptRow: {
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  receiptTitle: { color: palette.ink, fontSize: 10, fontWeight: "600" },
  receiptAmount: { color: palette.forest, fontSize: 11, fontWeight: "700" },
  feeFootnote: {
    marginTop: 12,
    color: palette.muted,
    textAlign: "center",
    fontSize: 10,
    lineHeight: 15,
  },
  accountHeader: {
    marginBottom: 13,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    backgroundColor: palette.mint,
  },
  accountEmail: { marginTop: 3, color: palette.muted, fontSize: 10 },
  accountChildName: { color: palette.ink, fontSize: 15, fontWeight: "700" },
  accountCaption: { marginTop: 4, color: palette.text, fontSize: 10 },
  childSettingRow: {
    minHeight: 58,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  settingsRow: {
    minHeight: 54,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  settingsRowTitle: { color: palette.ink, fontSize: 12, fontWeight: "600" },
  settingsRowDetail: { marginTop: 3, color: palette.muted, fontSize: 10, lineHeight: 14 },
  settingsChevron: { color: palette.muted, fontSize: 23, lineHeight: 25 },
  supportNote: { paddingTop: 13 },
  supportTitle: { color: palette.ink, fontSize: 12, fontWeight: "600" },
  settingsBack: { alignSelf: "flex-start", paddingVertical: 5, marginBottom: 8 },
  settingsBackText: { color: palette.forest, fontSize: 12, fontWeight: "600" },
  studentProfileSummary: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 15 },
  readOnlyField: {
    marginTop: 10,
    padding: 12,
    borderRadius: 11,
    backgroundColor: palette.canvas,
  },
  readOnlyValue: { color: palette.ink, fontSize: 12, fontWeight: "600" },
  correctionNote: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: palette.sunnySoft,
  },
  formCard: {
    marginTop: 10,
    padding: 15,
    borderRadius: 17,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
  },
  accountChildChoices: { gap: 7, paddingTop: 10, paddingBottom: 2 },
  accountChildChoice: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 13,
    backgroundColor: palette.canvas,
  },
  accountChildChoiceActive: { backgroundColor: palette.mint },
  accountChildChoiceText: { color: palette.text, fontSize: 10, fontWeight: "600" },
  accountChildChoiceTextActive: { color: palette.forest },
  inputLabel: {
    marginTop: 12,
    marginBottom: 5,
    color: palette.text,
    fontSize: 10,
    fontWeight: "600",
  },
  input: {
    minHeight: 43,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.canvas,
    color: palette.ink,
    fontSize: 12,
  },
  emailValue: { paddingVertical: 11, color: palette.muted, fontSize: 12 },
  formHint: { marginTop: 2, color: palette.muted, fontSize: 10, lineHeight: 14 },
  primaryButton: {
    minHeight: 43,
    marginTop: 14,
    borderRadius: 12,
    backgroundColor: palette.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { color: palette.white, fontSize: 12, fontWeight: "700" },
  secondaryButton: {
    minHeight: 41,
    marginTop: 13,
    borderRadius: 12,
    backgroundColor: palette.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { color: palette.forest, fontSize: 11, fontWeight: "700" },
  formMessage: { marginTop: 13, color: palette.forest, fontSize: 11, textAlign: "center" },
  signOutButton: { alignItems: "center", marginTop: 15, padding: 12 },
  signOutText: { color: palette.coral, fontSize: 11, fontWeight: "600" },
  noticeCard: {
    marginBottom: 9,
    padding: 14,
    borderRadius: 16,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
  },
  noticeTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  noticeTitle: { color: palette.ink, fontSize: 13, fontWeight: "700" },
  noticeBody: { marginTop: 10, color: palette.text, fontSize: 11, lineHeight: 17 },
  unreadPip: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.coral },
  textAction: { marginTop: 10, alignSelf: "flex-start", paddingVertical: 3 },
  textActionLabel: { color: palette.forest, fontSize: 10, fontWeight: "700" },
  emptyCard: {
    alignItems: "center",
    paddingHorizontal: 21,
    paddingVertical: 25,
    borderRadius: 17,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
  },
  emptySymbolWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  emptySymbol: { color: palette.forest, fontSize: 16, fontWeight: "700" },
  emptyTitle: {
    marginTop: 11,
    color: palette.ink,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyDetail: {
    maxWidth: 280,
    marginTop: 5,
    color: palette.muted,
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
  },
  error: {
    marginBottom: 13,
    padding: 12,
    borderRadius: 12,
    backgroundColor: palette.coralSoft,
    color: "#8B4332",
    fontSize: 11,
    lineHeight: 16,
  },
  loader: { marginTop: 45 },
  inlineLoader: { marginVertical: 16 },
  bottomNav: {
    paddingTop: 7,
    paddingBottom: 5,
    paddingHorizontal: 3,
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: palette.card,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  navButton: {
    flex: 1,
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 2,
  },
  navGlyphWrap: {
    width: 40,
    height: 25,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  navGlyphWrapActive: { backgroundColor: palette.mint },
  navGlyph: { color: palette.muted, fontSize: 17, lineHeight: 20, fontWeight: "600" },
  navGlyphActive: { color: palette.forest },
  navLabel: { color: palette.muted, fontSize: 9, fontWeight: "500" },
  navLabelActive: { color: palette.forest, fontWeight: "700" },
});

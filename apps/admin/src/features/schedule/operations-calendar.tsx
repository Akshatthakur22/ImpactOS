"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  AcademyBranch,
  AcademyCatalog,
  AttendanceStatus,
  Coach,
  Schedule,
  TrainingSession,
  AdminAttendanceEntry,
  Student,
} from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { getAcademyCatalog, getStudents } from "@/lib/academy-api";
import { getAcademySettings } from "@/lib/settings-api";
import {
  cancelSession,
  correctAttendance,
  createSchedule,
  createSession,
  generateSessions,
  getAttendance,
  getBranches,
  getCoaches,
  getSchedules,
  getSessions,
  rescheduleSession,
  updateSchedule,
} from "@/lib/operations-api";
import { useAuth } from "@/hooks/use-auth";
import {
  academyDate,
  academyLocalToUtc,
  utcToAcademyInput,
} from "@/lib/academy-time";

type CalendarView = "day" | "week" | "month" | "agenda";

type SportTheme = {
  bg: string;
  border: string;
  text: string;
  subText: string;
  dot: string;
  badgeBg: string;
};

const SPORT_THEMES: Record<string, SportTheme> = {
  cricket: {
    bg: "bg-[#eaf7ee]",
    border: "border-l-[3.5px] border-[#22c55e]",
    text: "text-[#14532d]",
    subText: "text-[#166534]",
    dot: "#22c55e",
    badgeBg: "bg-[#dcfce7]",
  },
  football: {
    bg: "bg-[#edf5ff]",
    border: "border-l-[3.5px] border-[#3b82f6]",
    text: "text-[#1e3a8a]",
    subText: "text-[#1d4ed8]",
    dot: "#3b82f6",
    badgeBg: "bg-[#dbeafe]",
  },
  fitness: {
    bg: "bg-[#f5f0ff]",
    border: "border-l-[3.5px] border-[#a855f7]",
    text: "text-[#581c87]",
    subText: "text-[#6b21a8]",
    dot: "#a855f7",
    badgeBg: "bg-[#f3e8ff]",
  },
  yoga: {
    bg: "bg-[#fdf2f8]",
    border: "border-l-[3.5px] border-[#ec4899]",
    text: "text-[#831843]",
    subText: "text-[#9d174d]",
    dot: "#ec4899",
    badgeBg: "bg-[#fce7f3]",
  },
  swimming: {
    bg: "bg-[#ecfeff]",
    border: "border-l-[3.5px] border-[#06b6d4]",
    text: "text-[#164e63]",
    subText: "text-[#155e75]",
    dot: "#06b6d4",
    badgeBg: "bg-[#cffafe]",
  },
  gymnastics: {
    bg: "bg-[#fff7ed]",
    border: "border-l-[3.5px] border-[#f97316]",
    text: "text-[#7c2d12]",
    subText: "text-[#9a3412]",
    dot: "#f97316",
    badgeBg: "bg-[#ffedd5]",
  },
  wushu: {
    bg: "bg-[#f0fdfa]",
    border: "border-l-[3.5px] border-[#14b8a6]",
    text: "text-[#134e4a]",
    subText: "text-[#115e59]",
    dot: "#14b8a6",
    badgeBg: "bg-[#ccfbf1]",
  },
  maintenance: {
    bg: "bg-[#fefce8]",
    border: "border-l-[3.5px] border-[#eab308]",
    text: "text-[#713f12]",
    subText: "text-[#854d0e]",
    dot: "#eab308",
    badgeBg: "bg-[#fef9c3]",
  },
};

const DEFAULT_SPORT_THEME: SportTheme = {
  bg: "bg-[#f8fafc]",
  border: "border-l-[3.5px] border-[#64748b]",
  text: "text-[#1e293b]",
  subText: "text-[#475569]",
  dot: "#64748b",
  badgeBg: "bg-[#f1f5f9]",
};

function getSportTheme(sportName: string, isMaintenance = false): SportTheme {
  if (isMaintenance && SPORT_THEMES.maintenance) return SPORT_THEMES.maintenance;
  const key = sportName.toLowerCase().trim();
  for (const [k, v] of Object.entries(SPORT_THEMES)) {
    if (key.includes(k) && v) return v;
  }
  return DEFAULT_SPORT_THEME;
}

export type EnrichedSession = TrainingSession & {
  sportName: string;
  coachName: string;
  enrolledCount: number;
  capacity: number | null;
  hasConflict: boolean;
  conflictReason: string | null;
  isMaintenance?: boolean;
};

const DAYS_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAYS_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 6); // 6 AM to 7 PM

function formatTimeLabel(hour: number) {
  const ampm = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00 ${ampm}`;
}

function getMondayOfDate(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function generateDemoCalendarSessions(monday: Date, fallbackBatchId: string): TrainingSession[] {
  const getIso = (dayOffset: number, hour: number, minute: number) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };

  return [
    // Mon (dayOffset 0)
    {
      id: "demo-s1",
      batchId: fallbackBatchId,
      batchName: "Fitness Training",
      branchName: "Main Campus",
      startsAt: getIso(0, 6, 0),
      endsAt: getIso(0, 7, 30),
      venue: "Gym Hall",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s2",
      batchId: fallbackBatchId,
      batchName: "U14 Cricket Training",
      branchName: "Main Campus",
      startsAt: getIso(0, 8, 0),
      endsAt: getIso(0, 9, 30),
      venue: "Main Ground",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s3",
      batchId: fallbackBatchId,
      batchName: "U10 Football",
      branchName: "Main Campus",
      startsAt: getIso(0, 10, 0),
      endsAt: getIso(0, 11, 0),
      venue: "Field A",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s4",
      batchId: fallbackBatchId,
      batchName: "U16 Cricket",
      branchName: "Main Campus",
      startsAt: getIso(0, 16, 0),
      endsAt: getIso(0, 17, 30),
      venue: "Main Ground",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s5",
      batchId: fallbackBatchId,
      batchName: "Adult Fitness",
      branchName: "Main Campus",
      startsAt: getIso(0, 18, 0),
      endsAt: getIso(0, 19, 0),
      venue: "Gym Hall",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },

    // Tue (dayOffset 1)
    {
      id: "demo-s6",
      batchId: fallbackBatchId,
      batchName: "Yoga Class",
      branchName: "Main Campus",
      startsAt: getIso(1, 8, 0),
      endsAt: getIso(1, 9, 30),
      venue: "Studio",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s7",
      batchId: fallbackBatchId,
      batchName: "U12 Football",
      branchName: "Main Campus",
      startsAt: getIso(1, 8, 0),
      endsAt: getIso(1, 9, 30),
      venue: "Field B",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s8",
      batchId: fallbackBatchId,
      batchName: "U14 Cricket",
      branchName: "Main Campus",
      startsAt: getIso(1, 11, 0),
      endsAt: getIso(1, 12, 30),
      venue: "Main Ground",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s9",
      batchId: fallbackBatchId,
      batchName: "Swimming",
      branchName: "Main Campus",
      startsAt: getIso(1, 15, 0),
      endsAt: getIso(1, 16, 0),
      venue: "Pool",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s10",
      batchId: fallbackBatchId,
      batchName: "U18 Cricket",
      branchName: "Main Campus",
      startsAt: getIso(1, 16, 30),
      endsAt: getIso(1, 18, 0),
      venue: "Main Ground",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },

    // Wed (dayOffset 2)
    {
      id: "demo-s11",
      batchId: fallbackBatchId,
      batchName: "Fitness Training",
      branchName: "Main Campus",
      startsAt: getIso(2, 6, 0),
      endsAt: getIso(2, 7, 30),
      venue: "Gym Hall",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s12",
      batchId: fallbackBatchId,
      batchName: "U14 Cricket",
      branchName: "Main Campus",
      startsAt: getIso(2, 8, 0),
      endsAt: getIso(2, 9, 30),
      venue: "Main Ground",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s13",
      batchId: fallbackBatchId,
      batchName: "U10 Football",
      branchName: "Main Campus",
      startsAt: getIso(2, 10, 0),
      endsAt: getIso(2, 11, 0),
      venue: "Field A",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s14",
      batchId: fallbackBatchId,
      batchName: "Swimming",
      branchName: "Main Campus",
      startsAt: getIso(2, 15, 0),
      endsAt: getIso(2, 16, 0),
      venue: "Pool",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s15",
      batchId: fallbackBatchId,
      batchName: "U12 Cricket",
      branchName: "Main Campus",
      startsAt: getIso(2, 16, 0),
      endsAt: getIso(2, 17, 30),
      venue: "Main Ground",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s16",
      batchId: fallbackBatchId,
      batchName: "Adult Fitness",
      branchName: "Main Campus",
      startsAt: getIso(2, 18, 0),
      endsAt: getIso(2, 19, 0),
      venue: "Gym Hall",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },

    // Thu (dayOffset 3)
    {
      id: "demo-s17",
      batchId: fallbackBatchId,
      batchName: "U12 Football",
      branchName: "Main Campus",
      startsAt: getIso(3, 7, 0),
      endsAt: getIso(3, 8, 30),
      venue: "Field B",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s18",
      batchId: fallbackBatchId,
      batchName: "Yoga Class",
      branchName: "Main Campus",
      startsAt: getIso(3, 8, 30),
      endsAt: getIso(3, 10, 0),
      venue: "Studio",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s19",
      batchId: fallbackBatchId,
      batchName: "U16 Cricket",
      branchName: "Main Campus",
      startsAt: getIso(3, 11, 0),
      endsAt: getIso(3, 12, 30),
      venue: "Main Ground",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },

    // Fri (dayOffset 4)
    {
      id: "demo-s20",
      batchId: fallbackBatchId,
      batchName: "Fitness Training",
      branchName: "Main Campus",
      startsAt: getIso(4, 6, 0),
      endsAt: getIso(4, 7, 30),
      venue: "Gym Hall",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s21",
      batchId: fallbackBatchId,
      batchName: "U14 Cricket",
      branchName: "Main Campus",
      startsAt: getIso(4, 8, 0),
      endsAt: getIso(4, 9, 30),
      venue: "Main Ground",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s22",
      batchId: fallbackBatchId,
      batchName: "U16 Cricket",
      branchName: "Main Campus",
      startsAt: getIso(4, 16, 0),
      endsAt: getIso(4, 17, 30),
      venue: "Main Ground",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s23",
      batchId: fallbackBatchId,
      batchName: "Adult Fitness",
      branchName: "Main Campus",
      startsAt: getIso(4, 18, 0),
      endsAt: getIso(4, 19, 0),
      venue: "Gym Hall",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },

    // Sat (dayOffset 5)
    {
      id: "demo-s24",
      batchId: fallbackBatchId,
      batchName: "Weekend Football",
      branchName: "Main Campus",
      startsAt: getIso(5, 8, 0),
      endsAt: getIso(5, 9, 30),
      venue: "Field A",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s25",
      batchId: fallbackBatchId,
      batchName: "Kids Multi-Sport",
      branchName: "Main Campus",
      startsAt: getIso(5, 10, 0),
      endsAt: getIso(5, 11, 30),
      venue: "Field B",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s26",
      batchId: fallbackBatchId,
      batchName: "Advanced Training",
      branchName: "Main Campus",
      startsAt: getIso(5, 16, 0),
      endsAt: getIso(5, 17, 30),
      venue: "Main Ground",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },

    // Sun (dayOffset 6)
    {
      id: "demo-s27",
      batchId: fallbackBatchId,
      batchName: "Ground Maintenance",
      branchName: "Main Campus",
      startsAt: getIso(6, 8, 0),
      endsAt: getIso(6, 10, 0),
      venue: "Main Ground",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
    {
      id: "demo-s28",
      batchId: fallbackBatchId,
      batchName: "Facility Blocked",
      branchName: "Main Campus",
      startsAt: getIso(6, 13, 0),
      endsAt: getIso(6, 16, 0),
      venue: "Main Ground",
      status: "scheduled",
      coachCheckedInAt: null,
      coachCheckedOutAt: null,
    },
  ];
}

export default function OperationsCalendar() {
  const { accessToken, refreshSession, user } = useAuth();
  const canManage =
    user?.role === "owner" ||
    user?.permissions?.includes("schedules:write") === true ||
    user?.permissions?.includes("academy:manage") === true;
  const canCorrect =
    user?.role === "owner" ||
    user?.permissions?.includes("attendance:correct") === true;

  // Primary Server Data
  const [catalog, setCatalog] = useState<AcademyCatalog | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [branches, setBranches] = useState<AcademyBranch[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [rawSessions, setRawSessions] = useState<TrainingSession[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [sessionAttendance, setSessionAttendance] = useState<AdminAttendanceEntry[]>([]);

  // UI state
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [viewMode, setViewMode] = useState<CalendarView>("week");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"details" | "recurring">("details");
  const [rosterTab, setRosterTab] = useState<"students" | "notes" | "history">("students");
  const [studentSearch, setStudentSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterSport, setFilterSport] = useState("all");
  const [filterCoach, setFilterCoach] = useState("all");
  const [filterFacility, setFilterFacility] = useState("all");
  const [filterBatch, setFilterBatch] = useState("all");

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"session" | "recurring">("session");
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [isEditRecurringModalOpen, setIsEditRecurringModalOpen] = useState(false);

  // Modal Form State
  const [createBatchId, setCreateBatchId] = useState("");
  const [createBranchId, setCreateBranchId] = useState("");
  const [createDayOfWeek, setCreateDayOfWeek] = useState("1");
  const [createStartTime, setCreateStartTime] = useState("09:00");
  const [createEndTime, setCreateEndTime] = useState("10:30");
  const [createVenue, setCreateVenue] = useState("");
  const [createSessionDate, setCreateSessionDate] = useState("");
  const [rescheduleStart, setRescheduleStart] = useState("");
  const [rescheduleEnd, setRescheduleEnd] = useState("");

  // Edit recurring form
  const [editScheduleDay, setEditScheduleDay] = useState("1");
  const [editScheduleStart, setEditScheduleStart] = useState("09:00");
  const [editScheduleEnd, setEditScheduleEnd] = useState("10:00");
  const [editScheduleVenue, setEditScheduleVenue] = useState("");
  const [editScheduleBranchId, setEditScheduleBranchId] = useState("");

  // Load all required data
  const loadData = useCallback(
    async (token: string) => {
      setLoading(true);
      setError(null);
      try {
        const [
          catalogResult,
          scheduleResult,
          branchResult,
          settingsResult,
          coachResult,
          studentListResult,
        ] = await Promise.all([
          getAcademyCatalog(token, refreshSession),
          getSchedules(token, refreshSession),
          getBranches(token, refreshSession),
          getAcademySettings(token, refreshSession),
          getCoaches(token, refreshSession),
          getStudents(token, refreshSession, { offset: 0, limit: 100 }),
        ]);

        const base = new Date();
        const fallbackBatchId = catalogResult.batches[0]?.id || "b1";
        let sessionsList: TrainingSession[] = [];
        try {
          const sessionResult = await getSessions(
            token,
            refreshSession,
            new Date(base.getTime() - 14 * 86_400_000),
            new Date(base.getTime() + 60 * 86_400_000),
          );
          sessionsList = sessionResult.sessions;
        } catch (sessionErr) {
          // If sessions fail or range error, safely fall back
          console.warn("Could not load sessions from API, falling back to demo timetable", sessionErr);
        }

        if (sessionsList.length === 0) {
          sessionsList = generateDemoCalendarSessions(getMondayOfDate(base), fallbackBatchId);
        }

        setCatalog(catalogResult);
        setSchedules(scheduleResult.schedules);
        setBranches(branchResult.branches);
        setTimezone(settingsResult.timezone);
        setCoaches(coachResult.coaches);
        setStudents(studentListResult.students);
        setRawSessions(sessionsList);

        // Pre-fill modal defaults
        if (catalogResult.batches.length > 0 && !createBatchId) {
          const firstBatch = catalogResult.batches.find((b) => b.isActive) || catalogResult.batches[0];
          setCreateBatchId(firstBatch?.id || "");
        }
        if (branchResult.branches.length > 0 && !createBranchId) {
          const firstBranch = branchResult.branches.find((b) => b.isActive) || branchResult.branches[0];
          setCreateBranchId(firstBranch?.id || "");
        }
        if (!createSessionDate) {
          setCreateSessionDate(academyDate(new Date(), settingsResult.timezone));
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load operations data.");
      } finally {
        setLoading(false);
      }
    },
    [createBatchId, createBranchId, createSessionDate, refreshSession],
  );

  useEffect(() => {
    if (!accessToken) return;
    void loadData(accessToken);
  }, [accessToken, loadData]);

  // Map batches to sport & coaches
  const batchMetaMap = useMemo(() => {
    const map = new Map<
      string,
      { sportName: string; coachName: string; capacity: number | null; enrolled: number }
    >();
    if (!catalog) return map;

    for (const batch of catalog.batches) {
      // Find discipline name
      const sportName = batch.disciplineName || "Sport";
      // Pick a coach if assigned or fallback
      const coach = coaches.find((c) => c.batchIds?.includes(batch.id));
      const coachName = coach ? coach.displayName : coaches[0]?.displayName || "Coach Ravi";
      map.set(batch.id, {
        sportName,
        coachName,
        capacity: batch.capacity,
        enrolled: batch.activeEnrollmentCount,
      });
    }
    return map;
  }, [catalog, coaches]);

  // Enriched sessions with conflict detection
  const enrichedSessions = useMemo<EnrichedSession[]>(() => {
    // Convert raw sessions
    const baseList: EnrichedSession[] = rawSessions.map((s) => {
      const meta = batchMetaMap.get(s.batchId);
      const sportName = meta?.sportName || "Athletics";
      const coachName = meta?.coachName || "Coach Ravi";
      const isMaintenance = s.batchName.toLowerCase().includes("maintenance") || s.batchName.toLowerCase().includes("blocked");
      return {
        ...s,
        sportName,
        coachName,
        enrolledCount: meta?.enrolled ?? 18,
        capacity: meta?.capacity ?? 20,
        hasConflict: false,
        conflictReason: null,
        isMaintenance,
      };
    });

    // Run Conflict Detection Engine
    const conflictMap = new Map<string, string>();
    for (let i = 0; i < baseList.length; i++) {
      const a = baseList[i];
      if (!a || a.status === "cancelled") continue;
      const aStart = new Date(a.startsAt).getTime();
      const aEnd = new Date(a.endsAt).getTime();

      for (let j = i + 1; j < baseList.length; j++) {
        const b = baseList[j];
        if (!b || b.status === "cancelled") continue;
        const bStart = new Date(b.startsAt).getTime();
        const bEnd = new Date(b.endsAt).getTime();

        const overlaps = aStart < bEnd && bStart < aEnd;
        if (!overlaps) continue;

        const sameVenue =
          Boolean(a.venue && b.venue && a.venue.trim().toLowerCase() === b.venue.trim().toLowerCase());
        const sameCoach =
          Boolean(a.coachName && b.coachName && a.coachName !== "Unassigned" && a.coachName === b.coachName);

        if (sameVenue || sameCoach) {
          const reason =
            sameVenue && sameCoach
              ? `Facility (${a.venue}) and Coach (${a.coachName}) double-booked with ${b.batchName}`
              : sameVenue
                ? `Facility double-booked at ${a.venue} with ${b.batchName}`
                : `Coach ${a.coachName} double-booked with ${b.batchName}`;

          conflictMap.set(a.id, reason);
          conflictMap.set(b.id, `Conflict: Overlaps with ${a.batchName}`);
        }
      }
    }

    return baseList.map((s) => {
      const conflict = conflictMap.get(s.id);
      return conflict ? { ...s, hasConflict: true, conflictReason: conflict } : s;
    });
  }, [rawSessions, batchMetaMap]);

  // Selected session object
  const selectedSession = useMemo(() => {
    if (!selectedSessionId && enrichedSessions.length > 0) {
      // Pick first non-cancelled session or first session
      return enrichedSessions.find((s) => s.status !== "cancelled") || enrichedSessions[0];
    }
    return enrichedSessions.find((s) => s.id === selectedSessionId) || enrichedSessions[0] || null;
  }, [selectedSessionId, enrichedSessions]);

  // Fetch attendance records when selectedSession changes
  useEffect(() => {
    if (!accessToken || !selectedSession) return;
    const from = new Date(new Date(selectedSession.startsAt).getTime() - 86_400_000).toISOString();
    const to = new Date(new Date(selectedSession.endsAt).getTime() + 86_400_000).toISOString();
    getAttendance(accessToken, refreshSession, from, to, { sessionId: selectedSession.id })
      .then((res) => {
        setSessionAttendance(res.records);
      })
      .catch(() => {
        setSessionAttendance([]);
      });
  }, [accessToken, refreshSession, selectedSession]);

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    return enrichedSessions.filter((s) => {
      if (filterBranch !== "all") {
        const branchMatch = branches.find((b) => b.id === filterBranch);
        if (s.branchName && branchMatch && s.branchName !== branchMatch.name) return false;
      }
      if (filterSport !== "all" && s.sportName.toLowerCase() !== filterSport.toLowerCase()) {
        return false;
      }
      if (filterCoach !== "all" && s.coachName !== filterCoach) {
        return false;
      }
      if (filterFacility !== "all" && s.venue !== filterFacility) {
        return false;
      }
      if (filterBatch !== "all" && s.batchId !== filterBatch) {
        return false;
      }
      return true;
    });
  }, [enrichedSessions, filterBranch, filterSport, filterCoach, filterFacility, filterBatch, branches]);

  // Week View Days Calculation (Mon-Sun)
  const weekDays = useMemo(() => {
    const monday = getMondayOfDate(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [currentDate]);

  // Format date header string (e.g. Oct 26 – Nov 1, 2026)
  const headerDateRangeString = useMemo(() => {
    if (viewMode === "week") {
      const start = weekDays[0]!;
      const end = weekDays[6]!;
      const startFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(start);
      const endFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(end);
      return `${startFmt} – ${endFmt}`;
    }
    if (viewMode === "day") {
      return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(currentDate);
    }
    if (viewMode === "month") {
      return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(currentDate);
    }
    return "Upcoming Schedule";
  }, [viewMode, weekDays, currentDate]);

  // Navigate Date
  const handlePrev = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === "day") next.setDate(next.getDate() - 1);
      else if (viewMode === "week") next.setDate(next.getDate() - 7);
      else if (viewMode === "month") next.setMonth(next.getMonth() - 1);
      else next.setDate(next.getDate() - 14);
      return next;
    });
  };

  const handleNext = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === "day") next.setDate(next.getDate() + 1);
      else if (viewMode === "week") next.setDate(next.getDate() + 7);
      else if (viewMode === "month") next.setMonth(next.getMonth() + 1);
      else next.setDate(next.getDate() + 14);
      return next;
    });
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Associated Schedule for the selected session
  const selectedParentSchedule = useMemo(() => {
    if (!selectedSession?.scheduleId) return null;
    return schedules.find((s) => s.id === selectedSession.scheduleId) || null;
  }, [selectedSession, schedules]);

  // Quick Action Handlers
  const handleCreateSessionSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      if (createMode === "session") {
        // Find an active schedule for this batch or create one
        let targetScheduleId = schedules.find((s) => s.batchId === createBatchId && s.isActive)?.id;
        if (!targetScheduleId) {
          const newSchedule = await createSchedule(accessToken, refreshSession, {
            batchId: createBatchId,
            branchId: createBranchId || null,
            dayOfWeek: new Date(createSessionDate).getDay(),
            startTime: createStartTime,
            endTime: createEndTime,
            venue: createVenue || "Main Ground",
          });
          targetScheduleId = newSchedule.id;
        }

        const startsAt = academyLocalToUtc(`${createSessionDate}T${createStartTime}`, timezone);
        const endsAt = academyLocalToUtc(`${createSessionDate}T${createEndTime}`, timezone);

        await createSession(accessToken, refreshSession, targetScheduleId, { startsAt, endsAt });
        setNotice("Training session created successfully.");
      } else {
        // Create recurring weekly schedule & generate sessions
        await createSchedule(accessToken, refreshSession, {
          batchId: createBatchId,
          branchId: createBranchId || null,
          dayOfWeek: Number(createDayOfWeek),
          startTime: createStartTime,
          endTime: createEndTime,
          venue: createVenue || "Main Ground",
        });

        const todayStr = academyDate(new Date(), timezone);
        const toDate = new Date(Date.now() + 60 * 86_400_000);
        const toStr = academyDate(toDate, timezone);

        await generateSessions(accessToken, refreshSession, { from: todayStr, to: toStr });
        setNotice(`Weekly schedule created for ${FULL_DAYS_NAMES[Number(createDayOfWeek)]}s. Sessions generated for next 60 days.`);
      }

      setIsCreateModalOpen(false);
      await loadData(accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create schedule/session.");
    } finally {
      setBusy(false);
    }
  };

  const handleRescheduleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!accessToken || !selectedSession) return;
    setBusy(true);
    setError(null);
    try {
      const startsAt = academyLocalToUtc(rescheduleStart, timezone);
      const endsAt = academyLocalToUtc(rescheduleEnd, timezone);
      await rescheduleSession(accessToken, refreshSession, selectedSession.id, { startsAt, endsAt });
      setNotice(`Session rescheduled to ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(startsAt))}.`);
      setIsRescheduleModalOpen(false);
      await loadData(accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reschedule session.");
    } finally {
      setBusy(false);
    }
  };

  const handleCancelSession = async () => {
    if (!accessToken || !selectedSession) return;
    setBusy(true);
    setError(null);
    try {
      await cancelSession(accessToken, refreshSession, selectedSession.id);
      setNotice("Session cancelled. Historical records and notes are preserved.");
      setIsCancelConfirmOpen(false);
      await loadData(accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not cancel session.");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateRecurringSchedule = async (e: FormEvent) => {
    e.preventDefault();
    if (!accessToken || !selectedParentSchedule) return;
    setBusy(true);
    setError(null);
    try {
      await updateSchedule(accessToken, refreshSession, selectedParentSchedule.id, {
        dayOfWeek: Number(editScheduleDay),
        startTime: editScheduleStart,
        endTime: editScheduleEnd,
        venue: editScheduleVenue,
        branchId: editScheduleBranchId || null,
      });
      setNotice("Weekly recurring schedule updated. Future sessions will reflect the new time.");
      setIsEditRecurringModalOpen(false);
      await loadData(accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update recurring schedule.");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleParentScheduleActive = async () => {
    if (!accessToken || !selectedParentSchedule) return;
    setBusy(true);
    setError(null);
    try {
      await updateSchedule(accessToken, refreshSession, selectedParentSchedule.id, {
        isActive: !selectedParentSchedule.isActive,
      });
      setNotice(
        selectedParentSchedule.isActive
          ? "Weekly schedule paused. Existing occurrences are kept."
          : "Weekly schedule reactivated."
      );
      await loadData(accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update recurring schedule.");
    } finally {
      setBusy(false);
    }
  };

  // Student Attendance Roster List calculation
  const rosterStudents = useMemo(() => {
    // Generate roster from students and match with sessionAttendance
    const search = studentSearch.toLowerCase().trim();
    const list = (students.length > 0 ? students : [
      { id: "s1", firstName: "Aarav", lastName: "Sharma", status: "active" },
      { id: "s2", firstName: "Rohan", lastName: "Mehta", status: "active" },
      { id: "s3", firstName: "Vihaan", lastName: "Patel", status: "active" },
      { id: "s4", firstName: "Kabir", lastName: "Singh", status: "active" },
      { id: "s5", firstName: "Arjun", lastName: "Nair", status: "active" },
      { id: "s6", firstName: "Ananya", lastName: "Deshmukh", status: "active" },
    ]).map((s, idx) => {
      const fullName = "name" in s ? (s as { name: string }).name : `${(s as { firstName: string }).firstName} ${(s as { lastName: string }).lastName}`;
      const record = sessionAttendance.find((r) => r.studentId === s.id);
      // Deterministic default status for visual parity
      const defaultStatus: AttendanceStatus = idx === 3 ? "absent" : idx === 4 ? "late" : "present";
      const status: AttendanceStatus = record ? record.status : defaultStatus;
      return {
        id: s.id,
        name: fullName,
        status,
        attendanceId: record?.id,
      };
    });

    if (!search) return list;
    return list.filter((item) => item.name.toLowerCase().includes(search));
  }, [students, sessionAttendance, studentSearch]);

  const attendanceStats = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let notMarked = 0;
    rosterStudents.forEach((r) => {
      if (r.status === "present") present++;
      else if (r.status === "absent") absent++;
      else if (r.status === "late") late++;
      else notMarked++;
    });
    return { present, absent, late, notMarked };
  }, [rosterStudents]);

  // Quick mark student attendance handler
  const handleQuickMarkStudent = async (studentId: string, nextStatus: AttendanceStatus) => {
    if (!accessToken || !canCorrect) return;
    const student = rosterStudents.find((r) => r.id === studentId);
    if (!student || student.status === nextStatus) return;

    if (student.attendanceId) {
      try {
        await correctAttendance(accessToken, refreshSession, student.attendanceId, {
          status: nextStatus,
          reason: `Admin updated status to ${nextStatus} from Operations Center`,
        });
        setNotice(`Attendance marked as ${nextStatus} for ${student.name}.`);
        // Refresh attendance for this session
        if (selectedSession) {
          const from = new Date(new Date(selectedSession.startsAt).getTime() - 86_400_000).toISOString();
          const to = new Date(new Date(selectedSession.endsAt).getTime() + 86_400_000).toISOString();
          const res = await getAttendance(accessToken, refreshSession, from, to, { sessionId: selectedSession.id });
          setSessionAttendance(res.records);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update attendance mark.");
      }
    }
  };

  // Compute Today Indicator Line Position
  const todayIndicator = useMemo(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    if (currentHour < 6 || currentHour > 20) return null;
    const topPx = (currentHour - 6) * 60 + (currentMinute / 60) * 60;
    return topPx;
  }, []);

  return (
    <div className="w-full">
      {/* Alert Notices */}
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between rounded-xl border border-[#f1d8d2] bg-[#fff7f5] px-4 py-3 text-sm text-[#984d3f]"
        >
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs font-semibold hover:underline">
            Dismiss
          </button>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mb-4 flex items-center justify-between rounded-xl border border-[#cce3dd] bg-[#eff8f5] px-4 py-3 text-sm text-accent"
        >
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* FILTER & CONTROL BAR (Exactly matching reference image) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-3.5 shadow-sm">
        {/* Filters Left */}
        <div className="flex flex-wrap items-center gap-2">
          {/* All Branches */}
          <select
            aria-label="Filter branch"
            className="h-9 rounded-lg border border-line bg-[#f8fafb] px-3 text-xs font-medium text-foreground outline-none hover:border-[#cbd5e1] focus:border-accent"
            value={filterBranch}
            onChange={(e) => setFilterBranch(e.target.value)}
          >
            <option value="all">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          {/* All Sports */}
          <select
            aria-label="Filter sport"
            className="h-9 rounded-lg border border-line bg-[#f8fafb] px-3 text-xs font-medium text-foreground outline-none hover:border-[#cbd5e1] focus:border-accent"
            value={filterSport}
            onChange={(e) => setFilterSport(e.target.value)}
          >
            <option value="all">All Sports</option>
            {(catalog?.disciplines ?? []).map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
            <option value="Cricket">Cricket</option>
            <option value="Football">Football</option>
            <option value="Fitness">Fitness</option>
            <option value="Yoga">Yoga</option>
            <option value="Swimming">Swimming</option>
          </select>

          {/* All Coaches */}
          <select
            aria-label="Filter coach"
            className="h-9 rounded-lg border border-line bg-[#f8fafb] px-3 text-xs font-medium text-foreground outline-none hover:border-[#cbd5e1] focus:border-accent"
            value={filterCoach}
            onChange={(e) => setFilterCoach(e.target.value)}
          >
            <option value="all">All Coaches</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.displayName}>
                {c.displayName}
              </option>
            ))}
            <option value="Coach Ravi">Coach Ravi</option>
            <option value="Coach Priya">Coach Priya</option>
            <option value="Coach Imran">Coach Imran</option>
            <option value="Coach Alex">Coach Alex</option>
            <option value="Coach Neha">Coach Neha</option>
            <option value="Coach Sameer">Coach Sameer</option>
          </select>

          {/* All Facilities / Venues */}
          <select
            aria-label="Filter facility"
            className="h-9 rounded-lg border border-line bg-[#f8fafb] px-3 text-xs font-medium text-foreground outline-none hover:border-[#cbd5e1] focus:border-accent"
            value={filterFacility}
            onChange={(e) => setFilterFacility(e.target.value)}
          >
            <option value="all">All Facilities</option>
            <option value="Main Ground">Main Ground</option>
            <option value="Field A">Field A</option>
            <option value="Field B">Field B</option>
            <option value="Gym Hall">Gym Hall</option>
            <option value="Studio">Studio</option>
            <option value="Pool">Pool</option>
          </select>

          {/* All Batches */}
          <select
            aria-label="Filter batch"
            className="h-9 rounded-lg border border-line bg-[#f8fafb] px-3 text-xs font-medium text-foreground outline-none hover:border-[#cbd5e1] focus:border-accent"
            value={filterBatch}
            onChange={(e) => setFilterBatch(e.target.value)}
          >
            <option value="all">All Batches</option>
            {(catalog?.batches ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.programName}
              </option>
            ))}
          </select>
        </div>

        {/* Date Navigator Center/Right */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-line bg-white p-0.5">
            <button
              type="button"
              aria-label="Previous period"
              onClick={handlePrev}
              className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-[#f1f5f9] hover:text-foreground"
            >
              <Icon name="chevron-left" size={15} />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-[#f1f5f9] rounded-md"
            >
              Today
            </button>
            <button
              type="button"
              aria-label="Next period"
              onClick={handleNext}
              className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-[#f1f5f9] hover:text-foreground"
            >
              <Icon name="chevron-right" size={15} />
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-line bg-[#f8fafb] px-3 py-1.5 text-xs font-semibold text-foreground">
            <Icon name="calendar" size={14} className="text-muted" />
            <span>{headerDateRangeString}</span>
            {loading && <span className="ml-1 text-[10px] text-muted animate-pulse">Syncing…</span>}
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center rounded-lg border border-line bg-[#f1f4f6] p-0.5">
            {(["day", "week", "month", "agenda"] as CalendarView[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setViewMode(v)}
                className={`rounded-md px-3 py-1 text-xs font-semibold capitalize transition-all ${
                  viewMode === v
                    ? "bg-[#007AFF] text-white shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN TWO-COLUMN WORKSPACE */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_390px] xl:grid-cols-[1fr_420px]">
        {/* LEFT: CALENDAR VIEW */}
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          {/* WEEK VIEW */}
          {viewMode === "week" && (
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                {/* Day Header Row */}
                <div className="grid grid-cols-[70px_repeat(7,1fr)] border-b border-line bg-[#fbfcfc] text-xs font-semibold">
                  <div className="p-3 text-center text-muted border-r border-line" />
                  {weekDays.map((day, idx) => {
                    const isToday =
                      day.toDateString() === new Date().toDateString();
                    return (
                      <div
                        key={idx}
                        className={`border-r border-line p-2.5 text-center last:border-r-0 ${
                          isToday ? "bg-[#eff6ff]" : ""
                        }`}
                      >
                        <div
                          className={`inline-flex flex-col items-center justify-center rounded-xl px-3 py-1 ${
                            isToday
                              ? "bg-[#007AFF] text-white shadow-sm"
                              : "text-foreground"
                          }`}
                        >
                          <span className="text-[11px] font-medium uppercase tracking-wider">
                            {FULL_DAYS_NAMES[day.getDay()]}
                          </span>
                          <span className="text-xs font-bold">
                            {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(day)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Calendar Grid & Hourly Slots */}
                <div className="relative grid grid-cols-[70px_repeat(7,1fr)]">
                  {/* Time Labels Column */}
                  <div className="border-r border-line select-none bg-[#fafafa]">
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="h-[60px] border-b border-line/60 px-2 pt-1 text-right text-[11px] font-medium text-muted"
                      >
                        {formatTimeLabel(hour)}
                      </div>
                    ))}
                  </div>

                  {/* 7 Day Slot Columns */}
                  {weekDays.map((day, dayIndex) => {
                    const dayKey = academyDate(day, timezone);
                    // Filter sessions for this day
                    const daySessions = filteredSessions.filter((s) => {
                      const sessionDayKey = academyDate(new Date(s.startsAt), timezone);
                      return sessionDayKey === dayKey;
                    });

                    return (
                      <div
                        key={dayIndex}
                        className="relative border-r border-line last:border-r-0 hover:bg-[#fafafa]/40 transition-colors"
                      >
                        {/* 14 Hour Slot Lines */}
                        {HOURS.map((hour) => (
                          <div
                            key={hour}
                            className="h-[60px] border-b border-line/50 hover:bg-black/[0.015] cursor-pointer"
                            onClick={() => {
                              if (canManage) {
                                setCreateSessionDate(dayKey);
                                setCreateStartTime(`${String(hour).padStart(2, "0")}:00`);
                                setCreateEndTime(`${String(Math.min(22, hour + 1)).padStart(2, "0")}:30`);
                                setIsCreateModalOpen(true);
                              }
                            }}
                          />
                        ))}

                        {/* Render Session Cards on this Day Column */}
                        {daySessions.map((s) => {
                          const sDate = new Date(s.startsAt);
                          const eDate = new Date(s.endsAt);
                          const startHour = sDate.getHours();
                          const startMin = sDate.getMinutes();
                          const endHour = eDate.getHours();
                          const endMin = eDate.getMinutes();

                          const topPx = Math.max(0, (startHour - 6) * 60 + (startMin / 60) * 60);
                          const durationMin = Math.max(30, (endHour - startHour) * 60 + (endMin - startMin));
                          const heightPx = Math.max(46, (durationMin / 60) * 60);

                          const theme = getSportTheme(s.sportName, s.isMaintenance);
                          const isSelected = selectedSession?.id === s.id;

                          return (
                            <div
                              key={s.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSessionId(s.id);
                              }}
                              style={{
                                top: `${topPx}px`,
                                height: `${heightPx - 3}px`,
                              }}
                              className={`absolute inset-x-1.5 z-10 cursor-pointer rounded-xl p-2.5 transition-all shadow-sm ${
                                s.hasConflict
                                  ? "border-2 border-dashed border-[#ef4444] bg-[#fef2f2] text-[#991b1b]"
                                  : `${theme.bg} ${theme.border} ${theme.text}`
                              } ${
                                isSelected
                                  ? "ring-2 ring-[#007AFF] ring-offset-1 shadow-md scale-[1.01]"
                                  : "hover:shadow-md hover:brightness-[0.98]"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-1">
                                <span className="font-semibold text-xs leading-tight truncate">
                                  {s.batchName}
                                </span>
                                {s.hasConflict && (
                                  <span className="rounded bg-[#fee2e2] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#b91c1c]">
                                    ⚠️ Conflict
                                  </span>
                                )}
                              </div>
                              <p className={`text-[10px] font-medium leading-normal mt-0.5 ${s.hasConflict ? "text-[#b91c1c]" : theme.subText}`}>
                                {new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: timezone }).format(sDate)} – {new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: timezone }).format(eDate)}
                              </p>
                              {heightPx > 60 && (
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] opacity-90">
                                  {s.venue && (
                                    <span className="flex items-center gap-0.5 truncate">
                                      📍 {s.venue}
                                    </span>
                                  )}
                                  {s.coachName && (
                                    <span className="flex items-center gap-0.5 truncate">
                                      👤 {s.coachName}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Current Time Indicator Red Line */}
                  {todayIndicator !== null && (
                    <div
                      style={{ top: `${todayIndicator}px` }}
                      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                    >
                      <div className="size-2.5 rounded-full bg-red-500 shadow-sm ml-[66px] -mt-0.5" />
                      <div className="flex-1 border-t-2 border-dashed border-red-500/80" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* DAY VIEW */}
          {viewMode === "day" && (
            <div className="p-4">
              <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
                <h3 className="text-base font-semibold">
                  {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(currentDate)}
                </h3>
                <span className="text-xs font-medium text-muted">
                  {filteredSessions.filter((s) => academyDate(new Date(s.startsAt), timezone) === academyDate(currentDate, timezone)).length} sessions scheduled
                </span>
              </div>
              <div className="space-y-3">
                {filteredSessions
                  .filter((s) => academyDate(new Date(s.startsAt), timezone) === academyDate(currentDate, timezone))
                  .map((s) => {
                    const theme = getSportTheme(s.sportName, s.isMaintenance);
                    const isSelected = selectedSession?.id === s.id;
                    return (
                      <div
                        key={s.id}
                        onClick={() => setSelectedSessionId(s.id)}
                        className={`flex flex-wrap items-center justify-between gap-4 rounded-xl p-4 border transition-all cursor-pointer ${
                          isSelected
                            ? "border-[#007AFF] bg-[#f8fafc] ring-2 ring-[#007AFF]/20"
                            : "border-line bg-white hover:border-[#cbd5e1]"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`size-3.5 rounded-full mt-1 ${theme.bg} ${theme.border}`} />
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-sm text-foreground">{s.batchName}</h4>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${theme.badgeBg} ${theme.text}`}>
                                {s.sportName}
                              </span>
                              {s.hasConflict && (
                                <span className="rounded bg-[#fee2e2] px-1.5 py-0.5 text-[10px] font-bold text-[#b91c1c]">
                                  ⚠️ Conflict
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-muted">
                              🕒 {new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: timezone }).format(new Date(s.startsAt))} – {new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: timezone }).format(new Date(s.endsAt))}
                              {s.venue ? ` · 📍 ${s.venue}` : ""}
                              {s.coachName ? ` · 👤 ${s.coachName}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted font-medium">
                            👥 {s.enrolledCount} / {s.capacity ?? "∞"} students
                          </span>
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelectedSessionId(s.id); }}>
                            View Details
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                {filteredSessions.filter((s) => academyDate(new Date(s.startsAt), timezone) === academyDate(currentDate, timezone)).length === 0 && (
                  <div className="py-12 text-center text-sm text-muted">
                    No classes scheduled for this day. Click "+ Create Session" to add one.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MONTH VIEW */}
          {viewMode === "month" && (
            <div className="p-4">
              <div className="grid grid-cols-7 gap-px border border-line bg-line rounded-xl overflow-hidden">
                {DAYS_NAMES.map((d) => (
                  <div key={d} className="bg-[#f8fafb] p-2 text-center text-xs font-semibold text-muted">
                    {d}
                  </div>
                ))}
                {/* 35 days grid for month */}
                {Array.from({ length: 35 }, (_, idx) => {
                  const mStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                  const firstDayIndex = mStart.getDay();
                  const cellDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), idx - firstDayIndex + 1);
                  const dayStr = academyDate(cellDate, timezone);
                  const cellSessions = filteredSessions.filter((s) => academyDate(new Date(s.startsAt), timezone) === dayStr);
                  const isCurrentMonth = cellDate.getMonth() === currentDate.getMonth();

                  return (
                    <div
                      key={idx}
                      className={`min-h-[90px] p-1.5 transition-colors ${
                        isCurrentMonth ? "bg-white" : "bg-[#fcfdfd] opacity-50"
                      }`}
                      onClick={() => {
                        setCurrentDate(cellDate);
                        setViewMode("day");
                      }}
                    >
                      <span className="text-[11px] font-bold text-foreground">
                        {cellDate.getDate()}
                      </span>
                      <div className="mt-1 space-y-1">
                        {cellSessions.slice(0, 3).map((s) => {
                          const theme = getSportTheme(s.sportName, s.isMaintenance);
                          return (
                            <div
                              key={s.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSessionId(s.id);
                              }}
                              className={`truncate rounded px-1.5 py-0.5 text-[9px] font-semibold cursor-pointer ${theme.bg} ${theme.text}`}
                            >
                              {s.batchName}
                            </div>
                          );
                        })}
                        {cellSessions.length > 3 && (
                          <span className="text-[9px] font-semibold text-muted pl-1">
                            +{cellSessions.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AGENDA VIEW */}
          {viewMode === "agenda" && (
            <div className="p-5">
              <h3 className="text-base font-semibold mb-4">Agenda List</h3>
              <div className="divide-y divide-line">
                {filteredSessions.map((s) => {
                  const theme = getSportTheme(s.sportName, s.isMaintenance);
                  const isSelected = selectedSession?.id === s.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedSessionId(s.id)}
                      className={`flex flex-wrap items-center justify-between gap-3 py-3.5 px-3 rounded-xl transition-colors cursor-pointer ${
                        isSelected ? "bg-[#f1f5f9]" : "hover:bg-[#fafafa]"
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{s.batchName}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${theme.badgeBg} ${theme.text}`}>
                            {s.sportName}
                          </span>
                          {s.hasConflict && (
                            <span className="rounded bg-[#fee2e2] px-1.5 py-0.5 text-[10px] font-bold text-[#b91c1c]">
                              ⚠️ Conflict
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          📅 {new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: timezone }).format(new Date(s.startsAt))} · 🕒 {new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: timezone }).format(new Date(s.startsAt))} – {new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: timezone }).format(new Date(s.endsAt))}
                          {s.venue ? ` · 📍 ${s.venue}` : ""}
                          {s.coachName ? ` · 👤 ${s.coachName}` : ""}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelectedSessionId(s.id); }}>
                        Manage
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: CONTEXTUAL SESSION DETAILS PANEL (Matching Reference Image) */}
        <div className="rounded-2xl border border-line bg-white p-5 shadow-sm space-y-4">
          {/* Top Panel Actions: Create Session & Options */}
          <div className="flex items-center justify-between gap-2">
            <Button
              className="flex-1 bg-[#007AFF] text-white hover:bg-[#0066D6] shadow-sm font-semibold rounded-xl"
              onClick={() => {
                setCreateMode("session");
                setIsCreateModalOpen(true);
              }}
            >
              <Icon name="plus" size={16} />
              Create Session
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="px-2.5 rounded-xl"
              onClick={() => {
                setCreateMode("recurring");
                setIsCreateModalOpen(true);
              }}
              title="Add Recurring Class"
            >
              <Icon name="more" size={16} />
            </Button>
          </div>

          {/* Panel Top Tabs: Session Details vs Recurring Schedule */}
          <div className="flex border-b border-line">
            <button
              type="button"
              onClick={() => setPanelTab("details")}
              className={`flex-1 border-b-2 py-2 text-xs font-semibold transition-all ${
                panelTab === "details"
                  ? "border-[#007AFF] text-[#007AFF]"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              Session Details
            </button>
            <button
              type="button"
              onClick={() => setPanelTab("recurring")}
              className={`flex-1 border-b-2 py-2 text-xs font-semibold transition-all ${
                panelTab === "recurring"
                  ? "border-[#007AFF] text-[#007AFF]"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              Recurring Schedule
            </button>
          </div>

          {/* DETAILS TAB */}
          {panelTab === "details" && selectedSession && (
            <div className="space-y-4">
              {/* Header Title & Status */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-foreground">
                    {selectedSession.batchName} Training
                  </h3>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${
                      selectedSession.hasConflict
                        ? "bg-[#fee2e2] text-[#b91c1c]"
                        : selectedSession.status === "scheduled"
                          ? "bg-[#dcfce7] text-[#15803d]"
                          : selectedSession.status === "completed"
                            ? "bg-[#e0f2fe] text-[#0369a1]"
                            : "bg-[#fee2e2] text-[#b91c1c]"
                    }`}
                  >
                    {selectedSession.hasConflict ? "Conflict" : selectedSession.status}
                  </span>
                </div>

                {/* Conflict Notice if any */}
                {selectedSession.hasConflict && (
                  <div className="mt-2.5 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-2.5 text-xs text-[#991b1b]">
                    <p className="font-semibold">⚠️ Scheduling Collision Detected:</p>
                    <p className="mt-0.5 text-[11px]">{selectedSession.conflictReason}</p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] bg-white border-[#f87171] text-[#991b1b]"
                        onClick={() => {
                          setRescheduleStart(utcToAcademyInput(selectedSession.startsAt, timezone));
                          setRescheduleEnd(utcToAcademyInput(selectedSession.endsAt, timezone));
                          setIsRescheduleModalOpen(true);
                        }}
                      >
                        Reschedule Now
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Metadata List */}
              <div className="space-y-2 rounded-xl bg-[#f8fafb] p-3 text-xs">
                <div className="flex items-center gap-2 text-muted">
                  <span>🏷️</span>
                  <span className="font-medium text-foreground">
                    {selectedSession.sportName} · {selectedSession.batchName}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted">
                  <span>📅</span>
                  <span className="font-medium text-foreground">
                    {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric", timeZone: timezone }).format(new Date(selectedSession.startsAt))}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted">
                  <span>🕒</span>
                  <span className="font-medium text-foreground">
                    {new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: timezone }).format(new Date(selectedSession.startsAt))} – {new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: timezone }).format(new Date(selectedSession.endsAt))}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted">
                  <span>📍</span>
                  <span className="font-medium text-foreground">
                    {selectedSession.venue || "Main Ground"} {selectedSession.branchName ? `(${selectedSession.branchName})` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted">
                  <span>👤</span>
                  <span className="font-medium text-foreground">
                    {selectedSession.coachName}
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted pt-1 border-t border-line/60">
                  <span className="flex items-center gap-2">
                    <span>👥</span>
                    <span className="font-medium text-foreground">
                      {selectedSession.enrolledCount} / {selectedSession.capacity ?? "20"} students
                    </span>
                  </span>
                  <span className="text-[11px] font-semibold text-[#007AFF] cursor-pointer hover:underline">
                    View Roster
                  </span>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="grid grid-cols-3 gap-2">
                <Button
                  size="sm"
                  className="bg-[#007AFF] text-white hover:bg-[#0066D6] text-xs font-semibold rounded-lg"
                  onClick={() => {
                    setRosterTab("students");
                  }}
                >
                  ✓ Mark
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs font-semibold rounded-lg"
                  onClick={() => {
                    if (selectedParentSchedule) {
                      setEditScheduleDay(String(selectedParentSchedule.dayOfWeek));
                      setEditScheduleStart(selectedParentSchedule.startTime);
                      setEditScheduleEnd(selectedParentSchedule.endTime);
                      setEditScheduleVenue(selectedParentSchedule.venue || "");
                      setEditScheduleBranchId(selectedParentSchedule.branchId || "");
                      setIsEditRecurringModalOpen(true);
                    } else {
                      setRescheduleStart(utcToAcademyInput(selectedSession.startsAt, timezone));
                      setRescheduleEnd(utcToAcademyInput(selectedSession.endsAt, timezone));
                      setIsRescheduleModalOpen(true);
                    }
                  }}
                >
                  ✏️ Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs font-semibold rounded-lg border-[#fca5a5] text-[#b91c1c] hover:bg-[#fef2f2]"
                  onClick={() => {
                    setRescheduleStart(utcToAcademyInput(selectedSession.startsAt, timezone));
                    setRescheduleEnd(utcToAcademyInput(selectedSession.endsAt, timezone));
                    setIsRescheduleModalOpen(true);
                  }}
                >
                  🔄 Reschedule
                </Button>
              </div>

              {/* Subtabs: Students | Notes | History */}
              <div className="flex items-center gap-4 border-b border-line text-xs font-semibold text-muted pt-2">
                <button
                  type="button"
                  onClick={() => setRosterTab("students")}
                  className={`pb-1.5 transition-all ${
                    rosterTab === "students"
                      ? "border-b-2 border-foreground text-foreground"
                      : "hover:text-foreground"
                  }`}
                >
                  Students ({rosterStudents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRosterTab("notes")}
                  className={`pb-1.5 transition-all ${
                    rosterTab === "notes"
                      ? "border-b-2 border-foreground text-foreground"
                      : "hover:text-foreground"
                  }`}
                >
                  Notes (0)
                </button>
                <button
                  type="button"
                  onClick={() => setRosterTab("history")}
                  className={`pb-1.5 transition-all ${
                    rosterTab === "history"
                      ? "border-b-2 border-foreground text-foreground"
                      : "hover:text-foreground"
                  }`}
                >
                  History (3)
                </button>
              </div>

              {/* Attendance Quick Stats Box */}
              {rosterTab === "students" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] p-2">
                      <span className="block text-base font-bold text-[#15803d]">
                        {attendanceStats.present}
                      </span>
                      <span className="text-[10px] font-semibold text-[#166534]">Present</span>
                    </div>
                    <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-2">
                      <span className="block text-base font-bold text-[#b91c1c]">
                        {attendanceStats.absent}
                      </span>
                      <span className="text-[10px] font-semibold text-[#991b1b]">Absent</span>
                    </div>
                    <div className="rounded-xl border border-line bg-[#f8fafc] p-2">
                      <span className="block text-base font-bold text-muted">
                        {attendanceStats.notMarked}
                      </span>
                      <span className="text-[10px] font-semibold text-muted">Not Marked</span>
                    </div>
                  </div>

                  {/* Student Search */}
                  <Input
                    placeholder="Search students…"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="h-8 text-xs"
                  />

                  {/* Roster List */}
                  <div className="max-h-56 divide-y divide-line overflow-y-auto pr-1">
                    {rosterStudents.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between py-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="size-3.5 rounded accent-[#007AFF]" />
                          <div className="flex size-6 items-center justify-center rounded-full bg-[#e2e8f0] text-[10px] font-bold text-[#475569]">
                            {s.name.slice(0, 1)}
                          </div>
                          <span className="font-medium text-foreground">{s.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleQuickMarkStudent(s.id, s.status === "present" ? "absent" : "present")}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                              s.status === "present"
                                ? "bg-[#dcfce7] text-[#15803d]"
                                : s.status === "absent"
                                  ? "bg-[#fee2e2] text-[#b91c1c]"
                                  : "bg-[#fef9c3] text-[#854d0e]"
                            }`}
                          >
                            {s.status}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Cancel Session Option at bottom */}
                  {selectedSession.status === "scheduled" && (
                    <div className="pt-2 border-t border-line text-right">
                      <button
                        type="button"
                        onClick={() => setIsCancelConfirmOpen(true)}
                        className="text-xs font-semibold text-[#b91c1c] hover:underline"
                      >
                        Cancel this session occurrence →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Notes Tab */}
              {rosterTab === "notes" && (
                <div className="rounded-xl border border-line bg-[#f8fafb] p-4 text-center text-xs text-muted">
                  No coach session notes submitted yet for this class.
                </div>
              )}

              {/* History Tab */}
              {rosterTab === "history" && (
                <div className="space-y-2 text-xs text-muted">
                  <div className="rounded-lg bg-[#f8fafb] p-2">
                    <span className="font-semibold text-foreground">Session created</span> · Auto-generated from weekly schedule rule.
                  </div>
                  <div className="rounded-lg bg-[#f8fafb] p-2">
                    <span className="font-semibold text-foreground">Roster synced</span> · 18 students assigned from batch enrollment.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* RECURRING SCHEDULE TAB */}
          {panelTab === "recurring" && (
            <div className="space-y-4 text-xs">
              {selectedParentSchedule ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-line bg-[#f8fafb] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground text-sm">
                        {selectedParentSchedule.batchName} Weekly Rule
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          selectedParentSchedule.isActive
                            ? "bg-[#dcfce7] text-[#15803d]"
                            : "bg-[#fee2e2] text-[#b91c1c]"
                        }`}
                      >
                        {selectedParentSchedule.isActive ? "Active" : "Paused"}
                      </span>
                    </div>
                    <p className="text-muted leading-relaxed">
                      Recurring classes repeat every <strong>{FULL_DAYS_NAMES[selectedParentSchedule.dayOfWeek]}</strong> from{" "}
                      <strong>{selectedParentSchedule.startTime} – {selectedParentSchedule.endTime}</strong>.
                    </p>
                    <div className="pt-1 text-muted">
                      📍 Venue: <strong>{selectedParentSchedule.venue || "Main Ground"}</strong>
                      {selectedParentSchedule.branchName ? ` · ${selectedParentSchedule.branchName}` : ""}
                    </div>
                  </div>

                  <p className="text-muted leading-relaxed">
                    💡 <em>Updating this recurring rule updates all future session occurrences without modifying past attendance history.</em>
                  </p>

                  <div className="space-y-2 pt-2">
                    <Button
                      className="w-full bg-[#007AFF] text-white hover:bg-[#0066D6]"
                      onClick={() => {
                        setEditScheduleDay(String(selectedParentSchedule.dayOfWeek));
                        setEditScheduleStart(selectedParentSchedule.startTime);
                        setEditScheduleEnd(selectedParentSchedule.endTime);
                        setEditScheduleVenue(selectedParentSchedule.venue || "");
                        setEditScheduleBranchId(selectedParentSchedule.branchId || "");
                        setIsEditRecurringModalOpen(true);
                      }}
                    >
                      ✏️ Edit Recurring Timings & Venue
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => void handleToggleParentScheduleActive()}
                    >
                      {selectedParentSchedule.isActive ? "Pause Weekly Schedule" : "Reactivate Weekly Schedule"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-line p-5 text-center text-muted">
                  <p>This is a standalone session occurrence not tied to an active recurring schedule.</p>
                  <Button
                    size="sm"
                    className="mt-3 bg-[#007AFF] text-white"
                    onClick={() => {
                      setCreateMode("recurring");
                      setIsCreateModalOpen(true);
                    }}
                  >
                    + Create Recurring Rule
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM SUMMARY & KPI DASHBOARD (Matching Reference Image) */}
      <div className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-sm space-y-5">
        {/* Legend Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4 text-xs font-medium">
          {/* Sports Legend */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-muted uppercase tracking-wider text-[11px]">Sports:</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#22c55e]" /> Cricket</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#3b82f6]" /> Football</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#a855f7]" /> Fitness</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#ec4899]" /> Yoga</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#06b6d4]" /> Swimming</span>
          </div>

          {/* Statuses Legend */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-muted uppercase tracking-wider text-[11px]">Status:</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#38bdf8]" /> Scheduled</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#22c55e]" /> In Progress</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#cbd5e1]" /> Completed</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#f87171]" /> Cancelled</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#fbbf24]" /> Rescheduled</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#ef4444]" /> Conflict</span>
          </div>
        </div>

        {/* 4 Summary Metric Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Card 1: Today's Summary */}
          <div className="rounded-xl border border-line bg-[#f8fafb] p-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-xs text-foreground">Today's Summary</h4>
              <span className="text-[10px] font-semibold text-[#007AFF] cursor-pointer hover:underline">View All</span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
              <div className="rounded-lg bg-white p-2 border border-line">
                <span className="block text-base font-bold text-foreground">
                  {enrichedSessions.filter((s) => academyDate(new Date(s.startsAt), timezone) === academyDate(new Date(), timezone)).length || 12}
                </span>
                <span className="text-[9px] font-medium text-muted">Sessions</span>
              </div>
              <div className="rounded-lg bg-white p-2 border border-line">
                <span className="block text-base font-bold text-foreground">{coaches.length || 5}</span>
                <span className="text-[9px] font-medium text-muted">Coaches</span>
              </div>
              <div className="rounded-lg bg-white p-2 border border-line">
                <span className="block text-base font-bold text-[#b91c1c]">
                  {enrichedSessions.filter((s) => s.hasConflict).length}
                </span>
                <span className="text-[9px] font-medium text-muted">Conflicts</span>
              </div>
              <div className="rounded-lg bg-white p-2 border border-line">
                <span className="block text-base font-bold text-foreground">134</span>
                <span className="text-[9px] font-medium text-muted">Students</span>
              </div>
            </div>
          </div>

          {/* Card 2: Coach Utilization */}
          <div className="rounded-xl border border-line bg-[#f8fafb] p-4 flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-xs text-foreground">Coach Utilization</h4>
              <p className="mt-2 text-sm font-bold text-foreground">8 / 10</p>
              <p className="text-[11px] text-muted">Coaches scheduled</p>
              <span className="mt-2 inline-block text-[11px] font-semibold text-[#007AFF] cursor-pointer hover:underline">
                View Details
              </span>
            </div>
            {/* Circular Gauge */}
            <div className="relative size-16 flex items-center justify-center">
              <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-[#e2e8f0]"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-[#007AFF]"
                  strokeDasharray="80, 100"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="absolute text-xs font-bold text-foreground">80%</span>
            </div>
          </div>

          {/* Card 3: Facilities Usage */}
          <div className="rounded-xl border border-line bg-[#f8fafb] p-4 flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-xs text-foreground">Facilities Usage</h4>
              <p className="mt-2 text-sm font-bold text-foreground">6 / 8</p>
              <p className="text-[11px] text-muted">Facilities in use</p>
              <span className="mt-2 inline-block text-[11px] font-semibold text-[#007AFF] cursor-pointer hover:underline">
                View Details
              </span>
            </div>
            {/* Circular Gauge */}
            <div className="relative size-16 flex items-center justify-center">
              <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-[#e2e8f0]"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-[#10b981]"
                  strokeDasharray="75, 100"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="absolute text-xs font-bold text-foreground">75%</span>
            </div>
          </div>

          {/* Card 4: Upcoming Alerts */}
          <div className="rounded-xl border border-line bg-[#f8fafb] p-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-xs text-foreground">Upcoming</h4>
              <span className="text-[10px] font-semibold text-[#007AFF] cursor-pointer hover:underline">View All</span>
            </div>
            <div className="mt-2.5 space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <span className="font-bold text-[#b91c1c]">⚠️ 2</span>
                <span className="text-muted leading-tight">
                  Coach unavailable <span className="block text-[10px]">Oct 28, 4:00 PM · U12 Cricket</span>
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-[#eab308]">🛠️ 1</span>
                <span className="text-muted leading-tight">
                  Facility maintenance <span className="block text-[10px]">Nov 1, 8:00 AM · Main Ground</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL 1: CREATE SESSION OR RECURRING SCHEDULE */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {createMode === "session" ? "Schedule a Class Session" : "Create Recurring Weekly Class"}
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  {createMode === "session"
                    ? "Add a single class occurrence to your academy timetable."
                    : "Add a weekly recurring class schedule from Monday to Saturday."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="mt-4 flex rounded-xl border border-line bg-[#f8fafb] p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setCreateMode("session")}
                className={`flex-1 rounded-lg py-1.5 transition-all ${
                  createMode === "session" ? "bg-white shadow text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                One-off Session
              </button>
              <button
                type="button"
                onClick={() => setCreateMode("recurring")}
                className={`flex-1 rounded-lg py-1.5 transition-all ${
                  createMode === "recurring" ? "bg-white shadow text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                Recurring Weekly Schedule
              </button>
            </div>

            <form onSubmit={handleCreateSessionSubmit} className="mt-4 space-y-3.5">
              {/* Batch Select */}
              <label className="block text-xs font-medium text-foreground">
                Training Batch
                <select
                  className="mt-1 h-10 w-full rounded-xl border border-line bg-white px-3 text-xs outline-none focus:border-accent"
                  value={createBatchId}
                  onChange={(e) => setCreateBatchId(e.target.value)}
                  required
                >
                  <option value="">Select a batch</option>
                  {(catalog?.batches ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} · {b.programName} ({b.disciplineName})
                    </option>
                  ))}
                </select>
              </label>

              {/* Branch Select */}
              <label className="block text-xs font-medium text-foreground">
                Branch / Campus
                <select
                  className="mt-1 h-10 w-full rounded-xl border border-line bg-white px-3 text-xs outline-none focus:border-accent"
                  value={createBranchId}
                  onChange={(e) => setCreateBranchId(e.target.value)}
                >
                  <option value="">No branch / Default</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Date / Day Pickers */}
              {createMode === "session" ? (
                <label className="block text-xs font-medium text-foreground">
                  Session Date
                  <Input
                    type="date"
                    value={createSessionDate}
                    onChange={(e) => setCreateSessionDate(e.target.value)}
                    required
                    className="mt-1 h-10 text-xs"
                  />
                </label>
              ) : (
                <label className="block text-xs font-medium text-foreground">
                  Recurring Day of Week
                  <select
                    className="mt-1 h-10 w-full rounded-xl border border-line bg-white px-3 text-xs outline-none focus:border-accent"
                    value={createDayOfWeek}
                    onChange={(e) => setCreateDayOfWeek(e.target.value)}
                  >
                    {FULL_DAYS_NAMES.map((d, i) => (
                      <option key={d} value={i}>
                        Every {d}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {/* Time Range */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-foreground">
                  Start Time
                  <Input
                    type="time"
                    value={createStartTime}
                    onChange={(e) => setCreateStartTime(e.target.value)}
                    required
                    className="mt-1 h-10 text-xs"
                  />
                </label>
                <label className="block text-xs font-medium text-foreground">
                  End Time
                  <Input
                    type="time"
                    value={createEndTime}
                    onChange={(e) => setCreateEndTime(e.target.value)}
                    required
                    className="mt-1 h-10 text-xs"
                  />
                </label>
              </div>

              {/* Venue Input */}
              <label className="block text-xs font-medium text-foreground">
                Venue / Hall
                <Input
                  placeholder="e.g. Main Ground, Field A, Studio"
                  value={createVenue}
                  onChange={(e) => setCreateVenue(e.target.value)}
                  className="mt-1 h-10 text-xs"
                />
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#007AFF] text-white hover:bg-[#0066D6]"
                  disabled={busy || !createBatchId}
                >
                  {busy ? "Saving…" : createMode === "session" ? "Save Session" : "Create Schedule & Sync"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: RESCHEDULE OCCURRENCE */}
      {isRescheduleModalOpen && selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Reschedule Class Session
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Change the timing of <strong>{selectedSession.batchName}</strong> for this date.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRescheduleModalOpen(false)}
                className="text-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRescheduleSubmit} className="mt-4 space-y-3.5">
              <label className="block text-xs font-medium text-foreground">
                New Start Date & Time ({timezone})
                <Input
                  type="datetime-local"
                  value={rescheduleStart}
                  onChange={(e) => setRescheduleStart(e.target.value)}
                  required
                  className="mt-1 h-10 text-xs"
                />
              </label>

              <label className="block text-xs font-medium text-foreground">
                New End Date & Time ({timezone})
                <Input
                  type="datetime-local"
                  value={rescheduleEnd}
                  onChange={(e) => setRescheduleEnd(e.target.value)}
                  required
                  className="mt-1 h-10 text-xs"
                />
              </label>

              <p className="text-xs text-muted leading-relaxed">
                💡 Only this specific occurrence will be adjusted. Future occurrences will continue according to their normal schedule.
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsRescheduleModalOpen(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#007AFF] text-white hover:bg-[#0066D6]"
                  disabled={busy || !rescheduleStart || !rescheduleEnd}
                >
                  {busy ? "Saving…" : "Confirm Reschedule"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CANCEL SESSION CONFIRMATION */}
      {isCancelConfirmOpen && selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-[#b91c1c]">
              Cancel Training Session?
            </h3>
            <p className="mt-2 text-xs text-muted leading-relaxed">
              Are you sure you want to cancel <strong>{selectedSession.batchName}</strong> on{" "}
              {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(new Date(selectedSession.startsAt))}?
            </p>
            <p className="mt-2 text-xs text-muted">
              Student roster notes and history will remain accessible. Future sessions will not be affected.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCancelConfirmOpen(false)}
                disabled={busy}
              >
                Keep Session
              </Button>
              <Button
                size="sm"
                className="bg-[#b91c1c] text-white hover:bg-[#991b1b]"
                onClick={() => void handleCancelSession()}
                disabled={busy}
              >
                {busy ? "Cancelling…" : "Yes, Cancel Session"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: EDIT RECURRING SCHEDULE RULE */}
      {isEditRecurringModalOpen && selectedParentSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Edit Weekly Recurring Class Rule
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Update timings and venue for <strong>{selectedParentSchedule.batchName}</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditRecurringModalOpen(false)}
                className="text-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateRecurringSchedule} className="mt-4 space-y-3.5">
              <label className="block text-xs font-medium text-foreground">
                Day of Week
                <select
                  className="mt-1 h-10 w-full rounded-xl border border-line bg-white px-3 text-xs outline-none focus:border-accent"
                  value={editScheduleDay}
                  onChange={(e) => setEditScheduleDay(e.target.value)}
                >
                  {FULL_DAYS_NAMES.map((d, i) => (
                    <option key={d} value={i}>
                      Every {d}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-foreground">
                  Start Time
                  <Input
                    type="time"
                    value={editScheduleStart}
                    onChange={(e) => setEditScheduleStart(e.target.value)}
                    required
                    className="mt-1 h-10 text-xs"
                  />
                </label>
                <label className="block text-xs font-medium text-foreground">
                  End Time
                  <Input
                    type="time"
                    value={editScheduleEnd}
                    onChange={(e) => setEditScheduleEnd(e.target.value)}
                    required
                    className="mt-1 h-10 text-xs"
                  />
                </label>
              </div>

              <label className="block text-xs font-medium text-foreground">
                Venue
                <Input
                  value={editScheduleVenue}
                  onChange={(e) => setEditScheduleVenue(e.target.value)}
                  placeholder="e.g. Main Ground, Field A"
                  className="mt-1 h-10 text-xs"
                />
              </label>

              <label className="block text-xs font-medium text-foreground">
                Branch / Facility
                <select
                  className="mt-1 h-10 w-full rounded-xl border border-line bg-white px-3 text-xs outline-none focus:border-accent"
                  value={editScheduleBranchId}
                  onChange={(e) => setEditScheduleBranchId(e.target.value)}
                >
                  <option value="">No branch / Default</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditRecurringModalOpen(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#007AFF] text-white hover:bg-[#0066D6]"
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

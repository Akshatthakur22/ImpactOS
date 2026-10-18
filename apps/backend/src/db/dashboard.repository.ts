import { and, asc, count, countDistinct, desc, eq, gte, inArray, lt } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  academies,
  attendanceRecords,
  batchCoaches,
  batches,
  coachProfiles,
  disciplines,
  enrollments,
  programs,
  students,
  trainingSessions,
  users,
} from "./schema.js";

type AttendanceCounts = {
  expected: number;
  marked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  toRecord: number;
};

type SessionDraft = {
  id: string;
  batchId: string;
  batchName: string;
  programName: string;
  coachNames: string[];
  startsAt: Date;
  endsAt: Date;
  venue: string | null;
  status: "scheduled" | "completed" | "cancelled";
};

function zonedParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function academyMidnightUtc(year: number, month: number, day: number, timeZone: string) {
  const targetAsUtc = Date.UTC(year, month - 1, day);
  let guess = targetAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const local = zonedParts(new Date(guess), timeZone);
    const localAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    const adjustment = targetAsUtc - localAsUtc;
    if (adjustment === 0) break;
    guess += adjustment;
  }
  return new Date(guess);
}

function academyDayBounds(now: Date, timeZone: string) {
  const today = zonedParts(now, timeZone);
  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  return {
    from: academyMidnightUtc(today.year, today.month, today.day, timeZone),
    to: academyMidnightUtc(
      tomorrow.getUTCFullYear(),
      tomorrow.getUTCMonth() + 1,
      tomorrow.getUTCDate(),
      timeZone,
    ),
  };
}

function emptyAttendanceCounts(): AttendanceCounts {
  return { expected: 0, marked: 0, present: 0, absent: 0, late: 0, excused: 0, toRecord: 0 };
}

export function createDashboardRepository(db: Database) {
  return {
    async getOverview(academyId: string, now: Date) {
      const [academy] = await db
        .select({ name: academies.name, timezone: academies.timezone })
        .from(academies)
        .where(eq(academies.id, academyId))
        .limit(1);
      if (!academy) throw new Error("Academy record was not found.");

      const day = academyDayBounds(now, academy.timezone);
      const [
        [activeStudents],
        [pendingStudents],
        [activeCoaches],
        [activePrograms],
        [activeBatches],
        sessionRows,
        recentAttendance,
      ] = await Promise.all([
        db
          .select({ value: countDistinct(enrollments.studentId) })
          .from(enrollments)
          .where(and(eq(enrollments.academyId, academyId), eq(enrollments.status, "active"))),
        db
          .select({ value: count() })
          .from(students)
          .where(and(eq(students.academyId, academyId), eq(students.status, "pending"))),
        db
          .select({ value: countDistinct(coachProfiles.id) })
          .from(coachProfiles)
          .innerJoin(users, eq(coachProfiles.userId, users.id))
          .where(
            and(
              eq(coachProfiles.academyId, academyId),
              eq(coachProfiles.status, "active"),
              eq(users.isActive, true),
            ),
          ),
        db
          .select({ value: count() })
          .from(programs)
          .innerJoin(disciplines, eq(programs.disciplineId, disciplines.id))
          .where(
            and(
              eq(programs.academyId, academyId),
              eq(programs.isActive, true),
              eq(disciplines.isActive, true),
            ),
          ),
        db
          .select({ value: count() })
          .from(batches)
          .where(and(eq(batches.academyId, academyId), eq(batches.isActive, true))),
        db
          .select({
            id: trainingSessions.id,
            batchId: batches.id,
            batchName: batches.name,
            programName: programs.name,
            startsAt: trainingSessions.startsAt,
            endsAt: trainingSessions.endsAt,
            venue: trainingSessions.venue,
            status: trainingSessions.status,
            coachName: users.displayName,
          })
          .from(trainingSessions)
          .innerJoin(batches, eq(trainingSessions.batchId, batches.id))
          .innerJoin(programs, eq(batches.programId, programs.id))
          .leftJoin(
            batchCoaches,
            and(eq(batchCoaches.batchId, batches.id), eq(batchCoaches.academyId, academyId)),
          )
          .leftJoin(
            coachProfiles,
            and(
              eq(batchCoaches.coachId, coachProfiles.id),
              eq(coachProfiles.academyId, academyId),
              eq(coachProfiles.status, "active"),
            ),
          )
          .leftJoin(users, and(eq(coachProfiles.userId, users.id), eq(users.isActive, true)))
          .where(
            and(
              eq(trainingSessions.academyId, academyId),
              gte(trainingSessions.startsAt, day.from),
              lt(trainingSessions.startsAt, day.to),
            ),
          )
          .orderBy(asc(trainingSessions.startsAt), asc(batches.name)),
        db
          .select({
            id: attendanceRecords.id,
            studentName: students.firstName,
            studentLastName: students.lastName,
            batchName: batches.name,
            sessionStartsAt: trainingSessions.startsAt,
            status: attendanceRecords.status,
            recordedByName: users.displayName,
            recordedAt: attendanceRecords.recordedAt,
          })
          .from(attendanceRecords)
          .innerJoin(students, eq(attendanceRecords.studentId, students.id))
          .innerJoin(trainingSessions, eq(attendanceRecords.sessionId, trainingSessions.id))
          .innerJoin(batches, eq(trainingSessions.batchId, batches.id))
          .innerJoin(users, eq(attendanceRecords.recordedBy, users.id))
          .where(eq(attendanceRecords.academyId, academyId))
          .orderBy(desc(attendanceRecords.recordedAt))
          .limit(8),
      ]);

      const sessionsById = new Map<string, SessionDraft>();
      for (const row of sessionRows) {
        const current = sessionsById.get(row.id) ?? {
          id: row.id,
          batchId: row.batchId,
          batchName: row.batchName,
          programName: row.programName,
          coachNames: [],
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          venue: row.venue,
          status: row.status,
        };
        if (row.coachName && !current.coachNames.includes(row.coachName)) {
          current.coachNames.push(row.coachName);
        }
        sessionsById.set(row.id, current);
      }
      const sessions = [...sessionsById.values()];
      const batchIds = [...new Set(sessions.map((session) => session.batchId))];
      const sessionIds = sessions.map((session) => session.id);

      const [enrollmentRows, attendanceRows] = await Promise.all([
        batchIds.length === 0
          ? Promise.resolve([])
          : db
              .select({ batchId: enrollments.batchId, value: count() })
              .from(enrollments)
              .where(
                and(
                  eq(enrollments.academyId, academyId),
                  eq(enrollments.status, "active"),
                  inArray(enrollments.batchId, batchIds),
                ),
              )
              .groupBy(enrollments.batchId),
        sessionIds.length === 0
          ? Promise.resolve([])
          : db
              .select({
                sessionId: attendanceRecords.sessionId,
                status: attendanceRecords.status,
                value: count(),
              })
              .from(attendanceRecords)
              .where(
                and(
                  eq(attendanceRecords.academyId, academyId),
                  inArray(attendanceRecords.sessionId, sessionIds),
                ),
              )
              .groupBy(attendanceRecords.sessionId, attendanceRecords.status),
      ]);

      const expectedByBatch = new Map(enrollmentRows.map((row) => [row.batchId, row.value]));
      const attendanceBySession = new Map<string, AttendanceCounts>();
      for (const row of attendanceRows) {
        const counts = attendanceBySession.get(row.sessionId) ?? emptyAttendanceCounts();
        counts[row.status] = row.value;
        counts.marked += row.value;
        attendanceBySession.set(row.sessionId, counts);
      }

      const attendanceToday = emptyAttendanceCounts();
      const todaySessions = sessions.map((session) => {
        const attendance = attendanceBySession.get(session.id) ?? emptyAttendanceCounts();
        const expected =
          session.status === "cancelled" ? 0 : (expectedByBatch.get(session.batchId) ?? 0);
        attendance.expected = expected;
        attendance.toRecord = Math.max(expected - attendance.marked, 0);

        const attendanceIsDue = session.status === "completed" || session.startsAt <= now;
        if (session.status !== "cancelled" && attendanceIsDue) {
          attendanceToday.expected += expected;
          attendanceToday.marked += attendance.marked;
          attendanceToday.present += attendance.present;
          attendanceToday.absent += attendance.absent;
          attendanceToday.late += attendance.late;
          attendanceToday.excused += attendance.excused;
          if (session.status === "scheduled") {
            attendanceToday.toRecord += attendance.toRecord;
          }
        }

        return {
          ...session,
          startsAt: session.startsAt.toISOString(),
          endsAt: session.endsAt.toISOString(),
          attendance,
        };
      });

      return {
        academyName: academy.name,
        timezone: academy.timezone,
        metrics: {
          activeStudents: activeStudents?.value ?? 0,
          pendingStudents: pendingStudents?.value ?? 0,
          activeCoaches: activeCoaches?.value ?? 0,
          activePrograms: activePrograms?.value ?? 0,
          activeBatches: activeBatches?.value ?? 0,
          sessionsToday: todaySessions.length,
          scheduledSessionsToday: todaySessions.filter((session) => session.status === "scheduled")
            .length,
          completedSessionsToday: todaySessions.filter((session) => session.status === "completed")
            .length,
          cancelledSessionsToday: todaySessions.filter((session) => session.status === "cancelled")
            .length,
          attendanceToday,
        },
        todaySessions,
        recentAttendance: recentAttendance.map((record) => ({
          id: record.id,
          studentName: `${record.studentName} ${record.studentLastName}`.trim(),
          batchName: record.batchName,
          sessionStartsAt: record.sessionStartsAt.toISOString(),
          status: record.status,
          recordedByName: record.recordedByName,
          recordedAt: record.recordedAt.toISOString(),
        })),
      };
    },
  };
}

export type DashboardRepository = ReturnType<typeof createDashboardRepository>;

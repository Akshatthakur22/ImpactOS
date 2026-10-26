import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import { config } from "dotenv";
import { resolve } from "node:path";
import { loadEnv } from "../config/env.js";
import { createDatabase } from "./client.js";
import {
  academies,
  academyAnnouncements,
  academyExpenses,
  attendanceRecords,
  coachSessionPresence,
  batchCoaches,
  batchSchedules,
  batches,
  coachProfiles,
  disciplines,
  enrollments,
  feeCharges,
  feePayments,
  financeCounters,
  guardians,
  programs,
  progressEntries,
  studentGuardians,
  students,
  trainingSessions,
  users,
} from "./schema.js";
import { passwordHasher } from "../modules/auth/password.js";
import { academyLocalDateTimeToUtc } from "../modules/operations/academy-time.js";

config({ path: resolve(process.cwd(), "../../.env") });

const DEMO_PASSWORD = "ImpactCoach!2026";

/* ─── Real Coach Data ─────────────────────────────────────────────────────── */

interface CoachSeed {
  name: string;
  email: string;
  phone: string;
  specializations: string[];
  qualifications: string[];
  yearsExperience: number;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

const coachSeeds: CoachSeed[] = [
  {
    name: "Tushar Hirwani",
    email: "tusharhirve143@gmail.com",
    phone: "+91 74153 66508",
    specializations: ["Skating", "Physical Fitness"],
    qualifications: ["BPES (Bachelor of Physical Education and Sports)"],
    yearsExperience: 8,
    emergencyContactName: "Maya",
    emergencyContactPhone: "+91 73546 06489",
  },
  {
    name: "Pankaj Sonwani",
    email: "pankajsonwani07@gmail.com",
    phone: "+91 87700 54037",
    specializations: ["Yoga", "Fitness", "Martial Arts", "Football"],
    qualifications: ["B.E. (Bachelor of Engineering)", "B.P.Ed. (Pursuing)"],
    yearsExperience: 1,
    emergencyContactName: "Pankaj Sonwani",
    emergencyContactPhone: "+91 87700 54037",
  },
  {
    name: "Ashish Sahu",
    email: "ashishsahu856@gmail.com",
    phone: "+91 74157 57123",
    specializations: ["Skating", "Physical Fitness"],
    qualifications: ["BPES (Bachelor of Physical Education and Sports)"],
    yearsExperience: 8,
    emergencyContactName: "Ashish Sahu",
    emergencyContactPhone: "+91 74157 57123",
  },
  {
    name: "Pradhum Bhagore",
    email: "princebhargav195@gmail.com",
    phone: "+91 63500 42378",
    specializations: ["Gymnastics", "Calisthenics", "Yoga", "Martial Arts", "Physical Fitness"],
    qualifications: ["BPES (Bachelor of Physical Education and Sports)"],
    yearsExperience: 8,
    emergencyContactName: "Pradhum Bhagore",
    emergencyContactPhone: "+91 63500 42378",
  },
  {
    name: "Ajay Vishwakarma",
    email: "ajaykarma25@gmail.com",
    phone: "+91 78050 04934",
    specializations: ["Wushu", "Physical Fitness"],
    qualifications: ["BPES (Bachelor of Physical Education and Sports)"],
    yearsExperience: 6,
    emergencyContactName: "Maya",
    emergencyContactPhone: "+91 78050 04934",
  },
  {
    name: "Kushal Bhagat",
    email: "ribhu.yog@gmail.com",
    phone: "+91 94066 51419",
    specializations: ["Yoga", "Nutrition", "Basic Naturopathy"],
    qualifications: [
      "BPES Yoga",
      "MA Yoga (Pursuing)",
      "NIOS Yoga Certificate",
      "SVYASA Bangalore TTC Yoga",
      "JVBI TTC Yoga",
      "MP Yogasana Sports Association Yoga Judge",
      "MSME Naturopathy & Yoga",
      "IFSI Mumbai Nutritionist",
    ],
    yearsExperience: 9,
    emergencyContactName: "Hemant Bhagat",
    emergencyContactPhone: "+91 94066 51419",
  },
  {
    name: "Saurabh Mishra",
    email: "mishraji917@gmail.com",
    phone: "+91 84630 33247",
    specializations: ["Chess"],
    qualifications: ["B.Sc. Mathematics", "PGDCA (Post Graduation Diploma in Computer Application)"],
    yearsExperience: 2,
    emergencyContactName: "Saurabh Mishra",
    emergencyContactPhone: "+91 84630 33247",
  },
  {
    name: "Bhavesh Banodha",
    email: "banodhaa861@gmail.com",
    phone: "+91 92855 17087",
    specializations: ["Gymnastics"],
    qualifications: ["B.Com Graduate", "CA (Pursuing)"],
    yearsExperience: 5,
    emergencyContactName: "Bhavesh Banodha",
    emergencyContactPhone: "+91 92855 17087",
  },
  {
    name: "Deepak Kandare",
    email: "deepakkandare3@gmail.com",
    phone: "+91 88891 12825",
    specializations: ["Athletics", "Kho-Kho", "Physical Fitness"],
    qualifications: ["BPES (Bachelor of Physical Education and Sports) (Pursuing)"],
    yearsExperience: 12,
    emergencyContactName: "Deepak Kandare",
    emergencyContactPhone: "+91 88891 12825",
  },
];

const coachNames = coachSeeds.map((c) => c.name);

const parentNames = ["Ananya Sharma", "Rohan Iyer", "Priya Nair", "Dev Patel"];
const studentNames = [
  ["Aanya", "Sharma"],
  ["Ishaan", "Sharma"],
  ["Vihaan", "Iyer"],
  ["Sana", "Nair"],
  ["Arjun", "Patel"],
] as const;

/* ─── Disciplines, Programs & Batches ──────────────────────────────────── */

const disciplinesSeed = [
  { name: "Skating", program: "Skating & Physical Fitness", batches: ["Shalimar Palm Batch", "Bengali Square Batch"] },
  { name: "Yoga", program: "Yoga - Beginner to Advance", batches: ["Bengali Square Yoga"] },
  { name: "Martial Arts & Football", program: "Fitness & Combat Sports", batches: ["EuroKids Batch"] },
  { name: "Gymnastics", program: "Gymnastics & Calisthenics", batches: ["Bengali Square Gymnastics", "EuroKids Gymnastics"] },
  { name: "Wushu", program: "Wushu & Physical Fitness", batches: ["Morning Wushu Batch"] },
  { name: "Chess", program: "Chess - Elementary to Advanced", batches: ["Afternoon Chess Batch"] },
  { name: "Athletics & Kho-Kho", program: "Athletics & Multi-Sport", batches: ["Morning Athletics Batch"] },
] as const;

const demoEmails = [
  ...coachSeeds.map((c) => c.email),
  ...parentNames.map((_, index) => `demo.parent${index + 1}@example.test`),
];

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shiftDate(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

async function seed() {
  const env = loadEnv();
  if (env.NODE_ENV === "production") throw new Error("Demo seeding is disabled in production.");
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Set ALLOW_DEMO_SEED=true to confirm this local demo-data operation.");
  }
  const database = createDatabase(env.DATABASE_URL);
  try {
    const existingDemoUsers = await database.db
      .select({ email: users.email })
      .from(users)
      .where(inArray(users.email, demoEmails));
    if (existingDemoUsers.length) {
      const demoCoachUsers = await database.db
        .select({ id: users.id, academyId: users.academyId })
        .from(users)
        .where(inArray(users.email, demoEmails.slice(0, coachSeeds.length)));
      if (demoCoachUsers.length !== coachSeeds.length) {
        throw new Error("Some demo accounts already exist. Refusing to create a partial dataset.");
      }
      const demoCoachIds = demoCoachUsers.map((user) => user.id);
      const demoAcademyId = demoCoachUsers[0]!.academyId;
      if (demoCoachUsers.some((user) => user.academyId !== demoAcademyId)) {
        throw new Error("Demo coach accounts belong to more than one academy; refusing to seed.");
      }
      const [demoAcademy] = await database.db
        .select({ timezone: academies.timezone })
        .from(academies)
        .where(eq(academies.id, demoAcademyId))
        .limit(1);
      if (!demoAcademy) throw new Error("The demo academy was not found.");
      const currentLocalParts = Object.fromEntries(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: demoAcademy.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        })
          .formatToParts(new Date())
          .map(({ type, value }) => [type, value]),
      );
      const currentLocalDate = `${currentLocalParts.year}-${currentLocalParts.month}-${currentLocalParts.day}`;
      const currentLocalDayOfWeek = new Date(`${currentLocalDate}T00:00:00.000Z`).getUTCDay();
      const demoSchedules = await database.db
        .select({
          id: batchSchedules.id,
          batchId: batchSchedules.batchId,
          dayOfWeek: batchSchedules.dayOfWeek,
          startTime: batchSchedules.startTime,
          endTime: batchSchedules.endTime,
          venue: batchSchedules.venue,
          createdBy: batchSchedules.createdBy,
        })
        .from(batchSchedules)
        .innerJoin(batches, eq(batchSchedules.batchId, batches.id))
        .where(
          and(
            eq(batchSchedules.academyId, demoAcademyId),
            eq(batchSchedules.isActive, true),
            ilike(batches.name, "Demo %"),
          ),
        );
      let todaySessionsAdded = 0;
      for (const schedule of demoSchedules) {
        if (schedule.dayOfWeek !== currentLocalDayOfWeek) continue;
        const startsAt = academyLocalDateTimeToUtc(
          currentLocalDate,
          schedule.startTime,
          demoAcademy.timezone,
        );
        const endsAt = academyLocalDateTimeToUtc(
          currentLocalDate,
          schedule.endTime,
          demoAcademy.timezone,
        );
        const inserted = await database.db
          .insert(trainingSessions)
          .values({
            academyId: demoAcademyId,
            batchId: schedule.batchId,
            scheduleId: schedule.id,
            startsAt,
            endsAt,
            venue: schedule.venue,
            status: "scheduled",
            createdBy: schedule.createdBy,
          })
          .onConflictDoNothing()
          .returning({ id: trainingSessions.id });
        todaySessionsAdded += inserted.length;
      }
      const completedDemoSessions = await database.db
        .select({
          academyId: trainingSessions.academyId,
          sessionId: trainingSessions.id,
          coachId: coachProfiles.userId,
          startsAt: trainingSessions.startsAt,
          endsAt: trainingSessions.endsAt,
        })
        .from(trainingSessions)
        .innerJoin(batches, eq(trainingSessions.batchId, batches.id))
        .innerJoin(batchCoaches, eq(batchCoaches.batchId, batches.id))
        .innerJoin(coachProfiles, eq(batchCoaches.coachId, coachProfiles.id))
        .where(
          and(
            eq(trainingSessions.status, "completed"),
            ilike(batches.name, "Demo %"),
            eq(trainingSessions.academyId, demoAcademyId),
            inArray(coachProfiles.userId, demoCoachIds),
          ),
        );
      let addedPresence = 0;
      for (const session of completedDemoSessions) {
        const result = await database.db
          .insert(coachSessionPresence)
          .values({
            academyId: session.academyId,
            sessionId: session.sessionId,
            coachId: session.coachId,
            checkedInAt: new Date(session.startsAt.getTime() - 5 * 60_000),
            checkedOutAt: new Date(session.endsAt.getTime() + 2 * 60_000),
          })
          .onConflictDoNothing()
          .returning({ id: coachSessionPresence.id });
        addedPresence += result.length;
      }
      console.log(
        `Demo accounts already exist; added ${addedPresence} historical coach time records and ${todaySessionsAdded} sessions for today.`,
      );
      return;
    }
    const [owner] = await database.db
      .select({ id: users.id, academyId: users.academyId })
      .from(users)
      .innerJoin(academies, eq(users.academyId, academies.id))
      .where(eq(users.role, "owner"))
      .limit(1);
    if (!owner) throw new Error("Create the academy and owner first with db:bootstrap-owner.");
    const academy = await database.db
      .select({ timezone: academies.timezone, currency: academies.currency })
      .from(academies)
      .where(eq(academies.id, owner.academyId))
      .limit(1)
      .then((rows) => rows[0]);
    if (!academy) throw new Error("The owner academy was not found.");

    const passwordHash = await passwordHasher.hash(DEMO_PASSWORD);
    const now = new Date();
    const created = await database.db.transaction(async (tx) => {
      /* ─── Create Coach User Accounts & Profiles ───────────────────── */
      const coachUsers: string[] = [];
      for (let index = 0; index < coachSeeds.length; index += 1) {
        const coach = coachSeeds[index]!;
        const [user] = await tx
          .insert(users)
          .values({
            academyId: owner.academyId,
            email: coach.email,
            passwordHash,
            displayName: coach.name,
            role: "coach",
          })
          .returning({ id: users.id });
        if (!user) throw new Error("Could not create demo coach account.");
        coachUsers.push(user.id);
        await tx.insert(coachProfiles).values({
          academyId: owner.academyId,
          userId: user.id,
          phone: coach.phone,
          emergencyContactName: coach.emergencyContactName,
          emergencyContactPhone: coach.emergencyContactPhone,
          qualifications: coach.qualifications,
          yearsExperience: coach.yearsExperience,
          specializations: coach.specializations,
          createdBy: owner.id,
        });
      }

      /* ─── Create Parent Accounts ──────────────────────────────────── */
      const parentUsers: string[] = [];
      const parentRows = [];
      for (let index = 0; index < parentNames.length; index += 1) {
        const [user] = await tx
          .insert(users)
          .values({
            academyId: owner.academyId,
            email: `demo.parent${index + 1}@example.test`,
            passwordHash,
            displayName: parentNames[index]!,
            role: "parent",
          })
          .returning({ id: users.id });
        if (!user) throw new Error("Could not create demo parent account.");
        parentUsers.push(user.id);
        const [guardian] = await tx
          .insert(guardians)
          .values({
            academyId: owner.academyId,
            userId: user.id,
            name: parentNames[index]!,
            email: `demo.parent${index + 1}@example.test`,
            phone: `+91 90000 0000${index + 1}`,
            createdBy: owner.id,
          })
          .returning({ id: guardians.id });
        if (!guardian) throw new Error("Could not create demo guardian record.");
        parentRows.push(guardian.id);
      }

      /* ─── Create Disciplines, Programs & Batches ──────────────────── */
      const batchIds: string[] = [];
      for (const disciplineSeed of disciplinesSeed) {
        let disciplineId: string;
        const [existingDiscipline] = await tx
          .select({ id: disciplines.id })
          .from(disciplines)
          .where(
            and(
              eq(disciplines.academyId, owner.academyId),
              sql`lower(${disciplines.name}) = lower(${disciplineSeed.name})`,
            ),
          )
          .limit(1);

        if (existingDiscipline) {
          disciplineId = existingDiscipline.id;
        } else {
          const [discipline] = await tx
            .insert(disciplines)
            .values({ academyId: owner.academyId, name: disciplineSeed.name, createdBy: owner.id })
            .returning({ id: disciplines.id });
          if (!discipline) throw new Error("Could not create demo discipline.");
          disciplineId = discipline.id;
        }

        let programId: string;
        const [existingProgram] = await tx
          .select({ id: programs.id })
          .from(programs)
          .where(
            and(
              eq(programs.academyId, owner.academyId),
              eq(programs.disciplineId, disciplineId),
              sql`lower(${programs.name}) = lower(${disciplineSeed.program})`,
            ),
          )
          .limit(1);

        if (existingProgram) {
          programId = existingProgram.id;
        } else {
          const [program] = await tx
            .insert(programs)
            .values({
              academyId: owner.academyId,
              disciplineId,
              name: disciplineSeed.program,
              createdBy: owner.id,
            })
            .returning({ id: programs.id });
          if (!program) throw new Error("Could not create demo program.");
          programId = program.id;
        }

        for (const batchName of disciplineSeed.batches) {
          const fullName = `Demo ${batchName}`;
          const [existingBatch] = await tx
            .select({ id: batches.id })
            .from(batches)
            .where(
              and(
                eq(batches.academyId, owner.academyId),
                eq(batches.programId, programId),
                sql`lower(${batches.name}) = lower(${fullName})`,
              ),
            )
            .limit(1);

          if (existingBatch) {
            batchIds.push(existingBatch.id);
          } else {
            const [batch] = await tx
              .insert(batches)
              .values({
                academyId: owner.academyId,
                programId,
                name: fullName,
                capacity: 16,
                createdBy: owner.id,
              })
              .returning({ id: batches.id });
            if (!batch) throw new Error("Could not create demo batch.");
            batchIds.push(batch.id);
          }
        }
      }

      /* ─── Assign Coaches to Batches ───────────────────────────────── */
      /*
       * Batch index mapping (matches disciplinesSeed order):
       *  0 = Skating > Shalimar Palm Batch      → Coach 0 (Tushar) & Coach 2 (Ashish)
       *  1 = Skating > Bengali Square Batch      → Coach 0 (Tushar) & Coach 2 (Ashish)
       *  2 = Yoga > Bengali Square Yoga          → Coach 5 (Kushal)
       *  3 = Martial Arts > EuroKids Batch       → Coach 1 (Pankaj)
       *  4 = Gymnastics > Bengali Sq Gymnastics  → Coach 3 (Pradhum)
       *  5 = Gymnastics > EuroKids Gymnastics    → Coach 7 (Bhavesh)
       *  6 = Wushu > Morning Wushu Batch         → Coach 4 (Ajay)
       *  7 = Chess > Afternoon Chess Batch       → Coach 6 (Saurabh)
       *  8 = Athletics > Morning Athletics Batch → Coach 8 (Deepak)
       */
      const batchCoachAssignments: number[][] = [
        [0, 2],  // Shalimar Palm Skating → Tushar + Ashish
        [0, 2],  // Bengali Square Skating → Tushar + Ashish
        [5],     // Bengali Square Yoga → Kushal
        [1],     // EuroKids Martial Arts & Football → Pankaj
        [3],     // Bengali Square Gymnastics → Pradhum
        [7],     // EuroKids Gymnastics → Bhavesh
        [4],     // Morning Wushu → Ajay
        [6],     // Afternoon Chess → Saurabh
        [8],     // Morning Athletics → Deepak
      ];

      const profileRows = await tx
        .select({ id: coachProfiles.id, userId: coachProfiles.userId })
        .from(coachProfiles)
        .where(eq(coachProfiles.academyId, owner.academyId));
      const demoProfiles = profileRows.filter((profile) => coachUsers.includes(profile.userId));
      if (demoProfiles.length !== coachSeeds.length) throw new Error("Demo coach profiles missing.");
      const assignedProfileIds = coachUsers.map(
        (userId) => demoProfiles.find((profile) => profile.userId === userId)!.id,
      );

      for (let batchIndex = 0; batchIndex < batchIds.length; batchIndex += 1) {
        const coachIndexes = batchCoachAssignments[batchIndex] ?? [0];
        for (const coachIdx of coachIndexes) {
          const coachProfileId = assignedProfileIds[coachIdx]!;
          await tx.insert(batchCoaches).values({
            academyId: owner.academyId,
            batchId: batchIds[batchIndex]!,
            coachId: coachProfileId,
            createdBy: owner.id,
          });
        }
      }

      /* ─── Create Students ─────────────────────────────────────────── */
      const studentIds: string[] = [];
      const studentBatchIndexes = [0, 0, 3, 2, 6];
      for (let index = 0; index < studentNames.length; index += 1) {
        const [firstName, lastName] = studentNames[index]!;
        const [student] = await tx
          .insert(students)
          .values({
            academyId: owner.academyId,
            firstName,
            lastName,
            status: "active",
            createdBy: owner.id,
          })
          .returning({ id: students.id });
        if (!student) throw new Error("Could not create demo student.");
        studentIds.push(student.id);
        const parentIndex = index < 2 ? 0 : index - 1;
        await tx.insert(studentGuardians).values({
          academyId: owner.academyId,
          studentId: student.id,
          guardianId: parentRows[parentIndex]!,
          relationship: "Parent",
          isPrimary: true,
        });
        await tx.insert(enrollments).values({
          academyId: owner.academyId,
          studentId: student.id,
          batchId: batchIds[studentBatchIndexes[index]!]!,
          status: "active",
          createdBy: owner.id,
        });
      }

      /* ─── Create Schedules ────────────────────────────────────────── */
      /*
       * Real training times:
       *  Skating (batch 0,1): Mon-Fri 18:00-19:00
       *  Yoga (batch 2): Mon-Fri 18:00-19:00
       *  Martial Arts (batch 3): Mon-Fri 17:00-18:00
       *  Gymnastics Bengali Sq (batch 4): Mon-Fri 17:00-18:00
       *  Gymnastics EuroKids (batch 5): Mon-Fri 17:00-18:00
       *  Wushu (batch 6): Mon-Fri 07:00-08:00
       *  Chess (batch 7): Mon-Fri 15:40-16:50
       *  Athletics (batch 8): Mon-Fri 07:00-08:00
       *
       * We seed one schedule entry per batch using a rotating weekday.
       */
      const venues = [
        "Shalimar Palm, Scheme No. 140",
        "Impact Fit Academy, Bengali Square",
        "Bengali Square, Near Jain Mandir Road, Sukh Shanti Nagar",
        "EuroKids School, Scheme No. 140, Behind JMB",
        "Bengali Square, Near Jain Mandir Road, Sukh Shanti Nagar",
        "EuroKids School, Scheme No. 140, Behind JMB",
        "Impact Fit Academy, Bengali Square",
        "Bengali Square, Near Jain Mandir Road, Sukh Shanti Nagar",
        "Impact Fit Academy, Bengali Square",
      ];
      const weekdays = [1, 3, 2, 4, 5, 1, 3, 2, 4];
      const timeSlots: readonly (readonly [string, string])[] = [
        ["18:00", "19:00"],
        ["18:00", "19:00"],
        ["18:00", "19:00"],
        ["17:00", "18:00"],
        ["17:00", "18:00"],
        ["17:00", "18:00"],
        ["07:00", "08:00"],
        ["15:40", "16:50"],
        ["07:00", "08:00"],
      ];
      const scheduleIds = [];
      for (let index = 0; index < batchIds.length; index += 1) {
        const [schedule] = await tx
          .insert(batchSchedules)
          .values({
            academyId: owner.academyId,
            batchId: batchIds[index]!,
            dayOfWeek: weekdays[index]!,
            startTime: timeSlots[index]![0],
            endTime: timeSlots[index]![1],
            venue: venues[index]!,
            createdBy: owner.id,
          })
          .returning({ id: batchSchedules.id });
        if (!schedule) throw new Error("Could not create demo schedule.");
        scheduleIds.push(schedule.id);
      }

      /* ─── Create Training Sessions ────────────────────────────────── */
      const today = new Date();
      const todayUtc = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
      );
      const pastSessions: Array<{ id: string; batchIndex: number; startsAt: Date; endsAt: Date }> =
        [];
      const futureSessions: Array<{
        id: string;
        batchIndex: number;
        startsAt: Date;
        endsAt: Date;
      }> = [];
      for (let batchIndex = 0; batchIndex < batchIds.length; batchIndex += 1) {
        const weekday = weekdays[batchIndex]!;
        for (let dayOffset = -28; dayOffset <= 21; dayOffset += 1) {
          const date = shiftDate(todayUtc, dayOffset);
          if (date.getUTCDay() !== weekday) continue;
          const startsAt = academyLocalDateTimeToUtc(
            dayKey(date),
            timeSlots[batchIndex]![0],
            academy.timezone,
          );
          const endsAt = academyLocalDateTimeToUtc(
            dayKey(date),
            timeSlots[batchIndex]![1],
            academy.timezone,
          );
          const isPast = dayOffset < 0;
          const [session] = await tx
            .insert(trainingSessions)
            .values({
              academyId: owner.academyId,
              batchId: batchIds[batchIndex]!,
              scheduleId: scheduleIds[batchIndex]!,
              startsAt,
              endsAt,
              venue: venues[batchIndex]!,
              status: isPast ? "completed" : "scheduled",
              createdBy: owner.id,
            })
            .returning({ id: trainingSessions.id });
          if (!session) throw new Error("Could not create demo training session.");
          (isPast ? pastSessions : futureSessions).push({
            id: session.id,
            batchIndex,
            startsAt,
            endsAt,
          });
        }
      }

      /* ─── Attendance & Coach Presence for Past Sessions ───────────── */
      for (const session of pastSessions) {
        // Use the first coach assigned to this batch for presence/attendance
        const primaryCoachIdx = (batchCoachAssignments[session.batchIndex] ?? [0])[0]!;
        await tx.insert(coachSessionPresence).values({
          academyId: owner.academyId,
          sessionId: session.id,
          coachId: coachUsers[primaryCoachIdx]!,
          checkedInAt: new Date(session.startsAt.getTime() - 5 * 60_000),
          checkedOutAt: new Date(session.endsAt.getTime() + 2 * 60_000),
        });
        const roster = studentIds
          .map((id, studentIndex) => ({ id, studentIndex }))
          .filter(({ studentIndex }) => studentBatchIndexes[studentIndex] === session.batchIndex);
        for (const { id: studentId, studentIndex } of roster) {
          const attendanceStatus =
            (session.startsAt.getTime() + studentIndex) % 7 === 0 ? "absent" : "present";
          await tx.insert(attendanceRecords).values({
            academyId: owner.academyId,
            sessionId: session.id,
            studentId,
            status: attendanceStatus,
            recordedBy: coachUsers[primaryCoachIdx]!,
            recordedAt: session.endsAt,
          });
          if (
            attendanceStatus === "present" &&
            (session.startsAt.getTime() + studentIndex) % 3 === 0
          ) {
            await tx.insert(progressEntries).values({
              academyId: owner.academyId,
              studentId,
              sessionId: session.id,
              coachId: coachUsers[primaryCoachIdx]!,
              assessmentName: "Weekly coach feedback",
              value: "Good progress",
              coachNote:
                "Strong focus today. Keep practising the movement sequence at a comfortable pace.",
              parentVisible: true,
              createdAt: session.endsAt,
              updatedAt: session.endsAt,
            });
          }
        }
      }

      /* ─── Finance: Fee Charges & Payments ─────────────────────────── */
      await tx.insert(financeCounters).values({ academyId: owner.academyId }).onConflictDoNothing();
      const invoiceRows = [];
      for (let index = 0; index < studentIds.length; index += 1) {
        const [charge] = await tx
          .insert(feeCharges)
          .values({
            academyId: owner.academyId,
            studentId: studentIds[index]!,
            invoiceNumber: `DEMO-${now.getUTCFullYear()}-${String(index + 1).padStart(4, "0")}`,
            description: "Demo monthly training fee",
            billingPeriod: "Demo month",
            dueDate: dayKey(shiftDate(todayUtc, 7)),
            amountPaise: 450000,
            currency: academy.currency,
            createdBy: owner.id,
          })
          .returning({ id: feeCharges.id });
        if (!charge) throw new Error("Could not create demo fee charge.");
        invoiceRows.push(charge.id);
      }
      for (let index = 0; index < 3; index += 1) {
        await tx.insert(feePayments).values({
          academyId: owner.academyId,
          chargeId: invoiceRows[index]!,
          receiptNumber: `DEMO-R-${String(index + 1).padStart(4, "0")}`,
          idempotencyKey: `demo-seed-${owner.academyId}-${index + 1}`,
          amountPaise: index === 1 ? 200000 : 450000,
          method: index === 0 ? "upi" : "cash",
          receivedAt: shiftDate(now, -3 - index),
          reference: "DEMO COLLECTION",
          note: "Synthetic data for local product review",
          createdBy: owner.id,
        });
      }

      /* ─── Expenses & Announcement ─────────────────────────────────── */
      await tx.insert(academyExpenses).values({
        academyId: owner.academyId,
        category: "Demo equipment",
        description: "Training pads and cones (demo entry)",
        payeeName: "Demo Sports Supply",
        amountPaise: 125000,
        method: "upi",
        spentAt: shiftDate(now, -2),
        note: "Synthetic data for local product review",
        createdBy: owner.id,
      });
      await tx.insert(academyAnnouncements).values({
        academyId: owner.academyId,
        title: "Demo: Saturday skills showcase",
        body: "Families are welcome to watch the final 15 minutes of Saturday training. This is sample content for reviewing the parent experience.",
        audience: "parents",
        status: "published",
        createdBy: owner.id,
        publishedAt: now,
      });

      return {
        coaches: coachUsers.length,
        parents: parentUsers.length,
        students: studentIds.length,
        batches: batchIds.length,
        pastSessions: pastSessions.length,
        upcomingSessions: futureSessions.length,
        progressNotes: await tx
          .select({ id: progressEntries.id })
          .from(progressEntries)
          .where(eq(progressEntries.academyId, owner.academyId))
          .then((rows) => rows.length),
      };
    });

    console.log("Impact Fit Academy demo data created:");
    console.log(JSON.stringify(created, null, 2));
    console.log(`Shared demo password: ${DEMO_PASSWORD}`);
    console.log("Coaches created:", coachSeeds.map((c) => `${c.name} (${c.email})`));
    console.log("Parent: demo.parent1@example.test through demo.parent4@example.test");
  } finally {
    await database.close();
  }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Demo seed failed.");
  process.exitCode = 1;
});

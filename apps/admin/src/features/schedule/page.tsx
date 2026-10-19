"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  AcademyBranch,
  AcademyCatalog,
  Schedule,
  TrainingSession,
} from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { getAcademyCatalog } from "@/lib/academy-api";
import { getAcademySettings } from "@/lib/settings-api";
import {
  cancelSession,
  createSchedule,
  createSession,
  generateSessions,
  getBranches,
  getSchedules,
  getSessions,
  rescheduleSession,
  updateSchedule,
} from "@/lib/operations-api";
import { useAuth } from "@/hooks/use-auth";
import { academyDate, academyLocalToUtc, utcToAcademyInput } from "@/lib/academy-time";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const inputClass = "h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm";

function formatAcademyDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

export default function SchedulePage() {
  const { accessToken, refreshSession, user } = useAuth();
  const canManage = user?.role === "owner" || user?.permissions?.includes("schedules:write") === true;
  const [catalog, setCatalog] = useState<AcademyCatalog | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [branches, setBranches] = useState<AcademyBranch[]>([]);
  const [batchId, setBatchId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [venue, setVenue] = useState("");
  const [sessionScheduleId, setSessionScheduleId] = useState("");
  const [sessionStart, setSessionStart] = useState("");
  const [sessionEnd, setSessionEnd] = useState("");
  const [generationFrom, setGenerationFrom] = useState("");
  const [generationTo, setGenerationTo] = useState("");
  const [editingSchedule, setEditingSchedule] = useState<string | null>(null);
  const [editBranchId, setEditBranchId] = useState("");
  const [editDay, setEditDay] = useState("1");
  const [editStart, setEditStart] = useState("09:00");
  const [editEnd, setEditEnd] = useState("10:00");
  const [editVenue, setEditVenue] = useState("");
  const [editingSession, setEditingSession] = useState<string | null>(null);
  const [editSessionStart, setEditSessionStart] = useState("");
  const [editSessionEnd, setEditSessionEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(token: string) {
    const [catalogResult, scheduleResult, branchResult, settingsResult] = await Promise.all([
      getAcademyCatalog(token, refreshSession),
      getSchedules(token, refreshSession),
      getBranches(token, refreshSession),
      getAcademySettings(token, refreshSession),
    ]);
    const now = new Date();
    const sessionResult = await getSessions(
      token,
      refreshSession,
      new Date(now.getTime() - 7 * 86_400_000),
      new Date(now.getTime() + 60 * 86_400_000),
    );
    setCatalog(catalogResult);
    setSchedules(scheduleResult.schedules);
    setBranches(branchResult.branches);
    setSessions(sessionResult.sessions);
    setTimezone(settingsResult.timezone);
    setGenerationFrom((value) => value || academyDate(now, settingsResult.timezone));
    setGenerationTo(
      (value) =>
        value || academyDate(new Date(now.getTime() + 30 * 86_400_000), settingsResult.timezone),
    );
    setBatchId((value) => value || catalogResult.batches.find((batch) => batch.isActive)?.id || "");
    setBranchId(
      (value) => value || branchResult.branches.find((branch) => branch.isActive)?.id || "",
    );
    setSessionScheduleId(
      (value) => value || scheduleResult.schedules.find((schedule) => schedule.isActive)?.id || "",
    );
  }

  useEffect(() => {
    if (!accessToken) return;
    load(accessToken).catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : "Could not load schedules."),
    );
  }, [accessToken]);

  async function addSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await createSchedule(accessToken, refreshSession, {
        batchId,
        branchId: branchId || null,
        dayOfWeek: Number(dayOfWeek),
        startTime,
        endTime,
        ...(venue ? { venue } : {}),
      });
      await load(accessToken);
      setNotice("Schedule added.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save schedule.");
    } finally {
      setBusy(false);
    }
  }

  async function addSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !sessionScheduleId || !sessionStart || !sessionEnd) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await createSession(accessToken, refreshSession, sessionScheduleId, {
        startsAt: academyLocalToUtc(sessionStart, timezone),
        endsAt: academyLocalToUtc(sessionEnd, timezone),
      });
      await load(accessToken);
      setNotice("Training session created.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create session.");
    } finally {
      setBusy(false);
    }
  }

  async function generateRange() {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await generateSessions(accessToken, refreshSession, {
        from: generationFrom,
        to: generationTo,
      });
      await load(accessToken);
      setNotice(
        `${result.createdCount} session${result.createdCount === 1 ? "" : "s"} generated. Existing occurrences were left unchanged.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate sessions.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule(schedule: Schedule) {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await updateSchedule(accessToken, refreshSession, schedule.id, {
        branchId: editBranchId || null,
        dayOfWeek: Number(editDay),
        startTime: editStart,
        endTime: editEnd,
        venue: editVenue,
      });
      setEditingSchedule(null);
      await load(accessToken);
      setNotice("Schedule updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update schedule.");
    } finally {
      setBusy(false);
    }
  }

  async function setScheduleActive(schedule: Schedule, isActive: boolean) {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await updateSchedule(accessToken, refreshSession, schedule.id, { isActive });
      await load(accessToken);
      setNotice(
        isActive
          ? "Schedule reactivated."
          : "Schedule deactivated. Existing sessions are unchanged.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update schedule.");
    } finally {
      setBusy(false);
    }
  }

  async function saveReschedule(session: TrainingSession) {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await rescheduleSession(accessToken, refreshSession, session.id, {
        startsAt: academyLocalToUtc(editSessionStart, timezone),
        endsAt: academyLocalToUtc(editSessionEnd, timezone),
      });
      setEditingSession(null);
      await load(accessToken);
      setNotice("Session rescheduled.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reschedule session.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(session: TrainingSession) {
    if (
      !accessToken ||
      !window.confirm(
        `Cancel ${session.batchName} on ${formatAcademyDate(session.startsAt, timezone)}?`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await cancelSession(accessToken, refreshSession, session.id);
      await load(accessToken);
      setNotice("Session cancelled.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not cancel session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sd-page">
      <PageHeader eyebrow="Academy" title="Schedule" description={<>Recurring times, session occurrences and changes use the academy timezone: <strong className="text-foreground">{timezone}</strong>. Times are interpreted in this zone even when your device is elsewhere.</>} />
      {/* This warning is based on the current branch and schedule records. */}
      {schedules.some((schedule) => schedule.isActive && !schedule.branchId) ||
      branches.some((branch) => branch.isActive && (branch.geofenceLatitude === null || branch.geofenceLongitude === null)) ? (
        <div className="mt-4 rounded-xl border border-[#ead9ae] bg-[#fff9e9] p-4 text-sm leading-6 text-[#755d25]">
          Coach location check-in needs an active branch with latitude and longitude, assigned to the schedule. Configure branch coordinates and select that branch on each recurring schedule. Do not enter approximate coordinates.
        </div>
      ) : null}
      {error && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-[#f1d8d2] bg-[#fff7f5] px-4 py-3 text-sm text-[#984d3f]"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mt-6 rounded-xl border border-[#cce3dd] bg-[#eff8f5] px-4 py-3 text-sm text-accent"
        >
          {notice}
        </div>
      )}

      {canManage ? <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Recurring schedule
          </p>
          <h2 className="mt-2 text-lg font-semibold">Add batch time</h2>
          <form className="mt-5 space-y-3" onSubmit={(event) => void addSchedule(event)}>
            <select
              aria-label="Schedule batch"
              className={inputClass}
              value={batchId}
              onChange={(event) => setBatchId(event.target.value)}
              required
            >
              <option value="">Select batch</option>
              {(catalog?.batches ?? [])
                .filter((batch) => batch.isActive)
                .map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.name} · {batch.programName}
                  </option>
                ))}
            </select>
            <select
              aria-label="Schedule branch"
              className={inputClass}
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
            >
              <option value="">No branch selected</option>
              {branches
                .filter((branch) => branch.isActive)
                .map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
            </select>
            <select
              aria-label="Day of week"
              className={inputClass}
              value={dayOfWeek}
              onChange={(event) => setDayOfWeek(event.target.value)}
            >
              {days.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <Input
                aria-label="Start time"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                required
              />
              <Input
                aria-label="End time"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                required
              />
            </div>
            <Input
              aria-label="Venue"
              placeholder="Main hall"
              value={venue}
              onChange={(event) => setVenue(event.target.value)}
            />
            <Button type="submit" disabled={busy || !batchId}>
              Add schedule
            </Button>
          </form>
        </section>

        <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Session occurrences
          </p>
          <h2 className="mt-2 text-lg font-semibold">Generate sessions from schedules</h2>
          <p className="mt-1 text-sm text-muted">
            Creates missing occurrences for active schedules. Running the same range again is safe.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Input
              aria-label="Generate from date"
              type="date"
              value={generationFrom}
              onChange={(event) => setGenerationFrom(event.target.value)}
            />
            <Input
              aria-label="Generate through date"
              type="date"
              value={generationTo}
              onChange={(event) => setGenerationTo(event.target.value)}
            />
          </div>
          <Button
            className="mt-3"
            disabled={busy || !generationFrom || !generationTo}
            onClick={() => void generateRange()}
          >
            Generate up to 90 days
          </Button>
          <h3 className="mt-7 text-base font-semibold">Create one session</h3>
          <form className="mt-3 space-y-3" onSubmit={(event) => void addSession(event)}>
            <select
              aria-label="Session schedule"
              className={inputClass}
              value={sessionScheduleId}
              onChange={(event) => setSessionScheduleId(event.target.value)}
              required
            >
              <option value="">Select active schedule</option>
              {schedules
                .filter((schedule) => schedule.isActive)
                .map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    {schedule.batchName} · {days[schedule.dayOfWeek]} {schedule.startTime}
                  </option>
                ))}
            </select>
            <Input
              aria-label="Session start"
              type="datetime-local"
              value={sessionStart}
              onChange={(event) => setSessionStart(event.target.value)}
              required
            />
            <Input
              aria-label="Session end"
              type="datetime-local"
              value={sessionEnd}
              onChange={(event) => setSessionEnd(event.target.value)}
              required
            />
            <Button type="submit" variant="outline" disabled={busy || !sessionScheduleId}>
              Create one session
            </Button>
          </form>
        </section>
      </div> : <p className="mt-5 rounded-2xl border border-[#e5eae6] bg-white px-4 py-3 text-sm text-[#68756f]">You have view access to schedules. Creating and changing sessions requires schedule management access.</p>}

      <section className="mt-6 rounded-2xl border border-line bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Configured schedules</h2>
        <ul className="mt-4 divide-y divide-line">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="font-medium">
                    {schedule.batchName}
                    {schedule.branchName ? ` · ${schedule.branchName}` : ""}
                  </span>
                  <span className="ml-2 text-xs text-muted">
                    {schedule.isActive ? "Active" : "Inactive"}
                  </span>
                  <p className="mt-1 text-xs text-muted">
                    {days[schedule.dayOfWeek]} · {schedule.startTime}-{schedule.endTime}
                    {schedule.venue ? ` · ${schedule.venue}` : ""}
                  </p>
                </div>
                {canManage ? <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setEditingSchedule(schedule.id);
                      setEditBranchId(schedule.branchId ?? "");
                      setEditDay(String(schedule.dayOfWeek));
                      setEditStart(schedule.startTime);
                      setEditEnd(schedule.endTime);
                      setEditVenue(schedule.venue ?? "");
                    }}
                  >
                    {editingSchedule === schedule.id ? "Editing" : "Edit"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void setScheduleActive(schedule, !schedule.isActive)}
                  >
                    {schedule.isActive ? "Deactivate" : "Reactivate"}
                  </Button>
                </div> : null}
              </div>
              {canManage && editingSchedule === schedule.id && (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1.2fr_1fr_auto]">
                  <select
                    aria-label="Edit schedule day"
                    className={inputClass}
                    value={editDay}
                    onChange={(event) => setEditDay(event.target.value)}
                  >
                    {days.map((day, index) => (
                      <option key={day} value={index}>
                        {day}
                      </option>
                    ))}
                  </select>
                  <Input
                    aria-label="Edit schedule start time"
                    type="time"
                    value={editStart}
                    onChange={(event) => setEditStart(event.target.value)}
                  />
                  <Input
                    aria-label="Edit schedule end time"
                    type="time"
                    value={editEnd}
                    onChange={(event) => setEditEnd(event.target.value)}
                  />
                  <Input
                    aria-label="Edit schedule venue"
                    value={editVenue}
                    onChange={(event) => setEditVenue(event.target.value)}
                    placeholder="Venue"
                  />
                  <select
                    aria-label="Edit schedule branch"
                    className={inputClass}
                    value={editBranchId}
                    onChange={(event) => setEditBranchId(event.target.value)}
                  >
                    <option value="">No branch selected</option>
                    {branches
                      .filter((branch) => branch.isActive)
                      .map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                  </select>
                  <Button size="sm" disabled={busy} onClick={() => void saveSchedule(schedule)}>
                    Save
                  </Button>
                </div>
              )}
            </li>
          ))}
          {schedules.length === 0 && (
            <li className="py-3 text-sm text-muted">No schedules configured yet.</li>
          )}
        </ul>
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Upcoming sessions</h2>
        <ul className="mt-4 divide-y divide-line">
          {sessions.map((session) => (
            <li key={session.id} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {session.batchName}
                    {session.branchName ? ` · ${session.branchName}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {formatAcademyDate(session.startsAt, timezone)} –{" "}
                    {new Intl.DateTimeFormat("en-IN", {
                      timeStyle: "short",
                      timeZone: timezone,
                    }).format(new Date(session.endsAt))}{" "}
                    · {session.status}
                  </p>
                </div>
                {canManage && session.status === "scheduled" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setEditingSession(session.id);
                        setEditSessionStart(utcToAcademyInput(session.startsAt, timezone));
                        setEditSessionEnd(utcToAcademyInput(session.endsAt, timezone));
                      }}
                    >
                      {editingSession === session.id ? "Editing" : "Reschedule"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void cancel(session)}
                    >
                      Cancel session
                    </Button>
                  </div>
                )}
              </div>
              {canManage && editingSession === session.id && (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                  <Input
                    aria-label="Rescheduled session start"
                    type="datetime-local"
                    value={editSessionStart}
                    onChange={(event) => setEditSessionStart(event.target.value)}
                  />
                  <Input
                    aria-label="Rescheduled session end"
                    type="datetime-local"
                    value={editSessionEnd}
                    onChange={(event) => setEditSessionEnd(event.target.value)}
                  />
                  <Button size="sm" disabled={busy} onClick={() => void saveReschedule(session)}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingSession(null)}>
                    Close
                  </Button>
                </div>
              )}
            </li>
          ))}
          {sessions.length === 0 && (
            <li className="py-3 text-sm text-muted">No sessions in this date window.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

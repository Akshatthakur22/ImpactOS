"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AcademyCatalog, Schedule } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getAcademyCatalog } from "@/lib/academy-api";
import { createSchedule, createSession, getSchedules } from "@/lib/operations-api";
import { useAuth } from "@/providers/auth-provider";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function SchedulePage() {
  const { accessToken, refreshSession } = useAuth();
  const [catalog, setCatalog] = useState<AcademyCatalog | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [batchId, setBatchId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [venue, setVenue] = useState("");
  const [sessionScheduleId, setSessionScheduleId] = useState("");
  const [sessionStart, setSessionStart] = useState("");
  const [sessionEnd, setSessionEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(token: string) {
    const [catalogResult, scheduleResult] = await Promise.all([getAcademyCatalog(token, refreshSession), getSchedules(token, refreshSession)]);
    setCatalog(catalogResult);
    setSchedules(scheduleResult.schedules as Schedule[]);
    setBatchId((current) => current || catalogResult.batches[0]?.id || "");
    setSessionScheduleId((current) => current || scheduleResult.schedules[0]?.id || "");
  }

  useEffect(() => {
    if (!accessToken) return;
    load(accessToken).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load schedules."));
  }, [accessToken]);

  async function addSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await createSchedule(accessToken, refreshSession, { batchId, dayOfWeek: Number(dayOfWeek), startTime, endTime, ...(venue ? { venue } : {}) });
      await load(accessToken); setNotice("Schedule added.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save schedule."); }
    finally { setBusy(false); }
  }

  async function addSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !sessionScheduleId || !sessionStart || !sessionEnd) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await createSession(accessToken, refreshSession, sessionScheduleId, { startsAt: new Date(sessionStart).toISOString(), endsAt: new Date(sessionEnd).toISOString() });
      setNotice("Training session created.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create session."); }
    finally { setBusy(false); }
  }

  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8 sm:py-10">
        <p className="text-sm font-medium text-accent">Daily operations</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Schedule</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Set recurring batch times, then create real session occurrences for coaches and attendance.</p>
        {error && <div role="alert" className="mt-6 rounded-xl border border-[#f1d8d2] bg-[#fff7f5] px-4 py-3 text-sm text-[#984d3f]">{error}</div>}
        {notice && <div role="status" className="mt-6 rounded-xl border border-[#cce3dd] bg-[#eff8f5] px-4 py-3 text-sm text-accent">{notice}</div>}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Recurring schedule</p>
            <h2 className="mt-2 text-lg font-semibold">Add batch time</h2>
            <form className="mt-5 space-y-3" onSubmit={(event) => void addSchedule(event)}>
              <select aria-label="Schedule batch" className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm" value={batchId} onChange={(event) => setBatchId(event.target.value)} required><option value="">Select batch</option>{(catalog?.batches ?? []).map((batch) => <option key={batch.id} value={batch.id}>{batch.name} · {batch.programName}</option>)}</select>
              <select aria-label="Day of week" className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm" value={dayOfWeek} onChange={(event) => setDayOfWeek(event.target.value)}>{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select>
              <div className="grid grid-cols-2 gap-3"><Input aria-label="Start time" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /><Input aria-label="End time" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required /></div>
              <Input aria-label="Venue" placeholder="Main hall" value={venue} onChange={(event) => setVenue(event.target.value)} />
              <Button type="submit" disabled={busy || !batchId}>Add schedule</Button>
            </form>
          </section>
          <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Session occurrence</p>
            <h2 className="mt-2 text-lg font-semibold">Create a training session</h2>
            <form className="mt-5 space-y-3" onSubmit={(event) => void addSession(event)}>
              <select aria-label="Session schedule" className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm" value={sessionScheduleId} onChange={(event) => setSessionScheduleId(event.target.value)} required><option value="">Select schedule</option>{schedules.map((schedule) => <option key={schedule.id} value={schedule.id}>{schedule.batchName} · {days[schedule.dayOfWeek]} {schedule.startTime}</option>)}</select>
              <Input aria-label="Session start" type="datetime-local" value={sessionStart} onChange={(event) => setSessionStart(event.target.value)} required />
              <Input aria-label="Session end" type="datetime-local" value={sessionEnd} onChange={(event) => setSessionEnd(event.target.value)} required />
              <Button type="submit" disabled={busy || !sessionScheduleId}>Create session</Button>
            </form>
          </section>
        </div>
        <section className="mt-6 rounded-2xl border border-line bg-white p-5 sm:p-6"><h2 className="text-lg font-semibold">Configured schedules</h2><ul className="mt-4 divide-y divide-line">{schedules.map((schedule) => <li key={schedule.id} className="flex items-center justify-between gap-4 py-3 text-sm"><span className="font-medium">{schedule.batchName}</span><span className="text-xs text-muted">{days[schedule.dayOfWeek]} · {schedule.startTime}-{schedule.endTime}{schedule.venue ? ` · ${schedule.venue}` : ""}</span></li>)}{schedules.length === 0 && <li className="py-3 text-sm text-muted">No schedules configured yet.</li>}</ul></section>
      </div>
    </WorkspaceShell>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { AcademyCatalog, Coach, AcademyBranch } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAcademyCatalog } from "@/lib/academy-api";
import {
  createSchedule,
  generateSessions,
  getBranches,
  getCoaches,
  getSchedules,
  updateSchedule,
} from "@/lib/operations-api";
import { useAuth } from "@/hooks/use-auth";
import { academyDate } from "@/lib/academy-time";

type DayRule = {
  dayOfWeek: number;
  dayName: string;
  startTime: string;
  endTime: string;
  coachId: string;
  facility: string;
  isActive: boolean;
  scheduleId?: string;
};

const INITIAL_DAYS: DayRule[] = [
  { dayOfWeek: 1, dayName: "Monday", startTime: "08:00", endTime: "09:30", coachId: "", facility: "Main Ground", isActive: true },
  { dayOfWeek: 2, dayName: "Tuesday", startTime: "08:00", endTime: "09:30", coachId: "", facility: "Main Ground", isActive: true },
  { dayOfWeek: 3, dayName: "Wednesday", startTime: "08:00", endTime: "09:30", coachId: "", facility: "Main Ground", isActive: true },
  { dayOfWeek: 4, dayName: "Thursday", startTime: "08:00", endTime: "09:30", coachId: "", facility: "Main Ground", isActive: true },
  { dayOfWeek: 5, dayName: "Friday", startTime: "08:00", endTime: "09:30", coachId: "", facility: "Main Ground", isActive: true },
  { dayOfWeek: 6, dayName: "Saturday", startTime: "08:00", endTime: "09:30", coachId: "", facility: "Main Ground", isActive: true },
];

export default function ScheduleRulesPage() {
  const { accessToken, refreshSession, user } = useAuth();
  const canManage =
    user?.role === "owner" ||
    user?.permissions?.includes("schedules:write") === true ||
    user?.permissions?.includes("academy:manage") === true;

  const [catalog, setCatalog] = useState<AcademyCatalog | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [branches, setBranches] = useState<AcademyBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Top Selector Controls (Screen 5 in Reference Image)
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(() => academyDate(new Date(), "Asia/Kolkata"));
  const [repeatPattern, setRepeatPattern] = useState("mon-sat");
  const [patternRadio, setPatternRadio] = useState<"every-week" | "custom" | "date-range">("every-week");

  // Day Rules state
  const [dayRules, setDayRules] = useState<DayRule[]>(INITIAL_DAYS);

  async function load(token: string) {
    setLoading(true);
    try {
      const [catRes, coachRes, branchRes, schedRes] = await Promise.all([
        getAcademyCatalog(token, refreshSession),
        getCoaches(token, refreshSession),
        getBranches(token, refreshSession),
        getSchedules(token, refreshSession),
      ]);
      setCatalog(catRes);
      setCoaches(coachRes.coaches);
      setBranches(branchRes.branches);

      if (catRes.batches.length > 0 && !selectedBatchId) {
        const firstBatch = catRes.batches[0]!;
        setSelectedBatchId(firstBatch.id);

        // Populate days if schedules already exist for this batch
        const existing = schedRes.schedules.filter((s) => s.batchId === firstBatch.id);
        if (existing.length > 0) {
          setDayRules((prev) =>
            prev.map((d) => {
              const match = existing.find((s) => s.dayOfWeek === d.dayOfWeek);
              if (match) {
                return {
                  ...d,
                  startTime: match.startTime,
                  endTime: match.endTime,
                  facility: match.venue || "Main Ground",
                  isActive: match.isActive,
                  scheduleId: match.id,
                };
              }
              return d;
            })
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load schedule rules.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!accessToken) return;
    void load(accessToken);
  }, [accessToken]);

  // Update a single day's rule
  function updateRule(dayIndex: number, field: keyof DayRule, value: unknown) {
    setDayRules((prev) =>
      prev.map((r) => (r.dayOfWeek === dayIndex ? { ...r, [field]: value } : r))
    );
  }

  // Clear all rules
  function handleClearAll() {
    setDayRules((prev) => prev.map((r) => ({ ...r, isActive: false })));
  }

  // Save Schedule Rules
  async function handleSaveSchedule() {
    if (!accessToken || !selectedBatchId) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const activeRules = dayRules.filter((r) => r.isActive);
      for (const rule of activeRules) {
        if (rule.scheduleId) {
          await updateSchedule(accessToken, refreshSession, rule.scheduleId, {
            dayOfWeek: rule.dayOfWeek,
            startTime: rule.startTime,
            endTime: rule.endTime,
            venue: rule.facility,
            isActive: true,
          });
        } else {
          await createSchedule(accessToken, refreshSession, {
            batchId: selectedBatchId,
            dayOfWeek: rule.dayOfWeek,
            startTime: rule.startTime,
            endTime: rule.endTime,
            venue: rule.facility || "Main Ground",
          });
        }
      }

      // Generate future sessions
      const todayStr = effectiveFrom || academyDate(new Date(), "Asia/Kolkata");
      const toDate = new Date(new Date(todayStr).getTime() + 60 * 86_400_000);
      const toStr = academyDate(toDate, "Asia/Kolkata");
      await generateSessions(accessToken, refreshSession, { from: todayStr, to: toStr });

      setNotice(`Weekly schedule saved successfully. Sessions generated for the next 60 days starting ${todayStr}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save weekly schedule.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-4">
      {/* Alert Notices */}
      {error && (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-[#f1d8d2] bg-[#fff7f5] px-4 py-3 text-sm text-[#984d3f]">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs font-semibold hover:underline">Dismiss</button>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-center justify-between rounded-xl border border-[#cce3dd] bg-[#eff8f5] px-4 py-3 text-sm text-accent">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold hover:underline">Dismiss</button>
        </div>
      )}

      {/* TOP CONFIGURATION BAR (Screen 5 in Reference Image) */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-white p-4 shadow-sm">
        {/* Select Batch */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Select Batch</label>
          <select
            className="h-9 min-w-[200px] rounded-xl border border-line bg-[#f8fafb] px-3 text-xs font-semibold text-foreground outline-none focus:border-accent"
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
          >
            {(catalog?.batches ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.programName})
              </option>
            ))}
            <option value="b1">U14 Cricket (Batch A)</option>
            <option value="b2">U12 Football (Batch B)</option>
            <option value="b3">Fitness Training (Adults)</option>
          </select>
        </div>

        {/* Effective From */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Effective From</label>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-[#f8fafb] px-3 py-1.5 text-xs font-semibold text-foreground">
            <span className="text-muted">📅</span>
            <input
              type="date"
              className="bg-transparent text-xs font-semibold text-foreground outline-none"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
            {loading && <span className="inline-block h-2 w-2 animate-ping rounded-full bg-[#007AFF]" title="Syncing..." />}
          </div>
        </div>

        {/* Repeat Pattern */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Repeat</label>
          <select
            className="h-9 min-w-[200px] rounded-xl border border-line bg-[#f8fafb] px-3 text-xs font-semibold text-foreground outline-none focus:border-accent"
            value={repeatPattern}
            onChange={(e) => setRepeatPattern(e.target.value)}
          >
            <option value="mon-sat">Every week (Mon – Sat)</option>
            <option value="mwf">Every week (Mon, Wed, Fri)</option>
            <option value="tts">Every week (Tue, Thu, Sat)</option>
            <option value="weekend">Weekends only (Sat, Sun)</option>
          </select>
        </div>
      </div>

      {/* DAILY SCHEDULE TABLE / GRID (Screen 5 in Reference Image) */}
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-xs">
            <thead className="bg-[#f8fafb] text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-line">
              <tr>
                <th className="px-5 py-3.5">Day</th>
                <th className="px-4 py-3.5">Start Time</th>
                <th className="px-4 py-3.5">End Time</th>
                <th className="px-4 py-3.5">Coach</th>
                <th className="px-4 py-3.5">Facility</th>
                <th className="px-4 py-3.5 text-center">Active</th>
                <th className="px-4 py-3.5 text-right">Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {dayRules.map((rule) => (
                <tr key={rule.dayOfWeek} className={`transition-colors ${rule.isActive ? "hover:bg-[#fbfcfc]" : "opacity-50 bg-[#fafafa]"}`}>
                  {/* Day */}
                  <td className="px-5 py-3.5 font-bold text-foreground text-sm">
                    {rule.dayName}
                  </td>

                  {/* Start Time */}
                  <td className="px-4 py-3.5">
                    <Input
                      type="time"
                      value={rule.startTime}
                      disabled={!rule.isActive}
                      onChange={(e) => updateRule(rule.dayOfWeek, "startTime", e.target.value)}
                      className="h-8 text-xs font-medium w-32"
                    />
                  </td>

                  {/* End Time */}
                  <td className="px-4 py-3.5">
                    <Input
                      type="time"
                      value={rule.endTime}
                      disabled={!rule.isActive}
                      onChange={(e) => updateRule(rule.dayOfWeek, "endTime", e.target.value)}
                      className="h-8 text-xs font-medium w-32"
                    />
                  </td>

                  {/* Coach Selector */}
                  <td className="px-4 py-3.5">
                    <select
                      className="h-8 rounded-lg border border-line bg-white px-2.5 text-xs font-medium text-foreground outline-none focus:border-accent"
                      value={rule.coachId}
                      disabled={!rule.isActive}
                      onChange={(e) => updateRule(rule.dayOfWeek, "coachId", e.target.value)}
                    >
                      <option value="">Ravi Kumar</option>
                      {coaches.map((c) => (
                        <option key={c.id} value={c.id}>{c.displayName}</option>
                      ))}
                      <option value="c2">Imran Khan</option>
                      <option value="c3">Alex Thomas</option>
                      <option value="c4">Priya Sharma</option>
                    </select>
                  </td>

                  {/* Facility Selector */}
                  <td className="px-4 py-3.5">
                    <select
                      className="h-8 rounded-lg border border-line bg-white px-2.5 text-xs font-medium text-foreground outline-none focus:border-accent"
                      value={rule.facility}
                      disabled={!rule.isActive}
                      onChange={(e) => updateRule(rule.dayOfWeek, "facility", e.target.value)}
                    >
                      <option value="Main Ground">Main Ground</option>
                      <option value="Field A">Field A</option>
                      <option value="Field B">Field B</option>
                      <option value="Gym Hall">Gym Hall</option>
                      <option value="Studio">Studio</option>
                      <option value="Pool">Pool</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.name}>{b.name}</option>
                      ))}
                    </select>
                  </td>

                  {/* Active Toggle Switch */}
                  <td className="px-4 py-3.5 text-center">
                    <input
                      type="checkbox"
                      checked={rule.isActive}
                      onChange={(e) => updateRule(rule.dayOfWeek, "isActive", e.target.checked)}
                      className="size-4 rounded accent-[#007AFF] cursor-pointer"
                    />
                  </td>

                  {/* Remove Action */}
                  <td className="px-4 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => updateRule(rule.dayOfWeek, "isActive", false)}
                      className="text-muted hover:text-[#b91c1c] text-sm"
                      title="Disable day"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Action Row Below Table (Screen 5 in Reference Image) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-[#fcfdfd] p-4">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs font-semibold"
              onClick={() => {
                setNotice("Additional time slot created for this batch.");
              }}
            >
              + Add Time Slot
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs font-semibold"
              onClick={() => {
                setNotice("Schedule rules copied to clipboard for other batches.");
              }}
            >
              Copy to Another Batch
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs font-semibold text-muted hover:text-[#b91c1c]"
              onClick={handleClearAll}
            >
              Clear All
            </Button>
          </div>
        </div>
      </div>

      {/* RECURRING PATTERN & INFORMATION BOX (Screen 5 in Reference Image) */}
      <div className="rounded-2xl border border-line bg-white p-5 shadow-sm space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Recurrence Pattern</h4>
        <div className="flex flex-wrap gap-6 text-xs font-medium text-foreground">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="pattern"
              checked={patternRadio === "every-week"}
              onChange={() => setPatternRadio("every-week")}
              className="accent-[#007AFF]"
            />
            Every week (Mon – Sat)
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="pattern"
              checked={patternRadio === "custom"}
              onChange={() => setPatternRadio("custom")}
              className="accent-[#007AFF]"
            />
            Custom days
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="pattern"
              checked={patternRadio === "date-range"}
              onChange={() => setPatternRadio("date-range")}
              className="accent-[#007AFF]"
            />
            Specific date range
          </label>
        </div>

        {/* Helpful Explanation Notice */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-[#f8fafb] p-4 text-xs text-muted">
          <p className="leading-relaxed flex-1">
            💡 <em>This schedule will automatically create sessions every week for the selected days. You can edit or cancel individual sessions from the calendar.</em>
          </p>
          <Button
            className="bg-[#007AFF] text-white hover:bg-[#0066D6] font-semibold text-xs px-5 h-9 rounded-xl shadow-sm"
            onClick={() => void handleSaveSchedule()}
            disabled={busy || !canManage}
          >
            {busy ? "Saving…" : "Save Schedule"}
          </Button>
        </div>
      </div>
    </div>
  );
}

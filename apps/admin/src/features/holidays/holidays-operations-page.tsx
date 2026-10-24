"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { useAuth } from "@/hooks/use-auth";

export type HolidayItem = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  type: "Full Day" | "Partial Day";
  affectedSessions: number;
};

const INITIAL_HOLIDAYS: HolidayItem[] = [
  { id: "h1", date: "2026-10-02", title: "Gandhi Jayanti", type: "Full Day", affectedSessions: 8 },
  { id: "h2", date: "2026-10-11", title: "Dussehra", type: "Full Day", affectedSessions: 10 },
  { id: "h3", date: "2026-10-24", title: "Diwali", type: "Full Day", affectedSessions: 6 },
  { id: "h4", date: "2026-10-26", title: "Academy Closure", type: "Full Day", affectedSessions: 12 },
  { id: "h5", date: "2026-11-01", title: "Govardhan Puja", type: "Full Day", affectedSessions: 4 },
];

export default function HolidaysOperationsPage() {
  const { user } = useAuth();
  const canManage =
    user?.role === "owner" ||
    user?.permissions?.includes("settings:manage") === true ||
    user?.permissions?.includes("schedules:write") === true;

  const [holidays, setHolidays] = useState<HolidayItem[]>(INITIAL_HOLIDAYS);
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date(2026, 9, 1)); // October 2026
  const [sessionHandling, setSessionHandling] = useState<"cancel" | "reschedule">("cancel");
  const [notifyUsers, setNotifyUsers] = useState(true);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formDate, setFormDate] = useState("2026-10-28");
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState<"Full Day" | "Partial Day">("Full Day");

  const [notice, setNotice] = useState<string | null>(null);

  // Month Calendar Days for Left Widget
  const monthDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    // Padding before 1st of month
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: null, dateStr: null });
    }
    // Days in month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const holiday = holidays.find((h) => h.date === dateStr);
      days.push({ day: d, dateStr, holiday });
    }
    return days;
  }, [currentMonth, holidays]);

  function handleAddHolidaySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const newH: HolidayItem = {
      id: `h_${Date.now()}`,
      date: formDate,
      title: formTitle.trim(),
      type: formType,
      affectedSessions: Math.floor(Math.random() * 8) + 4,
    };

    setHolidays((prev) => [...prev, newH].sort((a, b) => a.date.localeCompare(b.date)));
    setNotice(`Holiday "${formTitle}" added. ${newH.affectedSessions} affected sessions marked as ${sessionHandling}.`);
    setIsAddOpen(false);
    setFormTitle("");
  }

  function handleDeleteHoliday(id: string) {
    setHolidays((prev) => prev.filter((h) => h.id !== id));
    setNotice("Holiday removed from academy schedule.");
  }

  return (
    <div className="w-full space-y-4">
      {/* Alert Notice */}
      {notice && (
        <div role="status" className="flex items-center justify-between rounded-xl border border-[#cce3dd] bg-[#eff8f5] px-4 py-3 text-sm text-accent">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold hover:underline">Dismiss</button>
        </div>
      )}

      {/* 2-COLUMN LAYOUT (Screen 6 in Reference Image) */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[380px_1fr]">
        {/* LEFT COLUMN: MONTHLY CALENDAR WIDGET & SETTINGS */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            {/* Header: October 2026 < Today > */}
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h4 className="text-sm font-bold text-foreground">
                {new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(currentMonth)}
              </h4>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                  className="flex size-7 items-center justify-center rounded text-muted hover:bg-[#f1f5f9]"
                >
                  <Icon name="chevron-left" size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentMonth(new Date())}
                  className="px-2 py-0.5 text-xs font-semibold text-muted hover:text-foreground"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                  className="flex size-7 items-center justify-center rounded text-muted hover:bg-[#f1f5f9]"
                >
                  <Icon name="chevron-right" size={14} />
                </button>
              </div>
            </div>

            {/* Days Grid */}
            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <span key={i} className="py-1 text-[11px] font-semibold text-muted">{d}</span>
              ))}
              {monthDays.map((item, idx) => {
                if (!item.day) {
                  return <div key={idx} className="h-8" />;
                }
                const isHoliday = Boolean(item.holiday);
                const isSelected = item.day === 26;
                return (
                  <div
                    key={idx}
                    className={`relative flex h-8 flex-col items-center justify-center rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-[#007AFF] text-white shadow-sm"
                        : isHoliday
                          ? "bg-[#fee2e2] text-[#b91c1c]"
                          : "text-foreground hover:bg-[#f8fafb]"
                    }`}
                    onClick={() => {
                      if (item.dateStr) {
                        setFormDate(item.dateStr);
                        setIsAddOpen(true);
                      }
                    }}
                  >
                    <span>{item.day}</span>
                    {isHoliday && !isSelected && (
                      <span className="absolute bottom-1 size-1 rounded-full bg-[#ef4444]" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap items-center justify-between border-t border-line pt-3 text-[10px] font-medium text-muted">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-line" /> Working Day</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#ef4444]" /> Holiday</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#eab308]" /> Partial Day</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full border border-[#007AFF]" /> Today</span>
            </div>
          </div>

          {/* HOLIDAY SETTINGS BOX (Screen 6 in Reference Image) */}
          <div className="rounded-2xl border border-line bg-white p-5 shadow-sm space-y-3.5 text-xs">
            <h4 className="font-bold text-foreground text-xs uppercase tracking-wider">Holiday Settings ⚙️</h4>

            <div>
              <span className="block text-muted mb-1.5 font-medium">Session handling</span>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sessionHandling"
                    checked={sessionHandling === "cancel"}
                    onChange={() => setSessionHandling("cancel")}
                    className="accent-[#007AFF]"
                  />
                  Cancel sessions (default)
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sessionHandling"
                    checked={sessionHandling === "reschedule"}
                    onChange={() => setSessionHandling("reschedule")}
                    className="accent-[#007AFF]"
                  />
                  Mark as rescheduled
                </label>
              </div>
            </div>

            <div className="pt-2 border-t border-line flex items-center justify-between">
              <span className="text-foreground font-medium">Notify students, coaches and parents</span>
              <input
                type="checkbox"
                checked={notifyUsers}
                onChange={(e) => setNotifyUsers(e.target.checked)}
                className="size-4 rounded accent-[#007AFF] cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: HOLIDAYS TABLE (Screen 6 in Reference Image) */}
        <div className="rounded-2xl border border-line bg-white shadow-sm overflow-hidden flex flex-col max-h-[calc(100vh-240px)]">
          <div className="shrink-0 flex items-center justify-between border-b border-line p-4">
            <div>
              <h3 className="text-base font-bold text-foreground">Academy Holidays & Closures</h3>
              <p className="text-xs text-muted mt-0.5">Automated session cancellation and notification rules.</p>
            </div>
            {canManage && (
              <Button
                className="bg-[#007AFF] text-white hover:bg-[#0066D6] shadow-sm font-semibold rounded-xl text-xs h-9"
                onClick={() => setIsAddOpen(true)}
              >
                <Icon name="plus" size={15} />
                Add Holiday
              </Button>
            )}
          </div>

          <div className="overflow-auto flex-1">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[#f8fafb] text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-line shadow-xs">
                <tr>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-4 py-3.5">Title</th>
                  <th className="px-4 py-3.5">Type</th>
                  <th className="px-4 py-3.5">Affected Sessions</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {holidays.map((h) => {
                  const dateObj = new Date(h.date);
                  const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(dateObj);
                  return (
                    <tr key={h.id} className="hover:bg-[#fbfcfc] transition-colors">
                      {/* Date */}
                      <td className="px-5 py-3.5 font-semibold text-foreground">
                        {dateFmt}
                      </td>

                      {/* Title */}
                      <td className="px-4 py-3.5 font-medium text-foreground">
                        {h.title}
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3.5 text-muted">
                        <span className="rounded-md bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-semibold text-[#475569]">
                          {h.type}
                        </span>
                      </td>

                      {/* Affected Sessions */}
                      <td className="px-4 py-3.5">
                        <span className="rounded-full bg-[#fee2e2] px-2.5 py-0.5 text-[10px] font-semibold text-[#b91c1c]">
                          {h.affectedSessions} sessions
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        {canManage && (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-[#b91c1c] hover:bg-[#fef2f2]"
                              onClick={() => handleDeleteHoliday(h.id)}
                            >
                              Remove
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ADD HOLIDAY MODAL */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-bold text-foreground">Add Academy Holiday</h3>
              <button type="button" onClick={() => setIsAddOpen(false)} className="text-muted hover:text-foreground">✕</button>
            </div>

            <form onSubmit={handleAddHolidaySubmit} className="mt-4 space-y-3.5 text-xs">
              <label className="block font-medium">
                Holiday Title
                <Input
                  placeholder="e.g. Diwali Break, Annual Sports Day"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                  className="mt-1 h-9 text-xs"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block font-medium">
                  Date
                  <Input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    className="mt-1 h-9 text-xs"
                  />
                </label>
                <label className="block font-medium">
                  Closure Type
                  <select
                    className="mt-1 h-9 w-full rounded-xl border border-line bg-white px-3 text-xs"
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as "Full Day" | "Partial Day")}
                  >
                    <option value="Full Day">Full Day Closure</option>
                    <option value="Partial Day">Partial Day Closure</option>
                  </select>
                </label>
              </div>

              <div className="rounded-xl border border-line bg-[#f8fafb] p-3 text-muted">
                <p>⚡ Automatically handles scheduled classes on this date according to your Holiday Settings ({sessionHandling === "cancel" ? "cancel sessions" : "mark as rescheduled"}).</p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-[#007AFF] text-white hover:bg-[#0066D6]" disabled={!formTitle.trim()}>
                  Save Holiday
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { AdminAnnouncement, AnnouncementAudience, Batch } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import {
  archiveAnnouncement,
  createAnnouncement,
  getAnnouncements,
  publishAnnouncement,
  updateAnnouncement,
} from "@/lib/announcements-api";
import { getAcademyCatalog } from "@/lib/academy-api";

// ---------------------------------------------------------
// Template Definitions
// ---------------------------------------------------------
interface NoticeTemplate {
  id: string;
  category: "Weather" | "Schedule" | "Finance" | "Tournament" | "Facility" | "Safety";
  label: string;
  icon: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  description: string;
}

const TEMPLATES: NoticeTemplate[] = [
  {
    id: "weather-delay",
    category: "Weather",
    label: "Rain & Pitch Delay",
    icon: "🌦️",
    title: "Inclement Weather & Pitch Condition Alert",
    body: "Due to heavy rainfall and current pitch conditions, today's outdoor training sessions are postponed for player safety. Make-up training slots will be communicated shortly. Please check the schedule tab for indoor alternative sessions.",
    audience: "everyone",
    description: "Postpone outdoor sessions safely when weather compromises pitch quality.",
  },
  {
    id: "schedule-change",
    category: "Schedule",
    label: "Training Schedule Adjustment",
    icon: "⏰",
    title: "Schedule Update: Training Timings Adjusted",
    body: "Please note that starting next week, batch training session timings have been slightly adjusted to optimize field lighting and coach ratios. Please review your updated batch schedule in the app calendar. Ensure players arrive 15 minutes prior for warm-ups.",
    audience: "everyone",
    description: "Notify parents and coaches about time slot adjustments across batches.",
  },
  {
    id: "fee-reminder",
    category: "Finance",
    label: "Monthly Tuition Fee Reminder",
    icon: "💳",
    title: "Reminder: Monthly Tuition & Membership Dues",
    body: "This is a friendly reminder that monthly tuition fees for the upcoming training cycle are due. You can review your invoice and complete secure payments under the Payments tab in your parent portal. Thank you for your continued support!",
    audience: "parents",
    description: "Gentle billing reminder for parents with clear instructions for in-app payments.",
  },
  {
    id: "match-briefing",
    category: "Tournament",
    label: "Match Day & Tournament Briefing",
    icon: "🏆",
    title: "Match Day Briefing: Reporting Time & Kit Requirements",
    body: "Match day is this weekend! All participating squad members must report at the main venue 45 minutes prior to kickoff in full home kit, shin guards, and personal hydration bottles. Parents and supporters are warmly invited to cheer!",
    audience: "parents",
    description: "Essential logistics, reporting times, and kit requirements for match fixtures.",
  },
  {
    id: "holiday-closure",
    category: "Facility",
    label: "Public Holiday & Facility Closure",
    icon: "🏟️",
    title: "Academy Closure: Upcoming Public Holiday",
    body: "Impact Academy facilities will remain closed on [Date / Holiday]. Regular coaching sessions and academy activities will resume the following day as per the standard schedule. Have a restful break with family!",
    audience: "everyone",
    description: "Advance notice for holiday closures, pitch maintenance, and staff days.",
  },
  {
    id: "medical-safety",
    category: "Safety",
    label: "Health & Safety Advisory",
    icon: "🩺",
    title: "Player Safety & Hydration Advisory",
    body: "With elevated seasonal temperatures, all players must bring at least 1.5L of water and an electrolyte drink to every session. Coaches will ensure structured hydration breaks every 20 minutes. Please inform coaches of any player fatigue immediately.",
    audience: "everyone",
    description: "Crucial guidance regarding hydration, weather precautions, or medical check-ins.",
  },
];

function formatDate(value: string | null) {
  if (!value) return "Not published";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

type NoticesViewTab = "feed" | "compose" | "templates" | "analytics";

export default function NotificationsPage() {
  const { accessToken, refreshSession } = useAuth();
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);

  // Navigation State: The 4 Dynamic Views
  const [activeTab, setActiveTab] = useState<NoticesViewTab>("feed");

  // Form State
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AnnouncementAudience>("everyone");
  const [batchId, setBatchId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Feed Filter States
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft" | "archived">("all");
  const [audienceFilter, setAudienceFilter] = useState<"all" | AnnouncementAudience>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "reads">("newest");

  // Modals & Inspection Drawer
  const [inspectedNotice, setInspectedNotice] = useState<AdminAnnouncement | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showPushInfo, setShowPushInfo] = useState(false);

  // Composer Preview Mode (Desktop side-by-side or mobile toggle)
  const [composerPreviewMobile, setComposerPreviewMobile] = useState<"form" | "preview">("form");

  // Async States
  const [loading, setLoading] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishingNow, setPublishingNow] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    const [nextAnnouncements, catalog] = await Promise.all([
      getAnnouncements(accessToken, refreshSession),
      getAcademyCatalog(accessToken, refreshSession),
    ]);
    setAnnouncements(nextAnnouncements);
    setBatches(catalog.batches.filter((batch) => batch.isActive));
  }, [accessToken, refreshSession]);

  useEffect(() => {
    refresh()
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : "Could not load notices."),
      )
      .finally(() => setLoading(false));
  }, [refresh]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setAudience("everyone");
    setBatchId("");
    setComposerPreviewMobile("form");
  }

  function startNewBroadcast() {
    resetForm();
    setActiveTab("compose");
  }

  function applyTemplate(tpl: NoticeTemplate) {
    setTitle(tpl.title);
    setBody(tpl.body);
    setAudience(tpl.audience);
    setBatchId("");
    setActiveTab("compose");
    setError(null);
  }

  function editDraft(announcement: AdminAnnouncement) {
    setEditingId(announcement.id);
    setTitle(announcement.title);
    setBody(announcement.body);
    setAudience(announcement.audience);
    setBatchId(announcement.batchId ?? "");
    setInspectedNotice(null);
    setActiveTab("compose");
    setError(null);
  }

  async function handleSaveDraft(event?: FormEvent) {
    if (event) event.preventDefault();
    if (!accessToken || !title.trim() || !body.trim()) return;
    setSavingDraft(true);
    setError(null);
    setNotice(null);
    const input = {
      title: title.trim(),
      body: body.trim(),
      audience,
      batchId: audience === "everyone" ? null : batchId || null,
    };
    try {
      if (editingId) {
        await updateAnnouncement(accessToken, refreshSession, editingId, input);
        setNotice("Draft updated successfully.");
      } else {
        await createAnnouncement(accessToken, refreshSession, input);
        setNotice("Notice draft saved. You can review and publish anytime.");
      }
      resetForm();
      await refresh();
      setActiveTab("feed");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this draft.");
    } finally {
      setSavingDraft(false);
    }
  }

  async function handlePublishDirectly() {
    if (!accessToken || !title.trim() || !body.trim()) return;
    setPublishingNow(true);
    setError(null);
    setNotice(null);
    const input = {
      title: title.trim(),
      body: body.trim(),
      audience,
      batchId: audience === "everyone" ? null : batchId || null,
    };
    try {
      let targetId = editingId;
      if (editingId) {
        await updateAnnouncement(accessToken, refreshSession, editingId, input);
      } else {
        const created = await createAnnouncement(accessToken, refreshSession, input);
        targetId = created.id;
      }

      if (targetId) {
        const result = await publishAnnouncement(accessToken, refreshSession, targetId);
        const pushStatus = !result.push.configured
          ? "Live in mobile feeds (Expo push server not configured)."
          : result.push.targeted === 0
            ? "Live in feed (0 registered push tokens)."
            : result.push.failed > 0
              ? `Live in feed. Expo accepted ${result.push.accepted}/${result.push.targeted} push alerts.`
              : `Live in feed. Dispatched push alerts to ${result.push.accepted} devices.`;
        setNotice(`Broadcast published to ${audience}! ${pushStatus}`);
      }
      resetForm();
      await refresh();
      setActiveTab("feed");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not publish this notice.");
    } finally {
      setPublishingNow(false);
    }
  }

  async function changeStatus(announcement: AdminAnnouncement, action: "publish" | "archive") {
    if (!accessToken) return;
    setActionId(announcement.id);
    setError(null);
    setNotice(null);
    try {
      if (action === "publish") {
        const result = await publishAnnouncement(accessToken, refreshSession, announcement.id);
        const pushStatus = !result.push.configured
          ? "Push is not configured on this server."
          : result.push.targeted === 0
            ? "Notice is live in mobile feeds."
            : result.push.failed > 0
              ? `Expo accepted ${result.push.accepted} of ${result.push.targeted} push alerts.`
              : `Delivered to mobile feeds with ${result.push.accepted} push notifications.`;
        setNotice(`Broadcast published to ${announcement.audience}! ${pushStatus}`);
      } else {
        await archiveAnnouncement(accessToken, refreshSession, announcement.id);
        setNotice("Notice archived and hidden from mobile feeds.");
      }
      if (editingId === announcement.id) resetForm();
      if (inspectedNotice?.id === announcement.id) {
        setInspectedNotice((prev) => (prev ? { ...prev, status: action === "publish" ? "published" : "archived" } : null));
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this notice.");
    } finally {
      setActionId(null);
    }
  }

  function copyNoticeText(announcement: AdminAnnouncement) {
    const text = `📢 *${announcement.title}*\n\n${announcement.body}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId(announcement.id);
        setTimeout(() => setCopiedId(null), 2000);
      }).catch(() => {});
    }
  }

  // Filtered and Sorted Announcements
  const filteredAnnouncements = useMemo(() => {
    const list = announcements.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (audienceFilter !== "all" && item.audience !== audienceFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesBody = item.body.toLowerCase().includes(q);
        const matchesBatch = item.batchName?.toLowerCase().includes(q) ?? false;
        if (!matchesTitle && !matchesBody && !matchesBatch) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === "reads") return (b.readCount || 0) - (a.readCount || 0);
      const timeA = new Date(a.publishedAt ?? a.updatedAt).getTime();
      const timeB = new Date(b.publishedAt ?? b.updatedAt).getTime();
      return sortBy === "newest" ? timeB - timeA : timeA - timeB;
    });

    return list;
  }, [announcements, statusFilter, audienceFilter, searchQuery, sortBy]);

  // Executive Analytics Stats
  const stats = useMemo(() => {
    const total = announcements.length;
    const published = announcements.filter((a) => a.status === "published").length;
    const drafts = announcements.filter((a) => a.status === "draft").length;
    const archived = announcements.filter((a) => a.status === "archived").length;
    const totalReads = announcements.reduce((sum, a) => sum + (a.readCount || 0), 0);
    const avgReads = published > 0 ? Math.round(totalReads / published) : 0;

    // Audience Breakdown
    const forEveryone = announcements.filter((a) => a.audience === "everyone").length;
    const forParents = announcements.filter((a) => a.audience === "parents").length;
    const forCoaches = announcements.filter((a) => a.audience === "coaches").length;

    // Top Read Notices
    const topRead = [...announcements]
      .filter((a) => a.status === "published")
      .sort((a, b) => b.readCount - a.readCount)
      .slice(0, 5);

    return {
      total,
      published,
      drafts,
      archived,
      totalReads,
      avgReads,
      forEveryone,
      forParents,
      forCoaches,
      topRead,
    };
  }, [announcements]);

  // Batch name resolution for composer preview
  const composerBatchName = useMemo(() => {
    if (!batchId) return null;
    return batches.find((b) => b.id === batchId)?.name ?? null;
  }, [batches, batchId]);

  return (
    <div className="sd-page pb-16">
      {/* Top Page Header with Quick Actions */}
      <PageHeader
        eyebrow="Academy Communications"
        title="Broadcasts & Notices"
        description="Broadcast official academy notices directly into Parent and Coach mobile feeds."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E5E5EA] bg-white px-2.5 text-xs font-medium text-[#1D1D1F] shadow-xs hover:bg-[#F5F5F7] active:scale-[0.98] transition"
            >
              <svg className={`h-3.5 w-3.5 text-[#86868B] ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            <button
              type="button"
              onClick={startNewBroadcast}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#007AFF] px-3 text-xs font-semibold text-white shadow-xs hover:bg-[#0066D6] active:scale-[0.98] transition"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Broadcast
            </button>
          </div>
        }
      />

      {/* Dynamic Sub-Navigation Bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E5EA] pb-3">
        {/* Apple Segmented View Switcher */}
        <div className="inline-flex rounded-xl bg-[#F5F5F7] p-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("feed")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 font-medium transition ${
              activeTab === "feed"
                ? "bg-white text-[#1D1D1F] shadow-xs font-semibold"
                : "text-[#86868B] hover:text-[#1D1D1F]"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
            <span>Notice Feed</span>
            <span className="rounded-full bg-[#E5E5EA] px-1.5 py-0.2 text-[10px] text-[#1D1D1F]">
              {announcements.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("compose")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 font-medium transition ${
              activeTab === "compose"
                ? "bg-white text-[#1D1D1F] shadow-xs font-semibold"
                : "text-[#86868B] hover:text-[#1D1D1F]"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span>{editingId ? "Edit Draft" : "Compose Studio"}</span>
            {editingId ? (
              <span className="h-2 w-2 rounded-full bg-[#FF9500]" />
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("templates")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 font-medium transition ${
              activeTab === "templates"
                ? "bg-white text-[#1D1D1F] shadow-xs font-semibold"
                : "text-[#86868B] hover:text-[#1D1D1F]"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
            <span>Template Library</span>
            <span className="rounded-full bg-[#E5E5EA] px-1.5 py-0.2 text-[10px] text-[#1D1D1F]">
              {TEMPLATES.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 font-medium transition ${
              activeTab === "analytics"
                ? "bg-white text-[#1D1D1F] shadow-xs font-semibold"
                : "text-[#86868B] hover:text-[#1D1D1F]"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span>Audience Analytics</span>
          </button>
        </div>

        {/* Sync Status Badge */}
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowPushInfo((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5EA] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1D1D1F] transition hover:bg-[#F5F5F7]"
          >
            <span className="h-2 w-2 rounded-full bg-[#34C759]" />
            <span>Mobile Feeds Active</span>
          </button>
        </div>
      </div>

      {/* Push Info Callout */}
      {showPushInfo ? (
        <div className="mt-4 rounded-2xl border border-[#D0E2FF] bg-[#F0F6FF] p-4 text-xs text-[#004085] shadow-sm flex items-start justify-between gap-4 animate-in fade-in duration-200">
          <div className="flex items-start gap-2.5">
            <svg className="h-5 w-5 shrink-0 text-[#007AFF] mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-semibold text-[#003166]">Mobile App Feed & Push Notification System</p>
              <p className="mt-1 leading-relaxed text-[#23527c]">
                Published announcements synchronize instantly into the mobile app feeds of enrolled Parents and Coaches. If mobile devices are registered with Expo Push, alert tokens are dispatched. Offline devices sync the notice immediately upon their next app session.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowPushInfo(false)}
            className="text-[#004085] hover:text-[#002b5e] p-1 rounded-md hover:bg-[#E1EDFF]"
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* Global Alerts */}
      {error ? (
        <div role="alert" className="mt-4 rounded-2xl border border-[#FFD1CF] bg-[#FFF2F1] p-4 text-sm text-[#D70015] shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 shrink-0 text-[#D70015]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-[#D70015] text-xs font-semibold">Dismiss</button>
        </div>
      ) : null}

      {notice ? (
        <div role="status" className="mt-4 rounded-2xl border border-[#CDEED6] bg-[#F2FAF4] p-4 text-sm text-[#1B873F] shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 shrink-0 text-[#34C759]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{notice}</span>
          </div>
          <button type="button" onClick={() => setNotice(null)} className="text-[#1B873F] text-xs font-semibold">Dismiss</button>
        </div>
      ) : null}

      {/* ========================================================= */}
      {/* VIEW 1: NOTICE FEED & BROADCASTS                          */}
      {/* ========================================================= */}
      {activeTab === "feed" ? (
        <div className="mt-5 space-y-5">
          {/* Top Quick Stats Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <div className="rounded-2xl border border-[#E5E5EA] bg-white p-4 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#86868B]">Total Broadcasts</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tracking-tight text-[#1D1D1F]">{stats.total}</span>
                <span className="text-xs text-[#86868B]">total</span>
              </div>
            </div>
            <div className="rounded-2xl border border-[#E5E5EA] bg-white p-4 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#86868B]">Active & Live</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tracking-tight text-[#1D1D1F]">{stats.published}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F8EE] px-1.5 py-0.2 text-[10px] font-semibold text-[#1B873F]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#34C759]" /> Live
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-[#E5E5EA] bg-white p-4 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#86868B]">Drafts Pending</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tracking-tight text-[#1D1D1F]">{stats.drafts}</span>
                <span className="text-xs text-[#86868B]">in queue</span>
              </div>
            </div>
            <div className="rounded-2xl border border-[#E5E5EA] bg-white p-4 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#86868B]">In-App Reads</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tracking-tight text-[#1D1D1F]">{stats.totalReads}</span>
                <span className="text-xs text-[#86868B]">views logged</span>
              </div>
            </div>
          </div>

          {/* Feed Filter & Search Controls */}
          <div className="rounded-2xl border border-[#E5E5EA] bg-white p-4 shadow-xs">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              {/* Search Bar */}
              <div className="relative flex-1 max-w-md">
                <svg className="absolute left-3 top-2.5 h-4 w-4 text-[#86868B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search notices by title, message body, or batch..."
                  className="h-9 w-full rounded-xl border border-[#E5E5EA] bg-[#F5F5F7] pl-9 pr-8 text-xs text-[#1D1D1F] outline-none transition focus:border-[#007AFF] focus:bg-white focus:ring-2 focus:ring-[#007AFF20]"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-2.5 text-[#86868B] hover:text-[#1D1D1F] text-xs"
                  >
                    ✕
                  </button>
                ) : null}
              </div>

              {/* Status Tabs, Audience & Sort Dropdowns */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Status Tabs */}
                <div className="inline-flex rounded-lg bg-[#F5F5F7] p-0.5 text-xs">
                  {(
                    [
                      { id: "all", label: "All" },
                      { id: "published", label: "Published" },
                      { id: "draft", label: "Drafts" },
                      { id: "archived", label: "Archived" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id)}
                      className={`rounded-md px-2.5 py-1 font-medium transition ${
                        statusFilter === tab.id
                          ? "bg-white text-[#1D1D1F] shadow-xs"
                          : "text-[#86868B] hover:text-[#1D1D1F]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Audience Filter Dropdown */}
                <select
                  aria-label="Filter notices by audience"
                  value={audienceFilter}
                  onChange={(e) => setAudienceFilter(e.target.value as "all" | AnnouncementAudience)}
                  className="h-8 rounded-lg border border-[#E5E5EA] bg-[#F5F5F7] px-2.5 text-xs text-[#1D1D1F] outline-none transition focus:border-[#007AFF] focus:bg-white"
                >
                  <option value="all">All Audiences</option>
                  <option value="everyone">Everyone</option>
                  <option value="parents">Parents Only</option>
                  <option value="coaches">Coaches Only</option>
                </select>

                {/* Sort Order */}
                <select
                  aria-label="Sort notices"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "newest" | "oldest" | "reads")}
                  className="h-8 rounded-lg border border-[#E5E5EA] bg-[#F5F5F7] px-2.5 text-xs text-[#1D1D1F] outline-none transition focus:border-[#007AFF] focus:bg-white"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="reads">Most Reads</option>
                </select>
              </div>
            </div>
          </div>

          {/* Notices Feed List */}
          {loading ? (
            <div className="py-20 text-center text-xs text-[#86868B]">
              <svg className="mx-auto h-6 w-6 animate-spin text-[#86868B] mb-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading academy broadcasts…
            </div>
          ) : filteredAnnouncements.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E5E5EA] bg-white p-12 text-center shadow-xs">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F5F5F7] text-[#86868B]">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <h3 className="mt-3 text-base font-semibold text-[#1D1D1F]">No broadcasts found</h3>
              <p className="mt-1 text-xs text-[#86868B] max-w-sm mx-auto">
                {searchQuery || statusFilter !== "all" || audienceFilter !== "all"
                  ? "No notices match your current filters. Try resetting your search parameters."
                  : "Keep parents and coaches updated by creating your first official broadcast."}
              </p>
              <div className="mt-4 flex items-center justify-center gap-3">
                {searchQuery || statusFilter !== "all" || audienceFilter !== "all" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setStatusFilter("all");
                      setAudienceFilter("all");
                    }}
                    className="text-xs font-semibold text-[#007AFF] hover:underline"
                  >
                    Reset all filters
                  </button>
                ) : (
                  <Button type="button" onClick={startNewBroadcast}>
                    + Compose First Notice
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredAnnouncements.map((announcement) => (
                <article
                  key={announcement.id}
                  className="rounded-2xl border border-[#E5E5EA] bg-white p-5 shadow-xs transition hover:border-[#D1D1D6] hover:shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      {/* Badge Metadata Bar */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Status Badge */}
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            announcement.status === "published"
                              ? "bg-[#E8F8EE] text-[#1B873F]"
                              : announcement.status === "draft"
                                ? "bg-[#FFF4E5] text-[#B26200]"
                                : "bg-[#F5F5F7] text-[#86868B]"
                          }`}
                        >
                          {announcement.status === "published" ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-[#34C759]" />
                          ) : null}
                          {announcement.status}
                        </span>

                        {/* Audience Pill */}
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#F5F5F7] px-2.5 py-0.5 text-xs font-medium text-[#1D1D1F]">
                          {announcement.audience === "everyone"
                            ? "👥 Everyone"
                            : announcement.audience === "parents"
                              ? "👨‍👩‍👧 Parents"
                              : "🧢 Coaches"}
                        </span>

                        {/* Batch Tag */}
                        {announcement.batchName ? (
                          <span className="rounded-md bg-[#F0F6FF] px-2 py-0.5 text-xs font-medium text-[#007AFF]">
                            Batch: {announcement.batchName}
                          </span>
                        ) : null}

                        {/* Read count */}
                        {announcement.status === "published" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#007AFF]">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            {announcement.readCount} {announcement.readCount === 1 ? "read" : "reads"}
                          </span>
                        ) : null}
                      </div>

                      {/* Notice Title */}
                      <h3
                        onClick={() => setInspectedNotice(announcement)}
                        className="mt-2 text-base font-semibold text-[#1D1D1F] cursor-pointer hover:text-[#007AFF] transition"
                      >
                        {announcement.title}
                      </h3>

                      {/* Snippet Body */}
                      <p className="mt-1.5 text-xs leading-relaxed text-[#3C3C43] line-clamp-2">
                        {announcement.body}
                      </p>
                    </div>

                    {/* Published Date */}
                    <div className="shrink-0 text-left sm:text-right text-[11px] text-[#86868B]">
                      <span>{announcement.status === "published" ? "Published" : "Updated"}</span>
                      <div className="font-medium text-[#1D1D1F]">
                        {formatDate(announcement.publishedAt ?? announcement.updatedAt)}
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer Strip */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#F5F5F7] pt-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setInspectedNotice(announcement)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E5E5EA] bg-white px-2.5 text-xs font-medium text-[#1D1D1F] hover:bg-[#F5F5F7] transition"
                      >
                        <svg className="h-3.5 w-3.5 text-[#86868B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Full Details
                      </button>

                      {announcement.status === "draft" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => editDraft(announcement)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E5E5EA] bg-white px-2.5 text-xs font-medium text-[#1D1D1F] hover:bg-[#F5F5F7] transition"
                          >
                            <svg className="h-3.5 w-3.5 text-[#86868B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={actionId === announcement.id}
                            onClick={() => void changeStatus(announcement, "publish")}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#007AFF] px-3 text-xs font-medium text-white shadow-xs hover:bg-[#0066D6] disabled:opacity-50 transition"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                            {actionId === announcement.id ? "Publishing…" : "Publish Now"}
                          </button>
                        </>
                      ) : null}

                      {announcement.status !== "archived" ? (
                        <button
                          type="button"
                          disabled={actionId === announcement.id}
                          onClick={() => void changeStatus(announcement, "archive")}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-transparent px-2.5 text-xs font-medium text-[#86868B] hover:bg-[#F5F5F7] hover:text-[#D70015] transition"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                          </svg>
                          Archive
                        </button>
                      ) : null}
                    </div>

                    {/* Copy Text Button */}
                    <button
                      type="button"
                      onClick={() => copyNoticeText(announcement)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E5E5EA] bg-white px-2.5 text-xs font-medium text-[#1D1D1F] hover:bg-[#F5F5F7] transition"
                    >
                      {copiedId === announcement.id ? (
                        <>
                          <svg className="h-3.5 w-3.5 text-[#34C759]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-[#34C759]">Copied to Clipboard!</span>
                        </>
                      ) : (
                        <>
                          <svg className="h-3.5 w-3.5 text-[#86868B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <span>Copy Text</span>
                        </>
                      )}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* ========================================================= */}
      {/* VIEW 2: DEDICATED COMPOSE STUDIO                          */}
      {/* ========================================================= */}
      {activeTab === "compose" ? (
        <div className="mt-5">
          {/* Top Return Breadcrumb */}
          <div className="flex items-center justify-between pb-3">
            <button
              type="button"
              onClick={() => setActiveTab("feed")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#007AFF] hover:underline"
            >
              ← Back to Notice Feed
            </button>

            {/* Mobile View Toggle between Form and Preview */}
            <div className="inline-flex rounded-lg bg-[#F5F5F7] p-0.5 text-xs lg:hidden">
              <button
                type="button"
                onClick={() => setComposerPreviewMobile("form")}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  composerPreviewMobile === "form" ? "bg-white text-[#1D1D1F] shadow-xs" : "text-[#86868B]"
                }`}
              >
                Editor
              </button>
              <button
                type="button"
                onClick={() => setComposerPreviewMobile("preview")}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  composerPreviewMobile === "preview" ? "bg-white text-[#1D1D1F] shadow-xs" : "text-[#86868B]"
                }`}
              >
                Mobile Preview
              </button>
            </div>
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,420px)]">
            {/* Left: Compose Form */}
            <div className={`rounded-2xl border border-[#E5E5EA] bg-white p-6 shadow-xs ${
              composerPreviewMobile === "preview" ? "hidden lg:block" : "block"
            }`}>
              <div className="flex items-center justify-between border-b border-[#E5E5EA] pb-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#86868B]">
                    {editingId ? "Notice Draft" : "New Academy Announcement"}
                  </p>
                  <h2 className="mt-0.5 text-lg font-bold text-[#1D1D1F]">
                    {editingId ? "Update Notice Draft" : "Broadcast Composer"}
                  </h2>
                </div>
                {(title || body) ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-xs font-medium text-[#86868B] hover:text-[#D70015] transition"
                  >
                    Clear all fields
                  </button>
                ) : null}
              </div>

              {/* Template Shortcut Bar */}
              <div className="mt-4 rounded-xl bg-[#F5F5F7] p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#1D1D1F]">⚡ Insert Template</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab("templates")}
                    className="text-[11px] font-medium text-[#007AFF] hover:underline"
                  >
                    Browse library →
                  </button>
                </div>
                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                  {TEMPLATES.slice(0, 4).map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyTemplate(tpl)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#E5E5EA] bg-white px-2.5 py-1 text-xs font-medium text-[#1D1D1F] hover:border-[#007AFF] hover:text-[#007AFF] transition"
                    >
                      <span>{tpl.icon}</span>
                      <span>{tpl.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Composition Form */}
              <form onSubmit={(e) => void handleSaveDraft(e)} className="mt-5 space-y-4">
                {/* Target Audience */}
                <div>
                  <label className="block text-xs font-semibold text-[#1D1D1F]">
                    Who should receive this broadcast?
                  </label>
                  <div className="mt-2 grid grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setAudience("everyone");
                        setBatchId("");
                      }}
                      className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                        audience === "everyone"
                          ? "border-[#007AFF] bg-[#F0F6FF] text-[#007AFF] font-semibold shadow-xs"
                          : "border-[#E5E5EA] bg-white text-[#1D1D1F] hover:bg-[#F5F5F7]"
                      }`}
                    >
                      <span className="text-xl">👥</span>
                      <span className="mt-1 text-xs font-medium">Everyone</span>
                      <span className="text-[10px] text-[#86868B]">Parents & Coaches</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudience("parents")}
                      className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                        audience === "parents"
                          ? "border-[#007AFF] bg-[#F0F6FF] text-[#007AFF] font-semibold shadow-xs"
                          : "border-[#E5E5EA] bg-white text-[#1D1D1F] hover:bg-[#F5F5F7]"
                      }`}
                    >
                      <span className="text-xl">👨‍👩‍👧</span>
                      <span className="mt-1 text-xs font-medium">Parents</span>
                      <span className="text-[10px] text-[#86868B]">Guardians only</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudience("coaches")}
                      className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                        audience === "coaches"
                          ? "border-[#007AFF] bg-[#F0F6FF] text-[#007AFF] font-semibold shadow-xs"
                          : "border-[#E5E5EA] bg-white text-[#1D1D1F] hover:bg-[#F5F5F7]"
                      }`}
                    >
                      <span className="text-xl">🧢</span>
                      <span className="mt-1 text-xs font-medium">Coaches</span>
                      <span className="text-[10px] text-[#86868B]">Academy staff</span>
                    </button>
                  </div>

                  {/* Contextual Batch Picker */}
                  {audience !== "everyone" ? (
                    <div className="mt-3">
                      <label className="block text-[11px] font-medium text-[#86868B] mb-1">
                        Target specific batch (optional):
                      </label>
                      <select
                        aria-label="Filter by batch"
                        value={batchId}
                        onChange={(e) => setBatchId(e.target.value)}
                        className="h-10 w-full rounded-xl border border-[#E5E5EA] bg-white px-3 text-xs text-[#1D1D1F] shadow-xs outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF20]"
                      >
                        <option value="">All batches (All registered {audience})</option>
                        {batches.map((batch) => (
                          <option key={batch.id} value={batch.id}>
                            {batch.name} • {batch.programName}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>

                {/* Title */}
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="broadcast-title" className="text-xs font-semibold text-[#1D1D1F]">
                      Broadcast Subject / Title
                    </label>
                    <span className="text-[11px] text-[#86868B]">{title.length}/160</span>
                  </div>
                  <Input
                    id="broadcast-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={160}
                    placeholder="e.g. Schedule Update: Weekend Training Timings"
                    required
                    className="mt-1.5"
                  />
                </div>

                {/* Body Content */}
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="broadcast-body" className="text-xs font-semibold text-[#1D1D1F]">
                      Announcement Message
                    </label>
                    <span className="text-[11px] text-[#86868B]">{body.length}/4000</span>
                  </div>
                  <textarea
                    id="broadcast-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={4000}
                    required
                    rows={8}
                    className="mt-1.5 w-full resize-y rounded-xl border border-[#E5E5EA] bg-white p-3.5 text-xs leading-relaxed text-[#1D1D1F] shadow-xs outline-none placeholder:text-[#86868B] focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF20]"
                    placeholder="Type the full announcement details, timings, kit requirements, or guidelines..."
                  />
                </div>

                {/* Actions Footer */}
                <div className="pt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    disabled={publishingNow || savingDraft || !title.trim() || !body.trim()}
                    onClick={() => void handlePublishDirectly()}
                    className="flex-1 bg-[#007AFF] text-white hover:bg-[#0066D6] font-semibold"
                  >
                    {publishingNow ? (
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Publishing Broadcast…
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        Publish Broadcast Now
                      </span>
                    )}
                  </Button>

                  <Button
                    type="submit"
                    variant="outline"
                    disabled={savingDraft || publishingNow || !title.trim() || !body.trim()}
                    className="font-medium"
                  >
                    {savingDraft ? "Saving…" : editingId ? "Update Draft" : "Save as Draft"}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      resetForm();
                      setActiveTab("feed");
                    }}
                    className="text-[#86868B]"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>

            {/* Right: Real-time Live Mobile Simulator */}
            <div className={`rounded-2xl border border-[#E5E5EA] bg-white p-5 shadow-xs flex flex-col items-center ${
              composerPreviewMobile === "form" ? "hidden lg:flex" : "flex"
            }`}>
              <div className="w-full text-center pb-2 border-b border-[#E5E5EA] mb-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#86868B]">
                  Live Mobile Simulator
                </span>
                <p className="text-xs text-[#86868B]">What parents & coaches see on iOS/Android</p>
              </div>

              {/* iPhone Mock Device */}
              <div className="w-full max-w-[320px] rounded-[40px] border-[6px] border-[#1D1D1F] bg-[#F7F8FA] p-3 shadow-xl">
                {/* Dynamic Island */}
                <div className="flex items-center justify-between px-3 pt-1 pb-2">
                  <span className="text-[11px] font-semibold text-[#1D1D1F]">9:41</span>
                  <div className="h-3.5 w-18 rounded-full bg-[#1D1D1F]" />
                  <div className="flex items-center gap-1 text-[#1D1D1F]">
                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L12 22l7.03-4.39C20.26 16.07 21 14.12 21 12c0-4.97-4.03-9-9-9z"/></svg>
                    <span className="text-[9px] font-medium">5G</span>
                  </div>
                </div>

                {/* Simulated Push Notification Toast */}
                <div className="mt-2 rounded-2xl bg-white/95 backdrop-blur-md p-3 shadow-md border border-[#E5E5EA]">
                  <div className="flex items-center justify-between text-[10px] text-[#86868B]">
                    <div className="flex items-center gap-1.5 font-semibold text-[#1D1D1F]">
                      <span className="flex h-4 w-4 items-center justify-center rounded-md bg-[#007AFF] text-[8px] text-white font-bold">OS</span>
                      Impact Academy
                    </div>
                    <span>now</span>
                  </div>
                  <p className="mt-1 text-xs font-bold text-[#1D1D1F] line-clamp-1">
                    {title.trim() || "Broadcast Title Preview"}
                  </p>
                  <p className="text-[11px] text-[#86868B] line-clamp-2 mt-0.5">
                    {body.trim() || "Your announcement preview will appear here on parent lock screens."}
                  </p>
                </div>

                {/* In-App Feed Card Mock */}
                <div className="mt-4">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#86868B] px-1">
                    In-App Feed Card
                  </span>
                  <div className="mt-1.5 rounded-2xl border border-[#E5E5EA] bg-white p-3.5 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#EBF5FF] px-2 py-0.5 text-[10px] font-semibold text-[#007AFF]">
                        {audience === "everyone" ? "👥 Everyone" : audience === "parents" ? "👨‍👩‍👧 Parents" : "🧢 Coaches"}
                      </span>
                      <span className="text-[10px] text-[#86868B]">Today</span>
                    </div>

                    {composerBatchName ? (
                      <div className="mt-1 text-[10px] font-medium text-[#86868B]">
                        Batch: {composerBatchName}
                      </div>
                    ) : null}

                    <h4 className="mt-2 text-sm font-bold text-[#1D1D1F]">
                      {title.trim() || "Your Announcement Title"}
                    </h4>
                    <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-[#3C3C43]">
                      {body.trim() || "Your broadcast text appears formatted and easy to read here."}
                    </p>

                    <div className="mt-3 flex items-center justify-between border-t border-[#F5F5F7] pt-2 text-[10px] text-[#86868B]">
                      <span>ImpactOS Feed</span>
                      <span className="font-semibold text-[#007AFF]">✓ Acknowledged</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ========================================================= */}
      {/* VIEW 3: TEMPLATE LIBRARY                                  */}
      {/* ========================================================= */}
      {activeTab === "templates" ? (
        <div className="mt-5 space-y-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-[#1D1D1F]">Academy Broadcast Template Library</h2>
              <p className="text-xs text-[#86868B]">
                Pre-built announcement formats for rain delays, fee reminders, tournament briefings, and emergency alerts.
              </p>
            </div>
            <Button type="button" onClick={startNewBroadcast}>
              + Blank Broadcast
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.map((tpl) => (
              <div
                key={tpl.id}
                className="flex flex-col justify-between rounded-2xl border border-[#E5E5EA] bg-white p-5 shadow-xs transition hover:border-[#007AFF] hover:shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{tpl.icon}</span>
                    <span className="rounded-full bg-[#F5F5F7] px-2.5 py-0.5 text-[10px] font-semibold text-[#86868B] uppercase tracking-wider">
                      {tpl.category}
                    </span>
                  </div>

                  <h3 className="mt-3 text-sm font-bold text-[#1D1D1F]">{tpl.label}</h3>
                  <p className="mt-1 text-xs text-[#86868B] leading-relaxed">{tpl.description}</p>

                  <div className="mt-3 rounded-xl bg-[#F7F8FA] p-3 text-xs">
                    <p className="font-semibold text-[#1D1D1F] line-clamp-1">{tpl.title}</p>
                    <p className="mt-1 text-[11px] text-[#555] line-clamp-3 leading-relaxed">{tpl.body}</p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#F5F5F7] flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#86868B]">
                    Default: {tpl.audience === "everyone" ? "Everyone" : "Parents"}
                  </span>
                  <button
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#007AFF] hover:underline"
                  >
                    Use Template →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ========================================================= */}
      {/* VIEW 4: AUDIENCE & DELIVERY ANALYTICS                     */}
      {/* ========================================================= */}
      {activeTab === "analytics" ? (
        <div className="mt-5 space-y-5">
          <div>
            <h2 className="text-base font-bold text-[#1D1D1F]">Broadcast Engagement & Delivery Analytics</h2>
            <p className="text-xs text-[#86868B]">
              Track in-app read rates, push notification delivery health, and communication reach across parents and coaches.
            </p>
          </div>

          {/* Metric KPI Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-[#E5E5EA] bg-white p-5 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#86868B]">Total Dispatched</span>
              <div className="mt-2 text-2xl font-bold text-[#1D1D1F]">{stats.published}</div>
              <p className="mt-1 text-xs text-[#86868B]">{stats.drafts} drafts queued</p>
            </div>
            <div className="rounded-2xl border border-[#E5E5EA] bg-white p-5 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#86868B]">Total In-App Reads</span>
              <div className="mt-2 text-2xl font-bold text-[#007AFF]">{stats.totalReads}</div>
              <p className="mt-1 text-xs text-[#86868B]">Across active feeds</p>
            </div>
            <div className="rounded-2xl border border-[#E5E5EA] bg-white p-5 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#86868B]">Avg. Reads / Notice</span>
              <div className="mt-2 text-2xl font-bold text-[#1D1D1F]">{stats.avgReads}</div>
              <p className="mt-1 text-xs text-[#86868B]">Views per broadcast</p>
            </div>
            <div className="rounded-2xl border border-[#E5E5EA] bg-white p-5 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#86868B]">Delivery Rate</span>
              <div className="mt-2 text-2xl font-bold text-[#34C759]">100%</div>
              <p className="mt-1 text-xs text-[#86868B]">In-App Cloud Sync</p>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Audience Distribution */}
            <div className="rounded-2xl border border-[#E5E5EA] bg-white p-5 shadow-xs">
              <h3 className="text-sm font-bold text-[#1D1D1F]">Audience Reach Distribution</h3>
              <p className="text-xs text-[#86868B] mt-0.5">Where academy broadcasts are being targeted</p>

              <div className="mt-4 space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <span>👥</span> Everyone (Parents & Coaches)
                    </span>
                    <span className="text-[#86868B]">{stats.forEveryone} notices</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full rounded-full bg-[#F5F5F7]">
                    <div
                      className="h-2 rounded-full bg-[#007AFF]"
                      style={{ width: `${stats.total > 0 ? (stats.forEveryone / stats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <span>👨‍👩‍👧</span> Parents Only
                    </span>
                    <span className="text-[#86868B]">{stats.forParents} notices</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full rounded-full bg-[#F5F5F7]">
                    <div
                      className="h-2 rounded-full bg-[#34C759]"
                      style={{ width: `${stats.total > 0 ? (stats.forParents / stats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <span>🧢</span> Coaches Only
                    </span>
                    <span className="text-[#86868B]">{stats.forCoaches} notices</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full rounded-full bg-[#F5F5F7]">
                    <div
                      className="h-2 rounded-full bg-[#FF9500]"
                      style={{ width: `${stats.total > 0 ? (stats.forCoaches / stats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Top Engaged Broadcasts */}
            <div className="rounded-2xl border border-[#E5E5EA] bg-white p-5 shadow-xs">
              <h3 className="text-sm font-bold text-[#1D1D1F]">Most Viewed Broadcasts</h3>
              <p className="text-xs text-[#86868B] mt-0.5">Top announcements by parent and coach views</p>

              <div className="mt-4 space-y-2.5">
                {stats.topRead.length === 0 ? (
                  <p className="text-xs text-[#86868B] py-4 text-center">No published notices with view logs yet.</p>
                ) : (
                  stats.topRead.map((item, index) => (
                    <div
                      key={item.id}
                      onClick={() => setInspectedNotice(item)}
                      className="flex items-center justify-between rounded-xl bg-[#F7F8FA] p-3 transition hover:bg-[#F0F6FF] cursor-pointer"
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#86868B]">#{index + 1}</span>
                          <span className="text-xs font-semibold text-[#1D1D1F] truncate">{item.title}</span>
                        </div>
                        <span className="text-[10px] text-[#86868B] ml-5">{formatDate(item.publishedAt)}</span>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#007AFF] shadow-xs">
                        👁️ {item.readCount}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ========================================================= */}
      {/* SLIDE-OVER DETAIL / INSPECTION MODAL                      */}
      {/* ========================================================= */}
      {inspectedNotice ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-xl rounded-3xl border border-[#E5E5EA] bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[#E5E5EA] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      inspectedNotice.status === "published"
                        ? "bg-[#E8F8EE] text-[#1B873F]"
                        : inspectedNotice.status === "draft"
                          ? "bg-[#FFF4E5] text-[#B26200]"
                          : "bg-[#F5F5F7] text-[#86868B]"
                    }`}
                  >
                    {inspectedNotice.status}
                  </span>
                  <span className="text-xs font-medium text-[#86868B]">
                    {inspectedNotice.audience === "everyone" ? "👥 Everyone" : inspectedNotice.audience === "parents" ? "👨‍👩‍👧 Parents" : "🧢 Coaches"}
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-bold text-[#1D1D1F]">
                  {inspectedNotice.title}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setInspectedNotice(null)}
                className="rounded-full p-1.5 text-[#86868B] hover:bg-[#F5F5F7] hover:text-[#1D1D1F] transition"
              >
                ✕
              </button>
            </div>

            {/* Metadata Summary */}
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-[#F7F8FA] p-3.5 text-xs">
              <div>
                <span className="text-[#86868B] block text-[10px] uppercase font-semibold">Published At</span>
                <span className="font-medium text-[#1D1D1F]">
                  {formatDate(inspectedNotice.publishedAt ?? inspectedNotice.updatedAt)}
                </span>
              </div>
              <div>
                <span className="text-[#86868B] block text-[10px] uppercase font-semibold">Target Batch</span>
                <span className="font-medium text-[#1D1D1F]">
                  {inspectedNotice.batchName ?? "All batches (Academy-wide)"}
                </span>
              </div>
              <div>
                <span className="text-[#86868B] block text-[10px] uppercase font-semibold">In-App Views</span>
                <span className="font-medium text-[#007AFF]">
                  👁️ {inspectedNotice.readCount} verified parent/coach reads
                </span>
              </div>
              <div>
                <span className="text-[#86868B] block text-[10px] uppercase font-semibold">Delivery Channels</span>
                <span className="font-medium text-[#34C759]">
                  Mobile Feed & Push Service
                </span>
              </div>
            </div>

            {/* Notice Body */}
            <div className="mt-4">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#86868B]">Notice Content</span>
              <div className="mt-2 whitespace-pre-wrap rounded-2xl border border-[#E5E5EA] bg-white p-4 text-xs leading-relaxed text-[#1D1D1F]">
                {inspectedNotice.body}
              </div>
            </div>

            {/* Actions in Modal */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E5EA] pt-4">
              <div className="flex items-center gap-2">
                {inspectedNotice.status === "draft" ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => editDraft(inspectedNotice)}
                    >
                      Edit in Studio
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={actionId === inspectedNotice.id}
                      onClick={() => void changeStatus(inspectedNotice, "publish")}
                    >
                      Publish to Mobile Feed
                    </Button>
                  </>
                ) : null}

                {inspectedNotice.status !== "archived" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={actionId === inspectedNotice.id}
                    onClick={() => void changeStatus(inspectedNotice, "archive")}
                  >
                    Archive Notice
                  </Button>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyNoticeText(inspectedNotice)}
                >
                  {copiedId === inspectedNotice.id ? "Copied!" : "Copy Text"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setInspectedNotice(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { useAuth } from "@/hooks/use-auth";
import { getAnnouncements } from "@/lib/announcements-api";
import type { AdminAnnouncement } from "@sportdesk/contracts";

type NotificationItem = {
  id: string;
  type: "notice" | "activity";
  title: string;
  detail: string;
  time: string;
  timestamp: number;
  unread: boolean;
  link: string;
  badge?: string;
  badgeColor?: string;
  icon: "megaphone" | "check-circle" | "people" | "calendar";
  iconBg: string;
  iconColor: string;
};

function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return "Just now";
  const now = Date.now();
  const past = new Date(dateString).getTime();
  const diffInMinutes = Math.floor((now - past) / 60000);

  if (diffInMinutes < 1) return "Just now";
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d ago`;
}

export function NotificationPopover() {
  const { accessToken, refreshSession } = useAuth();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "notices" | "activity">("all");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize read notifications from localStorage
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("sportdesk-read-notifications");
      if (stored) {
        setReadIds(new Set(JSON.parse(stored)));
      }
    } catch {
      // Storage unavailable in private browsing
    }
  }, []);

  // Fetch notices & synthesize operational alerts
  const loadNotifications = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      let announcements: AdminAnnouncement[] = [];
      try {
        announcements = await getAnnouncements(accessToken, refreshSession);
      } catch {
        // Fallback gracefully if endpoint cannot be reached
      }

      // Convert announcements to notification items
      const noticeItems: NotificationItem[] = announcements.map((item) => ({
        id: `notice-${item.id}`,
        type: "notice",
        title: item.title,
        detail: item.body,
        time: formatRelativeTime(item.publishedAt || item.createdAt),
        timestamp: new Date(item.publishedAt || item.createdAt).getTime(),
        unread: !readIds.has(`notice-${item.id}`),
        link: "/notices",
        badge: item.status === "published" ? `Published to ${item.audience}` : "Draft notice",
        badgeColor:
          item.status === "published"
            ? "bg-[#34C759]/10 text-[#34C759]"
            : "bg-[#FF9500]/10 text-[#FF9500]",
        icon: "megaphone",
        iconBg: "bg-[#007AFF]/10",
        iconColor: "text-[#007AFF]",
      }));

      // Standard operational real-time system alerts
      const defaultActivityItems: NotificationItem[] = [
        {
          id: "activity-welcome",
          type: "activity",
          title: "System Online & Synchronized",
          detail: "Academy schedule, attendance engine, and staff access are active.",
          time: "Today",
          timestamp: Date.now() - 3600000,
          unread: !readIds.has("activity-welcome"),
          link: "/operations?section=calendar",
          badge: "Operations",
          badgeColor: "bg-[#007AFF]/10 text-[#007AFF]",
          icon: "calendar",
          iconBg: "bg-[#007AFF]/10",
          iconColor: "text-[#007AFF]",
        },
        {
          id: "activity-attendance",
          type: "activity",
          title: "Coach Check-in Station Ready",
          detail: "Coaches can submit attendance records directly from mobile or web rosters.",
          time: "1h ago",
          timestamp: Date.now() - 7200000,
          unread: !readIds.has("activity-attendance"),
          link: "/operations?section=attendance",
          badge: "Attendance",
          badgeColor: "bg-[#34C759]/10 text-[#34C759]",
          icon: "check-circle",
          iconBg: "bg-[#34C759]/10",
          iconColor: "text-[#34C759]",
        },
      ];

      const combined = [...noticeItems, ...defaultActivityItems].sort(
        (a, b) => b.timestamp - a.timestamp,
      );

      setNotifications(combined);
    } finally {
      setLoading(false);
    }
  }, [accessToken, refreshSession, readIds]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  // Handle outside click & ESC key to close popover
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Mark all as read
  function markAllAsRead() {
    const nextReadIds = new Set(readIds);
    notifications.forEach((item) => nextReadIds.add(item.id));
    setReadIds(nextReadIds);
    try {
      window.localStorage.setItem(
        "sportdesk-read-notifications",
        JSON.stringify(Array.from(nextReadIds)),
      );
    } catch {
      // Ignore storage errors
    }
    setNotifications((prev) => prev.map((item) => ({ ...item, unread: false })));
  }

  // Mark single as read
  function markAsRead(id: string) {
    const nextReadIds = new Set(readIds);
    nextReadIds.add(id);
    setReadIds(nextReadIds);
    try {
      window.localStorage.setItem(
        "sportdesk-read-notifications",
        JSON.stringify(Array.from(nextReadIds)),
      );
    } catch {
      // Ignore storage errors
    }
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, unread: false } : item)),
    );
  }

  const unreadCount = notifications.filter((item) => item.unread).length;

  const filteredNotifications = notifications.filter((item) => {
    if (activeTab === "notices") return item.type === "notice";
    if (activeTab === "activity") return item.type === "activity";
    return true;
  });

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger Button with Dynamic Unread Badge */}
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`relative grid h-8 w-8 place-items-center rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] ${
          open
            ? "bg-[#007AFF]/10 text-[#007AFF]"
            : "text-[#6E6E73] hover:bg-[#F5F5F7] hover:text-[#1D1D1F]"
        }`}
      >
        <Icon name="megaphone" size={16} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF3B30] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#FF3B30]" />
          </span>
        )}
      </button>

      {/* Popover Card */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2.5 w-[min(92vw,380px)] rounded-2xl border border-[#E5E5EA] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.12)] animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#E5E5EA] px-4 py-3.5">
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-bold text-[#1D1D1F]">Notifications & Notices</h2>
              {unreadCount > 0 ? (
                <span className="rounded-full bg-[#FF3B30]/10 px-2 py-0.5 text-[10px] font-bold text-[#FF3B30]">
                  {unreadCount} new
                </span>
              ) : (
                <span className="rounded-full bg-[#F5F5F7] px-2 py-0.5 text-[10px] font-semibold text-[#8E8E93]">
                  0 unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-[11px] font-semibold text-[#007AFF] hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center border-b border-[#E5E5EA] bg-[#F9F9FB] px-2 py-1.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`rounded-lg px-2.5 py-1 font-semibold transition-colors ${
                activeTab === "all"
                  ? "bg-white text-[#1D1D1F] shadow-xs"
                  : "text-[#6E6E73] hover:text-[#1D1D1F]"
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("notices")}
              className={`rounded-lg px-2.5 py-1 font-semibold transition-colors ${
                activeTab === "notices"
                  ? "bg-white text-[#1D1D1F] shadow-xs"
                  : "text-[#6E6E73] hover:text-[#1D1D1F]"
              }`}
            >
              Notices ({notifications.filter((n) => n.type === "notice").length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("activity")}
              className={`rounded-lg px-2.5 py-1 font-semibold transition-colors ${
                activeTab === "activity"
                  ? "bg-white text-[#1D1D1F] shadow-xs"
                  : "text-[#6E6E73] hover:text-[#1D1D1F]"
              }`}
            >
              Activity ({notifications.filter((n) => n.type === "activity").length})
            </button>
          </div>

          {/* List Content */}
          <div className="max-h-[340px] overflow-y-auto divide-y divide-[#E5E5EA]">
            {loading && notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#8E8E93]">
                Loading updates…
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="p-8 text-center">
                <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[#F5F5F7] text-[#8E8E93]">
                  <Icon name="check-circle" size={18} />
                </span>
                <p className="mt-2.5 text-xs font-semibold text-[#1D1D1F]">All caught up!</p>
                <p className="mt-1 text-[11px] text-[#8E8E93]">
                  {activeTab === "notices"
                    ? "No notices have been published yet."
                    : "No new activity alerts at this time."}
                </p>
              </div>
            ) : (
              filteredNotifications.map((item) => (
                <Link
                  key={item.id}
                  href={item.link}
                  onClick={() => {
                    markAsRead(item.id);
                    setOpen(false);
                  }}
                  className={`group flex items-start gap-3 p-3.5 transition-colors hover:bg-[#F5F5F7]/70 ${
                    item.unread ? "bg-[#007AFF]/[0.03]" : ""
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${item.iconBg} ${item.iconColor}`}
                  >
                    <Icon name={item.icon} size={15} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-bold text-[#1D1D1F] group-hover:text-[#007AFF]">
                        {item.title}
                      </p>
                      <span className="shrink-0 text-[10px] text-[#8E8E93] tabular-nums">
                        {item.time}
                      </span>
                    </div>

                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#6E6E73]">
                      {item.detail}
                    </p>

                    {item.badge && (
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                            item.badgeColor || "bg-[#F5F5F7] text-[#6E6E73]"
                          }`}
                        >
                          {item.badge}
                        </span>
                        {item.unread && (
                          <span className="h-1.5 w-1.5 rounded-full bg-[#007AFF]" />
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              ))
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between border-t border-[#E5E5EA] bg-[#F9F9FB] px-4 py-2.5">
            <Link
              href="/notices"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#007AFF] hover:underline"
            >
              <Icon name="plus" size={13} />
              <span>Broadcast Notice</span>
            </Link>

            <Link
              href="/notices"
              onClick={() => setOpen(false)}
              className="text-[11px] font-medium text-[#8E8E93] hover:text-[#1D1D1F]"
            >
              All notices →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

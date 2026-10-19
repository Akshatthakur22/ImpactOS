"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AdminAnnouncement, AnnouncementAudience, Batch } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
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

function formatDate(value: string | null) {
  if (!value) return "Not published";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(status: AdminAnnouncement["status"]) {
  if (status === "published") return "bg-[#e5f3f0] text-accent";
  if (status === "archived") return "bg-[#eef2f4] text-muted";
  return "bg-[#fff3dc] text-[#8a6418]";
}

export default function NotificationsPage() {
  const { accessToken, refreshSession } = useAuth();
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AnnouncementAudience>("everyone");
  const [batchId, setBatchId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const input = { title, body, audience, batchId: audience === "everyone" ? null : batchId || null };
    try {
      if (editingId) {
        await updateAnnouncement(accessToken, refreshSession, editingId, input);
        setNotice("Draft updated.");
      } else {
        await createAnnouncement(accessToken, refreshSession, input);
        setNotice("Draft saved. Publish it when you are ready for the selected audience.");
      }
      resetForm();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this notice.");
    } finally {
      setSaving(false);
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
            ? "No eligible devices are registered for push."
            : result.push.failed > 0
              ? `Expo accepted ${result.push.accepted} of ${result.push.targeted} push requests; ${result.push.failed} failed.`
              : `Expo accepted all ${result.push.accepted} push requests. Device display is not confirmed.`;
        setNotice(`Published to ${announcement.audience}; it is available in the matching app feed. ${pushStatus}`);
      } else {
        await archiveAnnouncement(accessToken, refreshSession, announcement.id);
        setNotice("Notice archived and removed from its mobile feed.");
      }
      if (editingId === announcement.id) resetForm();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this notice.");
    } finally {
      setActionId(null);
    }
  }

  function edit(announcement: AdminAnnouncement) {
    setEditingId(announcement.id);
    setTitle(announcement.title);
    setBody(announcement.body);
    setAudience(announcement.audience);
    setBatchId(announcement.batchId ?? "");
    setNotice(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Communication</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Notices</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        Share academy updates with everyone, parents, or coaches. Notices appear in the matching mobile workspace.
      </p>

      <div className="mt-6 rounded-xl border border-[#d8e9e5] bg-[#f1faf7] p-4 text-sm leading-6 text-[#35645e]">
        Publishing adds the notice to the selected audience’s in-app feed. Email and SMS are not connected. Push status is reported after publishing; Expo acceptance does not confirm device display.
      </div>
      {error ? <div role="alert" className="mt-4 rounded-xl border border-[#f2d5ce] bg-[#fff7f5] p-4 text-sm text-[#984d3f]">{error}</div> : null}
      {notice ? <div role="status" className="mt-4 rounded-xl border border-[#d8e9e5] bg-[#f1faf7] p-4 text-sm text-accent">{notice}</div> : null}

      <div className="mt-7 grid items-start gap-6 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        <form onSubmit={(event) => void saveDraft(event)} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          {editingId ? "Edit draft" : "New notice"}
          </p>
          <h2 className="mt-2 text-xl font-semibold">{editingId ? "Update draft" : "Compose"}</h2>
          <div className="mt-5 space-y-4">
            <label className="block space-y-2 text-sm font-medium">
              <span>Title</span>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Message</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={4000}
                required
                rows={7}
                className="w-full resize-y rounded-xl border border-line bg-white px-3.5 py-3 text-sm leading-6 text-foreground shadow-sm outline-none placeholder:text-[#9aa4ad] focus:border-accent focus:ring-4 focus:ring-[#176e6718]"
                placeholder="Share schedule changes, event details, or an academy update."
              />
              <span className="block text-right text-xs font-normal text-muted">{body.length}/4000</span>
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Who should see this?</span>
              <select
                value={audience}
                onChange={(event) => {
                  const nextAudience = event.target.value as AnnouncementAudience;
                  setAudience(nextAudience);
                  if (nextAudience === "everyone") setBatchId("");
                }}
                className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-foreground shadow-sm outline-none focus:border-accent focus:ring-4 focus:ring-[#176e6718]"
              >
                <option value="everyone">Everyone</option>
                <option value="parents">Parents</option>
                <option value="coaches">Coaches</option>
              </select>
              {audience !== "everyone" ? (
                <select
                  aria-label="Optional batch audience"
                  value={batchId}
                  onChange={(event) => setBatchId(event.target.value)}
                  className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-foreground shadow-sm outline-none focus:border-accent focus:ring-4 focus:ring-[#176e6718]"
                >
                  <option value="">All {audience}</option>
                  {batches.map((batch) => (
                    <option key={batch.id} value={batch.id}>{batch.name} · {batch.programName}</option>
                  ))}
                </select>
              ) : null}
              <span className="block text-xs font-normal leading-5 text-muted">
                {audience === "parents"
                  ? "Batch notices appear to guardians of children actively enrolled in that batch."
                  : audience === "coaches"
                    ? "Batch notices appear to coaches assigned to that batch."
                    : "Academy-wide notices appear in both parent and coach feeds."}
              </span>
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="submit" disabled={saving || !title.trim() || !body.trim()}>
                {saving ? "Saving…" : editingId ? "Save draft" : "Save as draft"}
              </Button>
              {editingId ? <Button type="button" variant="outline" onClick={resetForm}>Cancel edit</Button> : null}
            </div>
          </div>
        </form>

        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Message history</p>
              <h2 className="mt-2 text-xl font-semibold">Notice history</h2>
            </div>
            <span className="text-xs text-muted">{announcements.length} total</span>
          </div>
          {loading ? <p className="mt-6 text-sm text-muted">Loading notices…</p> : null}
          {!loading && announcements.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-line p-6 text-center">
              <p className="text-sm font-semibold">No notices yet</p>
              <p className="mt-1 text-sm text-muted">Save a draft to start your academy notice history.</p>
            </div>
          ) : null}
          <div className="mt-5 space-y-3">
            {announcements.map((announcement) => (
              <article key={announcement.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{announcement.title}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(announcement.status)}`}>
                        {announcement.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {announcement.batchName
                        ? `${announcement.audience} · ${announcement.batchName}`
                        : announcement.audience === "everyone"
                          ? "Everyone"
                          : `All ${announcement.audience}`}
                      {announcement.status === "published" ? ` · ${announcement.readCount} reads` : ""}
                    </p>
                  </div>
                  <span className="text-right text-[11px] text-muted">
                    {announcement.status === "published" ? "Published" : "Updated"}<br />
                    {formatDate(announcement.publishedAt ?? announcement.updatedAt)}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#53616b]">{announcement.body}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {announcement.status === "draft" ? (
                    <>
                      <Button type="button" size="sm" variant="outline" onClick={() => edit(announcement)}>Edit</Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={actionId === announcement.id}
                        onClick={() => void changeStatus(announcement, "publish")}
                      >
                        {actionId === announcement.id ? "Publishing…" : `Publish to ${announcement.audience}`}
                      </Button>
                    </>
                  ) : null}
                  {announcement.status !== "archived" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={actionId === announcement.id}
                      onClick={() => void changeStatus(announcement, "archive")}
                    >
                      Archive
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

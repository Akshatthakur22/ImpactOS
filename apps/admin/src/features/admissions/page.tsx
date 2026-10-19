"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { AcademyCatalog, Inquiry, InquiryStatus } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import {
  addInquiryActivity,
  convertInquiry,
  createInquiry,
  getInquiry,
  getInquiries,
} from "@/lib/admissions-api";
import { getAcademyCatalog } from "@/lib/academy-api";

const statuses: InquiryStatus[] = [
  "new",
  "contacted",
  "follow_up",
  "trial_scheduled",
  "converted",
  "lost",
];
const statusLabels: Record<InquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  follow_up: "Follow-up",
  trial_scheduled: "Trial scheduled",
  converted: "Converted",
  lost: "Lost",
};

function formatDate(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function toLocalDateTimeValue(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function statusTone(status: InquiryStatus) {
  if (status === "converted") return "bg-[#e5f3f0] text-accent";
  if (status === "lost") return "bg-[#eef2f4] text-muted";
  if (status === "follow_up" || status === "trial_scheduled") return "bg-[#fff3dc] text-[#8a6418]";
  return "bg-[#edf3fa] text-[#3d628b]";
}

export default function AdmissionsPage() {
  const { accessToken, refreshSession } = useAuth();
  const [catalog, setCatalog] = useState<AcademyCatalog | null>(null);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InquiryStatus | "all">("all");
  const [followUpFilter, setFollowUpFilter] = useState<"all" | "due" | "upcoming" | "none">("all");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [studentFirstName, setStudentFirstName] = useState("");
  const [studentLastName, setStudentLastName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [relationship, setRelationship] = useState("Parent");
  const [source, setSource] = useState("Referral");
  const [sourceDetail, setSourceDetail] = useState("");
  const [programId, setProgramId] = useState("");
  const [initialNotes, setInitialNotes] = useState("");
  const [initialFollowUp, setInitialFollowUp] = useState("");
  const [activityType, setActivityType] = useState<"note" | "call" | "message" | "visit" | "trial">(
    "call",
  );
  const [activityNote, setActivityNote] = useState("");
  const [activityStatus, setActivityStatus] = useState<Exclude<InquiryStatus, "converted"> | "">(
    "",
  );
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [clearFollowUp, setClearFollowUp] = useState(false);
  const [conversionBatchId, setConversionBatchId] = useState("");

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    const result = await getInquiries(accessToken, refreshSession, {
      search: search.trim() || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      followUp: followUpFilter === "all" ? undefined : followUpFilter,
      limit: 100,
    });
    setInquiries(result.inquiries);
    if (!selectedId && result.inquiries[0]) setSelectedId(result.inquiries[0].id);
  }, [accessToken, refreshSession, search, statusFilter, followUpFilter, selectedId]);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setLoading(true);
    Promise.all([
      getInquiries(accessToken, refreshSession, { limit: 100 }),
      getAcademyCatalog(accessToken, refreshSession),
    ])
      .then(([list, nextCatalog]) => {
        if (!active) return;
        setInquiries(list.inquiries);
        setCatalog(nextCatalog);
        if (list.inquiries[0]) setSelectedId(list.inquiries[0].id);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(caught instanceof Error ? caught.message : "Could not load admissions.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, refreshSession]);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    getInquiries(accessToken, refreshSession, {
      search: search.trim() || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      followUp: followUpFilter === "all" ? undefined : followUpFilter,
      limit: 100,
    })
      .then((result) => {
        if (!active) return;
        setInquiries(result.inquiries);
        if (selectedId && !result.inquiries.some((inquiry) => inquiry.id === selectedId)) {
          setSelectedId(result.inquiries[0]?.id ?? null);
        } else if (!selectedId && result.inquiries[0]) {
          setSelectedId(result.inquiries[0].id);
        }
      })
      .catch((caught: unknown) => {
        if (active)
          setError(caught instanceof Error ? caught.message : "Could not filter inquiries.");
      });
    return () => {
      active = false;
    };
  }, [accessToken, refreshSession, search, statusFilter, followUpFilter, selectedId]);

  useEffect(() => {
    if (!accessToken || !selectedId) {
      setSelected(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    getInquiry(accessToken, refreshSession, selectedId)
      .then((detail) => {
        if (active) {
          setSelected(detail);
          setActivityStatus(detail.status === "converted" ? "" : detail.status);
          setNextFollowUp(detail.nextFollowUpAt ? toLocalDateTimeValue(detail.nextFollowUpAt) : "");
        }
      })
      .catch((caught: unknown) => {
        if (active)
          setError(caught instanceof Error ? caught.message : "Could not load this inquiry.");
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, refreshSession, selectedId]);

  const activeBatches = useMemo(
    () => catalog?.batches.filter((batch) => batch.isActive) ?? [],
    [catalog],
  );

  async function reloadSelected(inquiryId = selectedId) {
    if (!accessToken) return;
    await refresh();
    if (inquiryId) {
      const inquiry = await getInquiry(accessToken, refreshSession, inquiryId);
      setSelected(inquiry);
    }
  }

  async function saveInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const inquiry = await createInquiry(accessToken, refreshSession, {
        studentFirstName,
        studentLastName,
        contactName,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        relationship,
        source,
        sourceDetail: sourceDetail.trim() || undefined,
        programId: programId || undefined,
        notes: initialNotes.trim() || undefined,
        nextFollowUpAt: initialFollowUp ? new Date(initialFollowUp).toISOString() : undefined,
      });
      setSelectedId(inquiry.id);
      setSelected(inquiry);
      setStudentFirstName("");
      setStudentLastName("");
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setSource("Referral");
      setSourceDetail("");
      setProgramId("");
      setInitialNotes("");
      setInitialFollowUp("");
      setShowCreate(false);
      setNotice("Inquiry added to the admissions queue.");
      await reloadSelected(inquiry.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this inquiry.");
    } finally {
      setSaving(false);
    }
  }

  async function saveActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !selected) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await addInquiryActivity(accessToken, refreshSession, selected.id, {
        type: activityType,
        note: activityNote,
        ...(activityStatus ? { status: activityStatus } : {}),
        nextFollowUpAt: clearFollowUp
          ? null
          : nextFollowUp
            ? new Date(nextFollowUp).toISOString()
            : undefined,
      });
      setSelected(updated);
      setActivityNote("");
      setClearFollowUp(false);
      setNotice("Follow-up saved to the inquiry history.");
      await reloadSelected(updated.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this follow-up.");
    } finally {
      setSaving(false);
    }
  }

  async function convert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !selected) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await convertInquiry(accessToken, refreshSession, selected.id, {
        batchId: conversionBatchId || undefined,
      });
      setNotice(
        "Inquiry converted. The student, guardian link, and optional enrollment were created together.",
      );
      await reloadSelected(selected.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not convert this inquiry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="sd-page">
      <PageHeader eyebrow="People" title="Admissions" description="Track prospective students, record each contact, and convert a successful inquiry into an academy record."
        actions={<Button onClick={() => setShowCreate((open) => !open)}>
          {showCreate ? "Close form" : "New inquiry"}
        </Button>} />

      {error ? (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-[#f2d5ce] bg-[#fff7f5] p-4 text-sm text-[#984d3f]"
        >
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          className="mt-5 rounded-xl border border-[#cfe6df] bg-[#f1faf7] p-4 text-sm text-accent"
        >
          {notice}
        </div>
      ) : null}

      {showCreate ? (
        <form
          onSubmit={(event) => void saveInquiry(event)}
          className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 className="text-lg font-semibold">Add prospective student</h2>
          <p className="mt-1 text-sm text-muted">
            Record only the contact details needed to follow up. A student record is created when
            you convert this inquiry.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-2 text-sm font-medium">
              Student first name
              <Input
                value={studentFirstName}
                onChange={(event) => setStudentFirstName(event.target.value)}
                maxLength={80}
                required
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Student last name
              <Input
                value={studentLastName}
                onChange={(event) => setStudentLastName(event.target.value)}
                maxLength={80}
                required
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Parent / contact name
              <Input
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                maxLength={120}
                required
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Relationship
              <Input
                value={relationship}
                onChange={(event) => setRelationship(event.target.value)}
                maxLength={40}
                required
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Contact email
              <Input
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                maxLength={254}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Contact phone
              <Input
                type="tel"
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                maxLength={30}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Lead source
              <Input
                value={source}
                onChange={(event) => setSource(event.target.value)}
                maxLength={120}
                required
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Source details
              <Input
                value={sourceDetail}
                onChange={(event) => setSourceDetail(event.target.value)}
                maxLength={240}
                placeholder="Referral name, campaign, event…"
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Program interest
              <select
                className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm"
                value={programId}
                onChange={(event) => setProgramId(event.target.value)}
              >
                <option value="">Not selected</option>
                {catalog?.programs
                  .filter((program) => program.isActive)
                  .map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.disciplineName} · {program.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium">
              Next follow-up
              <Input
                type="datetime-local"
                value={initialFollowUp}
                onChange={(event) => setInitialFollowUp(event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm font-medium sm:col-span-2">
              Initial notes
              <textarea
                className="min-h-11 w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm"
                value={initialNotes}
                onChange={(event) => setInitialNotes(event.target.value)}
                maxLength={4000}
                rows={2}
              />
            </label>
          </div>
          {!contactEmail.trim() && !contactPhone.trim() ? (
            <p className="mt-3 text-xs text-[#984d3f]">
              Enter an email or phone number so the contact can be reached.
            </p>
          ) : null}
          <div className="mt-5 flex gap-2">
            <Button
              type="submit"
              disabled={saving || (!contactEmail.trim() && !contactPhone.trim())}
            >
              {saving ? "Saving…" : "Add to admissions"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.18fr)]">
        <section className="min-w-0 rounded-2xl border border-line bg-white shadow-sm">
          <div className="border-b border-line p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                aria-label="Search admissions"
                placeholder="Search student or contact"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                aria-label="Filter by status"
                className="h-11 rounded-xl border border-line bg-white px-3 text-sm"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as InquiryStatus | "all")}
              >
                <option value="all">All statuses</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter follow-ups"
                className="h-11 rounded-xl border border-line bg-white px-3 text-sm sm:col-span-2"
                value={followUpFilter}
                onChange={(event) => setFollowUpFilter(event.target.value as typeof followUpFilter)}
              >
                <option value="all">All follow-ups</option>
                <option value="due">Due or overdue</option>
                <option value="upcoming">Upcoming</option>
                <option value="none">No follow-up scheduled</option>
              </select>
            </div>
            <p className="mt-3 text-xs text-muted">
              {inquiries.length} {inquiries.length === 1 ? "inquiry" : "inquiries"} shown
            </p>
          </div>
          {loading ? (
            <p className="p-6 text-sm text-muted">Loading admissions…</p>
          ) : inquiries.length ? (
            <ul className="divide-y divide-line">
              {inquiries.map((inquiry) => (
                <li key={inquiry.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(inquiry.id);
                      setNotice(null);
                      setError(null);
                    }}
                    className={`w-full p-4 text-left transition hover:bg-[#f8faf9] sm:p-5 ${selectedId === inquiry.id ? "bg-[#f2f8f6]" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold">
                        {inquiry.studentFirstName} {inquiry.studentLastName}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusTone(inquiry.status)}`}
                      >
                        {statusLabels[inquiry.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {inquiry.contactName} · {inquiry.contactEmail ?? inquiry.contactPhone}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span>Source: {inquiry.source}</span>
                      <span>{inquiry.programName ?? "No program selected"}</span>
                    </div>
                    <p className="mt-2 text-xs font-medium text-[#8a6418]">
                      Next follow-up: {formatDate(inquiry.nextFollowUpAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-8 text-center">
              <p className="font-medium">No admissions inquiries yet</p>
              <p className="mt-1 text-sm text-muted">
                Add a prospective student to begin tracking follow-ups.
              </p>
            </div>
          )}
        </section>

        <section className="min-w-0 space-y-5">
          {detailLoading ? (
            <div className="rounded-2xl border border-line bg-white p-8 text-sm text-muted">
              Loading inquiry history…
            </div>
          ) : selected ? (
            <>
              <article className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                      Inquiry record
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold">
                      {selected.studentFirstName} {selected.studentLastName}
                    </h2>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusTone(selected.status)}`}
                  >
                    {statusLabels[selected.status]}
                  </span>
                </div>
                <dl className="mt-5 grid gap-x-5 gap-y-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted">Contact</dt>
                    <dd className="mt-1 font-medium">
                      {selected.contactName} · {selected.relationship}
                    </dd>
                    <dd className="mt-1 text-muted">
                      {selected.contactEmail ?? "No email"} · {selected.contactPhone ?? "No phone"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Lead source</dt>
                    <dd className="mt-1 font-medium">
                      {selected.source}
                      {selected.sourceDetail ? ` · ${selected.sourceDetail}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Program interest</dt>
                    <dd className="mt-1 font-medium">{selected.programName ?? "Not selected"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Next follow-up</dt>
                    <dd className="mt-1 font-medium">{formatDate(selected.nextFollowUpAt)}</dd>
                  </div>
                </dl>
                {selected.notes ? (
                  <p className="mt-5 rounded-xl bg-[#f7f9f8] p-4 text-sm leading-6">
                    {selected.notes}
                  </p>
                ) : null}
                {selected.convertedStudentId ? (
                  <p className="mt-4 rounded-xl bg-[#f1faf7] p-4 text-sm">
                    Converted to student record.{" "}
                    <Link className="font-semibold text-accent underline" href="/students">
                      Open students
                    </Link>
                  </p>
                ) : null}
              </article>

              {selected.status !== "converted" && selected.status !== "lost" ? (
                <form
                  onSubmit={(event) => void saveActivity(event)}
                  className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6"
                >
                  <h3 className="font-semibold">Record a follow-up</h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2 text-sm font-medium">
                      Contact method
                      <select
                        className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm"
                        value={activityType}
                        onChange={(event) =>
                          setActivityType(event.target.value as typeof activityType)
                        }
                      >
                        <option value="call">Call</option>
                        <option value="message">Message</option>
                        <option value="visit">Visit</option>
                        <option value="trial">Trial session</option>
                        <option value="note">Note</option>
                      </select>
                    </label>
                    <label className="space-y-2 text-sm font-medium">
                      Update status
                      <select
                        className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm"
                        value={activityStatus}
                        onChange={(event) =>
                          setActivityStatus(
                            event.target.value as Exclude<InquiryStatus, "converted"> | "",
                          )
                        }
                      >
                        <option value="">Keep {statusLabels[selected.status]}</option>
                        {statuses
                          .filter((status) => status !== "converted")
                          .map((status) => (
                            <option key={status} value={status}>
                              {statusLabels[status]}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="space-y-2 text-sm font-medium sm:col-span-2">
                      Follow-up notes
                      <textarea
                        className="min-h-24 w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm"
                        value={activityNote}
                        onChange={(event) => setActivityNote(event.target.value)}
                        maxLength={4000}
                        required
                      />
                    </label>
                    <label className="space-y-2 text-sm font-medium">
                      Next follow-up
                      <Input
                        type="datetime-local"
                        value={nextFollowUp}
                        onChange={(event) => {
                          setNextFollowUp(event.target.value);
                          setClearFollowUp(false);
                        }}
                      />
                    </label>
                    <label className="flex items-center gap-2 pt-7 text-sm text-muted">
                      <input
                        type="checkbox"
                        checked={clearFollowUp}
                        onChange={(event) => setClearFollowUp(event.target.checked)}
                      />
                      Clear scheduled follow-up
                    </label>
                  </div>
                  <Button className="mt-4" type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save follow-up"}
                  </Button>
                </form>
              ) : null}

              {selected.status !== "converted" && selected.status !== "lost" ? (
                <form
                  onSubmit={(event) => void convert(event)}
                  className="rounded-2xl border border-[#d8e9e5] bg-[#f5fbf8] p-5 sm:p-6"
                >
                  <h3 className="font-semibold">Convert to a student</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Creates the student and guardian link in one transaction. Choose a batch to
                    activate and enroll the student now.
                  </p>
                  <label className="mt-4 block space-y-2 text-sm font-medium">
                    Initial batch
                    <select
                      className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm"
                      value={conversionBatchId}
                      onChange={(event) => setConversionBatchId(event.target.value)}
                    >
                      <option value="">No batch yet · keep pending</option>
                      {activeBatches.map((batch) => (
                        <option key={batch.id} value={batch.id}>
                          {batch.programName} · {batch.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button className="mt-4" type="submit" disabled={saving}>
                    {saving ? "Converting…" : "Convert inquiry"}
                  </Button>
                </form>
              ) : null}

              <article className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
                <h3 className="font-semibold">Contact history</h3>
                {selected.activities?.length ? (
                  <ol className="mt-4 space-y-4">
                    {selected.activities.map((activity) => (
                      <li key={activity.id} className="border-l-2 border-[#d8e9e5] pl-4">
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="text-sm font-semibold capitalize">
                            {activity.type.replaceAll("_", " ")}
                            {activity.statusAfter ? ` · ${statusLabels[activity.statusAfter]}` : ""}
                          </span>
                          <time className="text-xs text-muted">
                            {formatDate(activity.createdAt)}
                          </time>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted">
                          {activity.note}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          By {activity.createdByName}
                          {activity.nextFollowUpAt
                            ? ` · Follow up ${formatDate(activity.nextFollowUpAt)}`
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-3 text-sm text-muted">No follow-ups recorded yet.</p>
                )}
              </article>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-white p-10 text-center text-sm text-muted">
              Select an inquiry to view its details and history.
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AcademySettings } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { useAuth } from "@/hooks/use-auth";
import { ApiRequestError } from "@/lib/auth-api";
import { getAcademySettings, updateAcademySettings } from "@/lib/settings-api";

export default function SettingsPage() {
  const { accessToken, refreshSession } = useAuth();
  const [settings, setSettings] = useState<AcademySettings | null>(null);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    getAcademySettings(accessToken, refreshSession)
      .then((result) => {
        if (!active) return;
        setSettings(result);
        setName(result.name);
        setTimezone(result.timezone);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(caught instanceof Error ? caught.message : "Could not load academy settings.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, refreshSession]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await updateAcademySettings(accessToken, refreshSession, { name, timezone });
      setSettings(result);
      setName(result.name);
      setTimezone(result.timezone);
      await refreshSession();
      setNotice("Academy settings saved.");
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError || caught instanceof Error
          ? caught.message
          : "Could not save academy settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="sd-page">
      <PageHeader eyebrow="Administration" title="Academy settings" description="Manage your academy identity and the timezone used for schedules, attendance and finance reporting." />

      {error ? (
        <div role="alert" className="mt-6 rounded-xl border border-[#f2d5ce] bg-[#fff7f5] p-4 text-sm text-[#984d3f]">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="mt-6 rounded-xl border border-[#cfe6df] bg-[#f1faf7] p-4 text-sm text-accent">
          {notice}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-8 rounded-2xl border border-line bg-white p-6 text-sm text-muted">
          Loading academy settings…
        </div>
      ) : settings ? (
        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <form onSubmit={(event) => void save(event)} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Academy profile</p>
            <h2 className="mt-2 text-xl font-semibold">Identity and regional settings</h2>
            <div className="mt-6 space-y-5">
              <label className="block space-y-2 text-sm font-medium">
                <span>Academy name</span>
                <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required />
              </label>
              <label className="block space-y-2 text-sm font-medium">
                <span>Timezone</span>
                <Input
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  placeholder="Asia/Kolkata"
                  maxLength={80}
                  required
                />
                <span className="block text-xs font-normal leading-5 text-muted">
                  Enter an IANA timezone such as Asia/Kolkata or Europe/London.
                </span>
              </label>
              <Button type="submit" disabled={saving || !name.trim() || !timezone.trim()}>
                {saving ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </form>

          <aside className="space-y-5">
            <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Workspace identifiers</p>
              <dl className="mt-5 space-y-4 text-sm">
                <div>
                  <dt className="text-xs text-muted">Academy slug</dt>
                  <dd className="mt-1 font-medium">{settings.slug}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Ledger currency</dt>
                  <dd className="mt-1 font-medium">{settings.currency}</dd>
                </div>
              </dl>
            </div>
            <div className="rounded-2xl border border-[#e9e3c9] bg-[#fffdf3] p-5 text-xs leading-5 text-[#716743]">
              Currency is locked because existing invoices and payments are recorded in {settings.currency}.
              Changing it safely requires a separate migration and reconciliation workflow.
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}

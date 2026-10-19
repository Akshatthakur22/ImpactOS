"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Permission } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { useAuth } from "@/hooks/use-auth";
import { createStaff, getStaff, updateStaff, type StaffMember } from "@/lib/staff-api";

type PermissionItem = readonly [Permission, string];
type PermissionGroup = { label: string; items: readonly PermissionItem[] };
const permissionGroups = [
  { label: "Overview & insight", items: [["admin:dashboard:read", "Dashboard"], ["reports:read", "Performance and reports"]] },
  { label: "People", items: [["students:read", "View students"], ["students:write", "Manage students and guardians"], ["admissions:manage", "Manage admissions"], ["coaches:read", "View coaches"], ["coaches:write", "Manage coach accounts and assignments"]] },
  { label: "Academy operations", items: [["academy:manage", "Manage programs and batches"], ["schedules:read", "View schedules"], ["schedules:write", "Manage schedules and sessions"], ["attendance:read", "View attendance"], ["attendance:write", "Submit attendance"], ["attendance:correct", "Correct recorded attendance"]] },
  { label: "Finance", items: [["payments:read", "View invoices and receipts"], ["payments:record", "Record payments and refunds"], ["expenses:manage", "Manage expenses"]] },
  { label: "Communication & settings", items: [["announcements:manage", "Manage notices"], ["settings:manage", "Manage academy settings and branches"]] },
] as const satisfies readonly PermissionGroup[];

export default function StaffPage() {
  const { accessToken } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [selected, setSelected] = useState<string[]>(["admin:dashboard:read"]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    if (accessToken) setStaff(await getStaff(accessToken));
  }, [accessToken]);
  useEffect(() => {
    void refresh().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : "Could not load staff."),
    );
  }, [refresh]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await createStaff(accessToken, {
        email,
        displayName: name,
        initialPassword: password,
        permissions: selected,
      });
      setEmail("");
      setName("");
      setPassword("");
      await refresh();
      setNotice(
        "Staff account created. Ask them to use Forgot password to set their own password.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create staff account.");
    } finally {
      setBusy(false);
    }
  }
  async function toggle(member: StaffMember) {
    if (!accessToken) return;
    setBusy(true);
    setError("");
    try {
      await updateStaff(accessToken, member.id, { isActive: !member.isActive });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update staff account.");
    } finally {
      setBusy(false);
    }
  }
  async function togglePermission(member: StaffMember, permission: Permission) {
    if (!accessToken) return;
    setBusy(true);
    setError("");
    const next = member.permissions.includes(permission)
      ? member.permissions.filter((value) => value !== permission)
      : [...member.permissions, permission];
    try {
      await updateStaff(accessToken, member.id, { permissions: next });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update permissions.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="sd-page">
      <PageHeader eyebrow="Administration" title="Staff access" description="Create accounts and grant the minimum access each teammate needs." />
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-white p-6">
          <h2 className="text-lg font-semibold">Add staff member</h2>
          <Input
            required
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            required
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            required
            type="password"
            minLength={14}
            placeholder="Temporary password (14+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Permissions</legend>
            <div className="space-y-4">
              {permissionGroups.map((group) => <fieldset key={group.label} className="rounded-xl border border-[#e8ece9] p-3"><legend className="px-1 text-xs font-semibold text-[#4e5d56]">{group.label}</legend><div className="grid gap-2 sm:grid-cols-2">{group.items.map(([key, label]) => <label key={key} className="flex min-h-9 items-center gap-2 rounded-lg px-2 text-[12px] text-[#53615b] hover:bg-[#f6f8f6]"><input type="checkbox" className="size-4 accent-[#176e67]" checked={selected.includes(key)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, key] : current.filter((item) => item !== key))} />{label}</label>)}</div></fieldset>)}
            </div>
          </fieldset>
          <Button disabled={busy || selected.length === 0}>Create staff account</Button>
        </form>
        <div className="rounded-2xl border border-line bg-white p-6">
          <h2 className="text-lg font-semibold">Current staff</h2>
          <div className="mt-4 divide-y divide-line">
            {staff.map((member) => (
              <article key={member.id} className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">{member.displayName}</p>
                    <p className="text-sm text-muted">{member.email}</p>
                    <p className="mt-1 text-xs text-muted">
                      {member.permissions.length
                        ? member.permissions.length + " permissions"
                        : "No permissions"}{" "}
                      · {member.isActive ? "Active" : "Inactive"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void toggle(member)}
                  >
                    {member.isActive ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-accent">
                    Edit permissions
                  </summary>
                  <div className="mt-3 space-y-3">{permissionGroups.map((group) => <fieldset key={group.label} className="rounded-xl border border-[#e8ece9] p-3"><legend className="px-1 text-[11px] font-semibold text-[#4e5d56]">{group.label}</legend><div className="grid gap-1 sm:grid-cols-2">{group.items.map(([key, label]) => <label key={key} className="flex min-h-8 items-center gap-2 rounded-lg px-2 text-[11px] text-[#53615b]"><input type="checkbox" className="size-4 accent-[#176e67]" disabled={busy || !member.isActive} checked={member.permissions.includes(key)} onChange={() => void togglePermission(member, key)} />{label}</label>)}</div></fieldset>)}</div>
                </details>
              </article>
            ))}
            {staff.length === 0 && (
              <p className="py-6 text-sm text-muted">No staff accounts yet.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

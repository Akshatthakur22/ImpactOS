"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Permission } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { createStaff, getStaff, updateStaff, type StaffMember } from "@/lib/staff-api";

const permissions = [
  ["admin:dashboard:read", "Dashboard"],
  ["reports:read", "Analytics and reports"],
  ["students:read", "View students"],
  ["students:write", "Manage students"],
  ["admissions:manage", "Admissions"],
  ["coaches:read", "View coaches"],
  ["coaches:write", "Manage coaches"],
  ["academy:manage", "Programs and batches"],
  ["schedules:read", "View schedules"],
  ["schedules:write", "Manage schedules"],
  ["attendance:read", "View attendance"],
  ["attendance:write", "Take attendance"],
  ["attendance:correct", "Correct attendance"],
  ["payments:read", "View finance"],
  ["payments:record", "Record payments"],
  ["expenses:manage", "Manage expenses"],
  ["announcements:manage", "Manage notices"],
  ["settings:manage", "Academy settings"],
] as const;

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
    <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">
          Administration
        </p>
        <h1 className="mt-2 text-3xl font-bold">Staff access</h1>
        <p className="mt-2 text-sm text-muted">
          Create accounts and grant the minimum access each teammate needs.
        </p>
      </div>
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
            <div className="grid gap-2 sm:grid-cols-2">
              {permissions.map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(key)}
                    onChange={(e) =>
                      setSelected((current) =>
                        e.target.checked
                          ? [...current, key]
                          : current.filter((item) => item !== key),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
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
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {permissions.map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          disabled={busy || !member.isActive}
                          checked={member.permissions.includes(key)}
                          onChange={() => void togglePermission(member, key)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
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

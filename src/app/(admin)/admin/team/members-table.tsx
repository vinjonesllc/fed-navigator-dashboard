"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ROLE_LABELS, type AppUser } from "@/lib/supabase/types";
import { updateUser } from "./actions";

type ClientOpt = { id: string; name: string; slug: string };
type Role = "admin" | "editor" | "super_advisor" | "advisor";

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Full access, including team management." },
  { value: "editor", label: "Editor", hint: "Same as admin, but cannot invite users." },
  {
    value: "super_advisor",
    label: "Super-Advisor",
    hint: "Read-only access to multiple specific advisor pages.",
  },
  {
    value: "advisor",
    label: "Advisor",
    hint: "Read-only access to a single advisor page (their own).",
  },
];

function EditMemberDialog({
  member,
  clients,
  grants,
  onClose,
}: {
  member: AppUser;
  clients: ClientOpt[];
  grants: string[];
  onClose: () => void;
}) {
  const [role, setRole] = useState<Role>(member.role as Role);
  const [clientId, setClientId] = useState<string>(member.client_id ?? "");
  const [superClientIds, setSuperClientIds] = useState<Set<string>>(new Set(grants));
  const [pending, startTransition] = useTransition();

  function toggleSuperClient(id: string) {
    setSuperClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("userId", member.id);
    fd.set("originalEmail", member.email);
    fd.set("role", role);
    fd.set("clientId", role === "advisor" ? clientId : "");
    fd.set(
      "superAdvisorClientIds",
      JSON.stringify(role === "super_advisor" ? Array.from(superClientIds) : []),
    );
    startTransition(async () => {
      try {
        await updateUser(fd);
        toast.success("Member updated");
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    });
  }

  const roleHint = ROLES.find((r) => r.value === role)?.hint;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit member</DialogTitle>
          <DialogDescription className="font-mono text-[12px]">{member.email}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required defaultValue={member.email} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" name="fullName" defaultValue={member.full_name ?? ""} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {roleHint && <p className="text-xs text-ink-4">{roleHint}</p>}
          </div>

          {role === "advisor" && (
            <div className="space-y-2">
              <Label>Advisor (assigned page)</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick an advisor" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {role === "super_advisor" && (
            <div className="space-y-2">
              <Label>Advisors this Super-Advisor can view</Label>
              <div className="max-h-48 overflow-y-auto rounded border border-line-1 p-2">
                {clients.length === 0 ? (
                  <p className="p-2 text-sm text-ink-4">No advisors to assign.</p>
                ) : (
                  clients.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-bg-2"
                    >
                      <input
                        type="checkbox"
                        checked={superClientIds.has(c.id)}
                        onChange={() => toggleSuperClient(c.id)}
                      />
                      <span>{c.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="password">New password (optional)</Label>
            <Input
              id="password"
              name="password"
              type="text"
              minLength={8}
              placeholder="Leave blank to keep current"
            />
            <p className="text-xs text-ink-4">
              Setting a value resets the member&apos;s password (≥ 8 chars). Share it securely.
            </p>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MembersTable({
  members,
  clients,
  grantsByUser,
}: {
  members: AppUser[];
  clients: ClientOpt[];
  grantsByUser: Record<string, string[]>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = members.find((m) => m.id === selectedId) ?? null;
  const clientById = new Map(clients.map((c) => [c.id, c]));

  return (
    <>
      <table className="w-full border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            {["Email", "Role", "Advisor / Access", "Joined"].map((h) => (
              <th
                key={h}
                className="border-b border-line-1 bg-bg-2 px-4 py-2.5 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-4"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((u) => {
            const access =
              u.role === "super_advisor"
                ? (grantsByUser[u.id] ?? [])
                    .map((cid) => clientById.get(cid)?.name ?? cid.slice(0, 8))
                    .join(", ") || "—"
                : u.client_id
                  ? (clientById.get(u.client_id)?.name ?? u.client_id.slice(0, 8))
                  : "—";
            return (
              <tr
                key={u.id}
                onClick={() => setSelectedId(u.id)}
                className="cursor-pointer hover:bg-bg-2"
                title="Click to edit this member"
              >
                <td className="border-b border-line-2 px-4 py-3 font-medium text-ink-1 dark:text-white">
                  {u.email}
                </td>
                <td className="border-b border-line-2 px-4 py-3">
                  <span className="rounded border border-line-1 bg-bg-2 px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wide text-ink-3">
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                </td>
                <td className="border-b border-line-2 px-4 py-3 text-ink-2">{access}</td>
                <td className="border-b border-line-2 px-4 py-3 font-mono text-[11.5px] text-ink-4">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {selected && (
        <EditMemberDialog
          key={selected.id}
          member={selected}
          clients={clients}
          grants={grantsByUser[selected.id] ?? []}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}

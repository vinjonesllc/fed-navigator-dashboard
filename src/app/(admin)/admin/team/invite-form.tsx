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
import { inviteUser } from "./actions";

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

export function InviteForm({ clients }: { clients: ClientOpt[] }) {
  const [role, setRole] = useState<Role>("advisor");
  const [clientId, setClientId] = useState<string>("");
  const [superClientIds, setSuperClientIds] = useState<Set<string>>(new Set());
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
    fd.set("role", role);
    fd.set("clientId", role === "advisor" ? clientId : "");
    fd.set(
      "superAdvisorClientIds",
      JSON.stringify(role === "super_advisor" ? Array.from(superClientIds) : []),
    );
    startTransition(async () => {
      try {
        await inviteUser(fd);
        toast.success("Invite sent");
        (e.target as HTMLFormElement).reset();
        setSuperClientIds(new Set());
        setClientId("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Invite failed");
      }
    });
  }

  const roleHint = ROLES.find((r) => r.value === role)?.hint;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
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
      </div>

      {role === "advisor" && (
        <div className="space-y-2">
          <Label>Client (advisor's assigned page)</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a client" />
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
          <Label>Clients this Super-Advisor can view</Label>
          <div className="max-h-48 overflow-y-auto rounded border border-line-1 p-2">
            {clients.length === 0 ? (
              <p className="p-2 text-sm text-ink-4">No clients to assign.</p>
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
          <p className="text-xs text-ink-4">
            Pick at least one. Super-Advisors see these clients' pages read-only.
          </p>
        </div>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Sending..." : "Send invite"}
      </Button>
    </form>
  );
}

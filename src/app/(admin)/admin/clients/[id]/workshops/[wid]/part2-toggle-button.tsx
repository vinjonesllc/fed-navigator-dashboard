"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setPart2Enabled } from "./part2/actions";

/**
 * Enable/disable the Part 2 Booking module for a workshop. Rendered in the
 * manager action row (enable) and on the Part 2 page header (disable).
 */
export function Part2ToggleButton({
  clientId,
  workshopId,
  enabled,
}: {
  clientId: string;
  workshopId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (enabled && !confirm("Turn off Part 2 Booking for this workshop? Registrations stay on file.")) {
      return;
    }
    const fd = new FormData();
    fd.set("clientId", clientId);
    fd.set("workshopId", workshopId);
    fd.set("enabled", enabled ? "false" : "true");
    startTransition(async () => {
      try {
        const r = await setPart2Enabled(fd);
        if (r.error) toast.error(r.error);
        else toast.success(enabled ? "Part 2 Booking disabled" : "Part 2 Booking enabled");
        if (!enabled) router.push(`/admin/clients/${clientId}/workshops/${workshopId}/part2`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Action failed");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={pending}
      className="rounded-[9px] border-line-1 bg-surface text-ink-2 hover:bg-bg-2 hover:text-ink-1"
    >
      {pending ? "…" : enabled ? "Disable Part 2 Booking" : "Enable Part 2 Booking"}
    </Button>
  );
}

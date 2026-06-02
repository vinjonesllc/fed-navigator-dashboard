"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reextractIntents } from "../../../../upload/actions";

export function ReextractButton({ workshopId }: { workshopId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    const fd = new FormData();
    fd.set("workshopId", workshopId);
    startTransition(async () => {
      try {
        const r = await reextractIntents(fd);
        if (r.error) {
          toast.error(`Extract problem: ${r.error}`);
        } else {
          toast.success(`Re-extracted ${r.inserted} intent(s)`);
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Re-extract failed");
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
      {pending ? "Re-extracting…" : "Re-extract intents"}
    </Button>
  );
}

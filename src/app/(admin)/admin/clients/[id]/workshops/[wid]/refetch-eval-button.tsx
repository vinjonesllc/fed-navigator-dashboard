"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refetchEvalComments } from "../../../../upload/actions";

export function RefetchEvalButton({ workshopId }: { workshopId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    const fd = new FormData();
    fd.set("workshopId", workshopId);
    startTransition(async () => {
      try {
        const r = await refetchEvalComments(fd);
        if (r.error) {
          toast.error(`Eval fetch: ${r.error}`, { duration: 12_000 });
        } else {
          toast.success(`Pulled ${r.inserted} eval comment(s)`);
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Eval fetch failed");
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
      {pending ? "Fetching evals…" : "Re-fetch evals"}
    </Button>
  );
}

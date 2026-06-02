"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteWorkshop } from "../../../../upload/actions";

export function DeleteWorkshopButton({
  workshopId,
  clientId,
}: {
  workshopId: string;
  clientId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!confirm("Delete this workshop and all its data? This cannot be undone.")) {
      return;
    }
    const fd = new FormData();
    fd.set("workshopId", workshopId);
    startTransition(async () => {
      try {
        await deleteWorkshop(fd);
        toast.success("Workshop deleted");
        router.push(`/admin/clients/${clientId}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
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
      className="rounded-[9px] border-line-1 bg-surface text-rose hover:border-rose-bord hover:bg-rose-soft"
    >
      {pending ? "Deleting…" : "Delete workshop"}
    </Button>
  );
}

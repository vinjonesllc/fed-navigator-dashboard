"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reuploadChat, reuploadQA } from "../../../../upload/actions";

type Kind = "chat" | "qa";

export function ReuploadButton({
  workshopId,
  kind,
  label,
}: {
  workshopId: string;
  kind: Kind;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm(`Replace existing ${kind === "chat" ? "chat" : "Q&A"} for this workshop with "${file.name}"?`)) {
      e.target.value = "";
      return;
    }
    const fd = new FormData();
    fd.set("workshopId", workshopId);
    fd.set("file", file);

    const action = kind === "chat" ? reuploadChat : reuploadQA;
    const tid = toast.loading(`Uploading ${kind === "chat" ? "chat" : "Q&A"}…`);

    startTransition(async () => {
      try {
        const r = await action(fd);
        if (kind === "chat") {
          toast.success(`Replaced chat — ${(r as { chatRows: number }).chatRows} rows`, { id: tid });
        } else {
          const qr = r as { qaRows: number; intentInserted: number };
          toast.success(
            `Replaced Q&A — ${qr.qaRows} rows. Intents re-extracted (${qr.intentInserted}).`,
            { id: tid },
          );
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed", { id: tid });
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={onFile}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="rounded-[9px] border-line-1 bg-surface text-ink-2 hover:bg-bg-2 hover:text-ink-1"
      >
        {pending ? "Uploading…" : label}
      </Button>
    </>
  );
}

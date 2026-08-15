"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { revokeShareLink } from "@/app/(admin)/admin/upload/actions";

export function ShareLinkBar({
  workshopId,
  shareToken,
}: {
  workshopId: string;
  shareToken: string | null;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  // Local override so the bar shows the replacement token immediately after a
  // revoke, before the server component re-renders.
  const [token, setToken] = useState(shareToken);

  const path = token ? `/share/workshops/${token}` : null;
  const href =
    path && typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

  async function copyHref() {
    if (!href) return;
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      toast.success("Public link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Copy failed");
    }
  }

  function onRevoke() {
    if (
      !confirm(
        "Revoke this link? Anyone you've already sent it to will get a 404. A new link is generated in its place.",
      )
    ) {
      return;
    }
    const fd = new FormData();
    fd.set("workshopId", workshopId);
    startTransition(async () => {
      try {
        const { token: next } = await revokeShareLink(fd);
        setToken(next);
        setCopied(false);
        toast.success("Link revoked — a new one is ready to copy");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Revoke failed");
      }
    });
  }

  // Only null between deploying this code and applying migration 0027.
  if (!token || !href) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line-1 bg-bg-2 px-3 py-2 text-[12.5px]">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-4">
          Public link
        </span>
        <span className="text-ink-3">
          Unavailable — apply migration 0027_workshop_share_token.sql.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line-1 bg-bg-2 px-3 py-2 text-[12.5px]">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-4">
        Public link
      </span>
      <code className="truncate font-mono text-[11.5px] text-ink-2 dark:text-[oklch(0.85_0.012_260)] sm:max-w-[420px]">
        {href}
      </code>
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copyHref}
          className="h-7 gap-1.5 rounded-[7px] border-line-1 bg-surface px-2.5 text-[12px] text-ink-2 hover:bg-bg-2 hover:text-ink-1"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRevoke}
          disabled={pending}
          className="h-7 gap-1.5 rounded-[7px] border-line-1 bg-surface px-2.5 text-[12px] text-ink-2 hover:border-rose-bord hover:bg-rose-soft hover:text-rose"
        >
          <RotateCcw className="h-3 w-3" />
          {pending ? "Revoking…" : "Revoke"}
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 rounded-[7px] border-line-1 bg-surface px-2.5 text-[12px] text-ink-2 hover:bg-bg-2 hover:text-ink-1"
        >
          <a href={href} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3 w-3" />
            Open
          </a>
        </Button>
      </div>
    </div>
  );
}

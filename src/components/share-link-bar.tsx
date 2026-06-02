"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ShareLinkBar({ workshopId }: { workshopId: string }) {
  const [copied, setCopied] = useState(false);

  // Build the absolute URL using the browser's current origin so it's correct
  // in dev (localhost), preview (vercel.app), and prod (custom domain).
  const [href, setHref] = useState<string>(`/share/workshops/${workshopId}`);
  if (typeof window !== "undefined" && href.startsWith("/")) {
    const absolute = `${window.location.origin}/share/workshops/${workshopId}`;
    if (href !== absolute) setHref(absolute);
  }

  async function copyHref() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      toast.success("Public link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Copy failed");
    }
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

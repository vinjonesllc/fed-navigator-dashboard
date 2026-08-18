"use client";

import { useEffect, useState } from "react";

/**
 * "Updated <date & time>" for the foot of every signed-in page.
 *
 * The server can't know the viewer's timezone, so it passes an ISO instant and
 * this formats it after mount in the viewer's own locale. Rendering the raw
 * date on the server and reformatting on the client would trip a hydration
 * mismatch, so nothing is shown until mounted.
 */
export function UpdatedStamp({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date(iso);
    setLabel(
      d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }),
    );
  }, [iso]);

  return (
    <p className="mt-8 border-t border-line-2 pt-4 text-[11.5px] text-ink-4">
      {label ? `Updated ${label}` : " "}
    </p>
  );
}

"use client";

import { useRouter } from "next/navigation";

/**
 * A table row whose whole area navigates to `href` on click — except clicks on
 * an inner link or button, which keep their own behavior (e.g. an Edit link).
 * Lets server-rendered <td> children stay as-is.
 */
export function ClickableRow({
  href,
  className,
  title,
  children,
}: {
  href: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      className={className}
      title={title}
      onClick={(e) => {
        // Don't hijack clicks on interactive elements inside the row.
        if ((e.target as HTMLElement).closest("a,button,input,label,select")) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}

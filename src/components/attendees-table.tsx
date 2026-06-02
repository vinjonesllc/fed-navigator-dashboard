"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Info } from "lucide-react";
import type { Attendee } from "@/lib/supabase/types";
import { engagementIndex } from "@/lib/workshop-stats";

type SortKey = "name" | "agency" | "time" | "engagement";
type SortDir = "asc" | "desc";

const NAME_OF = (a: Attendee) =>
  `${a.last_name ?? ""} ${a.first_name ?? ""}`.trim().toLowerCase();

const FED_TLDS = [".gov", ".mil", ".fed.us"];
const isGovDomain = (a: Attendee) =>
  !!a.email_domain && FED_TLDS.some((t) => a.email_domain!.endsWith(t));

const initials = (a: Attendee) =>
  [a.first_name?.[0], a.last_name?.[0]].filter(Boolean).join("").toUpperCase() ||
  (a.email?.[0] ?? "?").toUpperCase();

// Stable color per attendee from email hash
const ACCENTS = [
  "oklch(0.55 0.18 142)",
  "oklch(0.45 0.10 220)",
  "oklch(0.55 0.16 60)",
  "oklch(0.50 0.15 320)",
  "oklch(0.55 0.18 22)",
  "oklch(0.50 0.12 180)",
  "oklch(0.50 0.14 280)",
  "oklch(0.55 0.17 110)",
  "oklch(0.55 0.16 40)",
  "oklch(0.45 0.13 240)",
  "oklch(0.55 0.13 160)",
  "oklch(0.50 0.15 300)",
];
const avatarColor = (a: Attendee) => {
  const key = a.email ?? a.id;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
};

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "left",
  hint,
  tooltip,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
  hint?: string;
  tooltip?: string;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={`border-b border-line-1 bg-bg-2 px-4 py-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-4 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${active ? "text-ink-1" : ""} hover:text-ink-1`}
      >
        <span>
          {label}
          {hint && (
            <span className="ml-1 normal-case text-ink-4">{hint}</span>
          )}
        </span>
        {tooltip && (
          <span title={tooltip} className="cursor-help text-ink-4">
            <Info className="h-3 w-3" />
          </span>
        )}
        <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}

const ENGAGEMENT_TOOLTIP =
  "Workshop Engagement Index (0–10): (time in session ÷ scheduled) × 7, +1.5 if chats > 5, +1.5 if questions > 3.";

export function AttendeesTable({
  attendees,
  scheduledMinutes,
}: {
  attendees: Attendee[];
  scheduledMinutes: number | null;
}) {
  const [key, setKey] = useState<SortKey>("engagement");
  const [dir, setDir] = useState<SortDir>("desc");

  const enriched = useMemo(
    () =>
      attendees.map((a) => ({
        a,
        score: engagementIndex(a, scheduledMinutes) ?? -1,
        gov: isGovDomain(a),
      })),
    [attendees, scheduledMinutes],
  );

  const sorted = useMemo(() => {
    const arr = [...enriched];
    arr.sort((x, y) => {
      let cmp = 0;
      switch (key) {
        case "name":
          cmp = NAME_OF(x.a).localeCompare(NAME_OF(y.a));
          break;
        case "agency":
          cmp = (x.a.agency ?? x.a.email_domain ?? "").localeCompare(
            y.a.agency ?? y.a.email_domain ?? "",
          );
          break;
        case "time":
          cmp = (x.a.total_time_minutes ?? 0) - (y.a.total_time_minutes ?? 0);
          break;
        case "engagement":
          cmp = x.score - y.score;
          break;
      }
      return cmp * (dir === "asc" ? 1 : -1);
    });
    return arr;
  }, [enriched, key, dir]);

  function toggle(next: SortKey) {
    if (next === key) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setKey(next);
      setDir(next === "name" || next === "agency" ? "asc" : "desc");
    }
  }

  const shown = sorted.slice(0, 200);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            <SortHeader
              label="Name"
              active={key === "name"}
              dir={dir}
              onClick={() => toggle("name")}
            />
            <SortHeader
              label="Agency"
              active={key === "agency"}
              dir={dir}
              onClick={() => toggle("agency")}
            />
            <SortHeader
              label="Time"
              hint="(min)"
              active={key === "time"}
              dir={dir}
              onClick={() => toggle("time")}
              align="right"
            />
            <SortHeader
              label="Engagement"
              hint="(0–10)"
              tooltip={ENGAGEMENT_TOOLTIP}
              active={key === "engagement"}
              dir={dir}
              onClick={() => toggle("engagement")}
              align="right"
            />
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr>
              <td colSpan={4} className="border-b border-line-2 px-4 py-6 text-center text-ink-3">
                No live attendees yet.
              </td>
            </tr>
          )}
          {shown.map(({ a, score, gov }) => {
            const agencyLabel = a.agency ?? a.email_domain ?? "—";
            return (
              <tr key={a.id} className="hover:bg-bg-2">
                <td className="border-b border-line-2 px-4 py-3 align-middle">
                  <span
                    className="mr-3 inline-grid h-[30px] w-[30px] place-items-center rounded-full align-middle font-display text-[11px] font-semibold text-white"
                    style={{ background: avatarColor(a) }}
                  >
                    {initials(a)}
                  </span>
                  <span className="inline-block align-middle">
                    <span className="block font-medium text-ink-1">
                      {a.first_name} {a.last_name}
                    </span>
                    <span className="mt-px block font-mono text-[11.5px] text-ink-4">
                      {a.email}
                    </span>
                  </span>
                </td>
                <td className="border-b border-line-2 px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] ${
                      gov
                        ? "border-lime-bord bg-lime-soft text-lime"
                        : "border-line-1 bg-bg-2 text-ink-2"
                    }`}
                  >
                    {agencyLabel}
                  </span>
                </td>
                <td className="border-b border-line-2 px-4 py-3 text-right font-mono text-ink-2">
                  {a.total_time_minutes ?? 0}
                  {scheduledMinutes ? (
                    <span className="text-ink-4"> / {scheduledMinutes}</span>
                  ) : null}
                </td>
                <td className="border-b border-line-2 px-4 py-3 text-right">
                  {score >= 0 ? (
                    <span className="inline-flex items-center gap-2.5 font-mono font-semibold text-ink-1">
                      {score.toFixed(1)} <span className="font-normal text-ink-4">/ 10</span>
                      <span
                        className="inline-block h-1 rounded-sm bg-gradient-to-r from-lime to-cyan align-middle"
                        style={{ width: `${score * 9.6}px` }}
                      />
                    </span>
                  ) : (
                    <span className="text-ink-4">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length > 200 && (
        <p className="mt-2 px-4 text-[11.5px] text-ink-3">
          Showing first 200 of {sorted.length}. Export CSV for the full list.
        </p>
      )}
      <p className="mt-2 px-4 py-3 text-[11.5px] text-ink-4">
        <span className="font-medium text-ink-2">Engagement</span> is a 0–10 index: (time ÷
        scheduled) × 7, plus 1.5 if chats &gt; 5, plus 1.5 if questions &gt; 3.
      </p>
    </div>
  );
}

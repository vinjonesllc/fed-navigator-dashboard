"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Row = {
  first: string;
  last: string;
  email: string;
  phone: string;
  registered: string;
  registeredTs: number | null;
};

type Payload = {
  rows: Row[];
  count: number;
  tab: string;
  dateLabel: string;
  missing: SortKey[];
};

type SortKey = "first" | "last" | "email" | "phone" | "registered";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "first", label: "First name" },
  { key: "last", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "registered", label: "Date registered" },
];

/**
 * Reads survive the modal closing, so flipping between "view" and the CSV
 * download — or reopening to re-sort — doesn't re-hit the sheet. Module scope
 * means a full page load refetches, which is the right staleness window for a
 * sheet someone may be editing.
 */
const CACHE = new Map<string, Payload>();

const TH =
  "sticky top-0 z-10 border-b border-line-1 bg-bg-2 px-3 py-2 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-4 whitespace-nowrap";
const TD = "border-b border-line-2 px-3 py-2 align-top text-ink-2";

function SortHeader({
  label,
  active,
  dir,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={TH} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`inline-flex items-center gap-1 ${active ? "text-ink-1" : ""} ${
          disabled ? "cursor-default opacity-60" : "hover:text-ink-1"
        }`}
      >
        <span>{label}</span>
        {!disabled && <Icon className="h-3 w-3" />}
      </button>
    </th>
  );
}

/** Empty cells sort last in both directions — a blank is "unknown", not "first". */
function compare(a: Row, b: Row, key: SortKey, dir: SortDir): number {
  const flip = dir === "asc" ? 1 : -1;
  if (key === "registered") {
    const x = a.registeredTs;
    const y = b.registeredTs;
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x - y) * flip;
  }
  const x = a[key].trim().toLowerCase();
  const y = b[key].trim().toLowerCase();
  if (!x && !y) return 0;
  if (!x) return 1;
  if (!y) return -1;
  return x.localeCompare(y) * flip;
}

function RegistrationsDialog({ href, dateLabel, onClose }: { href: string; dateLabel: string; onClose: () => void }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "done"; data: Payload } | { status: "error"; message: string }
  >(() => {
    const hit = CACHE.get(href);
    return hit ? { status: "done", data: hit } : { status: "loading" };
  });
  // null = "whatever this sheet's default is" (below). Set once the reader
  // picks a column, so the default can't fight an explicit choice.
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  useEffect(() => {
    // A cached read is already in state from the initializer above.
    if (CACHE.has(href)) return;
    let cancelled = false;
    fetch(href)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) {
          if (!cancelled) setState({ status: "error", message: body?.error ?? "Failed to load" });
          return;
        }
        // Only successful reads are cached, so a transient failure retries.
        CACHE.set(href, body as Payload);
        if (!cancelled) setState({ status: "done", data: body as Payload });
      })
      .catch((e) => {
        if (!cancelled) setState({ status: "error", message: e?.message ?? "Failed to load" });
      });
    return () => {
      cancelled = true;
    };
  }, [href]);

  const data = state.status === "done" ? state.data : null;
  const missing = useMemo(() => new Set(data?.missing ?? []), [data]);

  // Newest registrations first — unless the sheet has no date column, in which
  // case fall back to last name A→Z rather than sorting by nothing.
  const { key, dir } = sort ??
    (missing.has("registered")
      ? { key: "last" as SortKey, dir: "asc" as SortDir }
      : { key: "registered" as SortKey, dir: "desc" as SortDir });

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data.rows].sort((a, b) => compare(a, b, key, dir));
  }, [data, key, dir]);

  const toggle = (k: SortKey) =>
    setSort(
      k === key
        ? { key: k, dir: dir === "asc" ? "desc" : "asc" }
        : // Dates read newest-first by default; names and emails read A→Z.
          { key: k, dir: k === "registered" ? "desc" : "asc" },
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Registrations — {data?.dateLabel ?? dateLabel}</DialogTitle>
          <DialogDescription>
            {state.status === "loading" && "Reading the registration sheet…"}
            {state.status === "error" && state.message}
            {data &&
              `${data.count.toLocaleString()} registrant${data.count === 1 ? "" : "s"} · live from “${data.tab}” · select a column to sort`}
          </DialogDescription>
        </DialogHeader>

        {data && (
          <div className="-mx-1 min-h-0 flex-1 overflow-auto rounded-[10px] border border-line-1">
            <table className="w-full min-w-[720px] border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <SortHeader
                      key={c.key}
                      label={c.label}
                      active={key === c.key}
                      dir={dir}
                      disabled={missing.has(c.key)}
                      onClick={() => toggle(c.key)}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-3 py-6 text-center text-ink-3">
                      No registrations in this sheet yet.
                    </td>
                  </tr>
                )}
                {sorted.map((r, i) => (
                  <tr key={`${r.email}-${i}`} className="transition-colors hover:bg-bg-2">
                    <td className={`${TD} whitespace-nowrap font-medium text-ink-1`}>{r.first || "—"}</td>
                    <td className={`${TD} whitespace-nowrap font-medium text-ink-1`}>{r.last || "—"}</td>
                    <td className={`${TD} whitespace-nowrap font-mono text-[12px]`}>
                      {r.email ? (
                        <a href={`mailto:${r.email}`} className="hover:text-ink-1 hover:underline">
                          {r.email}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap font-mono text-[12px]`}>{r.phone || "—"}</td>
                    <td className={`${TD} whitespace-nowrap font-mono text-[12px]`}>{r.registered || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && missing.size > 0 && (
          <p className="text-[11.5px] text-ink-3">
            Not in this sheet:{" "}
            {COLUMNS.filter((c) => missing.has(c.key))
              .map((c) => c.label.toLowerCase())
              .join(", ")}
            .
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * "View registrations" button + its modal. Sits above the CSV download on each
 * Next Workshop tile so the list can be checked without a spreadsheet detour.
 */
export function ViewRegistrationsButton({
  href,
  dateLabel,
  className,
}: {
  href: string;
  dateLabel: string;
  /** Supplied by the caller so this matches the tile's other button exactly. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <Users className="h-3.5 w-3.5" aria-hidden />
        View registrations
      </button>
      {open && (
        <RegistrationsDialog href={href} dateLabel={dateLabel} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

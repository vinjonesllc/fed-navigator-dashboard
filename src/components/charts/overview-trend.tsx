"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatWorkshopDate } from "@/lib/format-date";

type Point = { date: string; title: string; attendees: number; engagement: number };

// Short axis label "May 20" — full "May 20, 2026" in tooltip.
function shortDate(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return date;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)}`;
}

export function OverviewTrend({ data }: { data: Point[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            stroke="var(--ink-3)"
            fontSize={11}
            tick={{ fontFamily: "var(--font-mono)" }}
          />
          <YAxis
            stroke="var(--ink-3)"
            fontSize={11}
            tick={{ fontFamily: "var(--font-mono)" }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              color: "var(--ink-1)",
              border: "1px solid var(--line-1)",
              borderRadius: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
            labelFormatter={(value) => formatWorkshopDate(String(value))}
          />
          <Line
            type="monotone"
            dataKey="attendees"
            name="Live attendees"
            stroke="oklch(0.62 0.18 142)"
            strokeWidth={2}
            dot={{ r: 4, fill: "oklch(0.62 0.18 142)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

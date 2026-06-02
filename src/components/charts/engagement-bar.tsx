"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = [
  "oklch(0.62 0.18 142)", // lime
  "oklch(0.55 0.13 230)", // cyan
  "oklch(0.66 0.17 60)", // amber
];

export function EngagementBar({ data }: { data: { label: string; value: number }[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" />
          <XAxis
            dataKey="label"
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
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

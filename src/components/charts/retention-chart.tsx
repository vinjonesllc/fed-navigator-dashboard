"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function RetentionChart({ data }: { data: { minute: number; attendees: number }[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="retGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.62 0.18 142)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="oklch(0.62 0.18 142)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" />
          <XAxis
            dataKey="minute"
            tickFormatter={(v: number) => `${v}m`}
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
          <Area
            type="monotone"
            dataKey="attendees"
            stroke="oklch(0.62 0.18 142)"
            strokeWidth={1.75}
            fill="url(#retGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client"

import { XAxis, YAxis, CartesianGrid, ResponsiveContainer, Area, AreaChart, Tooltip } from "recharts"

/** One scene's pacing datum, mirroring lib/analytics.ts pacingData. */
export interface PacingDatum {
  scene: number
  words: number
  name: string
}

/**
 * Scene word-count area chart. Split into its own module so recharts (a heavy
 * dependency) is only pulled into the bundle when the pacing page mounts it via
 * next/dynamic, rather than eagerly on every route.
 */
export default function PacingChart({ data }: { data: PacingDatum[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="scene"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            label={{ value: "Scene", position: "insideBottom", offset: -2, fontSize: 11 }}
          />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ fontSize: 12 }}
            formatter={(val: number) => [`${val}%`, "Relative density"]}
            labelFormatter={(label) => {
              const d = data[Number(label) - 1]
              return d ? `Scene ${label}: ${d.name}` : `Scene ${label}`
            }}
          />
          <Area
            type="monotone"
            dataKey="words"
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary) / 0.2)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

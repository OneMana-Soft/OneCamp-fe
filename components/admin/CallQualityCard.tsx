"use client"

// How the workspace's calls went over the last 30 days (calls A5, #56): what
// each person's own app saw of their connection, rolled up a day at a time on
// this server (business/CallQuality). Zoom shows its quality dashboard on its
// own cloud; here the numbers are the workspace's, kept where it runs.

import type { ReactNode } from "react"
import { SettingsCard, SettingsSection } from "@/components/ui/settingsSection"
import { NEUTRAL_TILE } from "@/components/admin/neutralTile"
import { Video } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { percent } from "@/lib/goalPercent"

/** One rolled-up day, as the server answers it. */
type QualityDay = {
  day: string
  calls: number
  people: number
  samples: number
  rtt_p50_ms: number
  network_share: number
  cpu_share: number
  freeze_share: number
}

/** The days as one: counts summed, shares and round trip weighed by each day's samples. Pure. */
export function summarizeDays(days: readonly QualityDay[]) {
  const samples = days.reduce((n, d) => n + d.samples, 0)
  if (samples === 0) return null
  const weigh = (pick: (d: QualityDay) => number) => days.reduce((n, d) => n + pick(d) * d.samples, 0) / samples
  const round = (x: number) => Math.round(x * 10_000) / 10_000
  return {
    calls: days.reduce((n, d) => n + d.calls, 0),
    people: days.reduce((n, d) => n + d.people, 0),
    samples,
    rttMs: Math.round(weigh((d) => d.rtt_p50_ms)),
    network: round(weigh((d) => d.network_share)),
    cpu: round(weigh((d) => d.cpu_share)),
    freeze: round(weigh((d) => d.freeze_share)),
  }
}

/** A figure above its name, so the figures sit on one line however the names wrap. */
function StatTile({ label, value, note, className }: { label: string; value: string; note?: string; className?: string }) {
  return (
    <div data-stat-tile="" className={cn("flex min-w-0 flex-col gap-0.5 rounded-[10px] bg-sunken px-3 py-2.5", className)}>
      <span data-stat-value="" className="text-title-3 font-semibold text-foreground">
        {value}
      </span>
      <span className="text-meta text-ink-3">{label}</span>
      {note ? <span className="text-meta text-ink-3">{note}</span> : null}
    </div>
  )
}

export default function CallQualityCard() {
  const { data, isError } = useFetch<{ data?: QualityDay[] }>("/calls/quality/days?days=30", undefined, undefined, OWN_ERRORS)
  const sum = summarizeDays(data?.data ?? [])
  let body: ReactNode
  if (isError) {
    body = <p className="px-4 py-3 text-ui-sm text-ink-2">This server couldn&apos;t read its calls just now. Try again in a moment.</p>
  } else if (!data) {
    body = <div className="m-3 h-[68px] animate-pulse rounded-[10px] bg-sunken motion-reduce:animate-none" aria-hidden />
  } else if (!sum) {
    body = (
      <div className="flex items-center gap-3 px-4 py-3">
        <span aria-hidden="true" className={NEUTRAL_TILE}>
          <Video className="size-4" />
        </span>
        <p className="text-ui-sm text-ink-2">No calls in the last 30 days. Once people call, how each call went shows here.</p>
      </div>
    )
  } else {
    body = (
      // The card brings no padding of its own (its rows do): the tiles keep 12px from its edge.
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-5">
        {/* Calls take the phone's first row whole, so the four shares make a 2×2 under it. */}
        <StatTile label="Calls" value={sum.calls.toLocaleString()} note={`${sum.people.toLocaleString()} people`} className="col-span-2 sm:col-span-1" />
        <StatTile label="Typical round trip" value={`${sum.rttMs} ms`} />
        <StatTile label="Held back by the network" value={percent(sum.network)} />
        <StatTile label="Held back by a computer" value={percent(sum.cpu)} />
        <StatTile label="Video froze" value={percent(sum.freeze)} />
      </div>
    )
  }
  return (
    <SettingsSection
      id="health-calls"
      title="Call quality"
      description="The last 30 days of this workspace's calls, as each person's own app saw its connection. Kept on this server; whoever runs a call sees why it stuttered for each person."
    >
      <SettingsCard>{body}</SettingsCard>
    </SettingsSection>
  )
}

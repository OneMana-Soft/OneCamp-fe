"use client"

// A resource's last 28 days in its "Viewed by" (docs C6-3): how many members
// opened it and how often, its published page's visitors apart, and its
// newest changes from the record. A page's visitors are counted per day,
// under a key that changes daily, so one person on two days is two; the strip
// says so rather than call them people. One read serves the strip above the
// list and the changes after it (useViewInsights). A read that fails says so
// in one line, with Try again (N46).

import * as React from "react"
import Link from "next/link"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { Sparkline } from "@/components/ui/graphics/Sparkline"
import { useRelativeTime } from "@/hooks/useRelativeTime"
import type { CampHue } from "@/lib/campHue"

export type InsightDay = { day: string; member_views: number; members: number; page_views: number; visitors: number }
export type InsightEvent = { action: string; summary: string; actor_kind?: string; actor?: string; at: string }
export type Insights = {
  from: string
  days: InsightDay[]
  members: number
  member_views: number
  page_views: number
  visitor_days: number
  events?: InsightEvent[]
}

export type InsightsLoad = { state: "loading" } | { state: "ready"; insights: Insights } | { state: "failed"; retry(): void }

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`

const QUIET_LINK = "rounded-sm text-xs font-[510] text-ink-2 underline decoration-line-3 underline-offset-2 hover:text-ink hover:decoration-current focus-visible:focus-halo"

/**
 * The resource's insights, read while the dialog is open (an opening again
 * shows the last answer while it reads anew), and again on Try again; nothing
 * without an endpoint. The strip says a failure itself.
 */
export function useViewInsights(endpoint: string | undefined, idParam: string, resourceId: string, open: boolean): InsightsLoad | null {
  const key = endpoint && open && resourceId ? `${endpoint}?${idParam}=${encodeURIComponent(resourceId)}` : ""
  const { data, isError, mutate } = useFetch<{ data?: Insights }>(key, undefined, undefined, OWN_ERRORS)
  if (!endpoint) return null
  if (data?.data) return { state: "ready", insights: data.data }
  if (isError) return { state: "failed", retry: () => void mutate() }
  return { state: "loading" }
}

/**
 * The last 28 days, named above its figures (the list under it is everyone,
 * ever): members, page visitors apart, the daily sparkline in the resource's
 * area hue, and where to stop your own views being recorded.
 */
export function InsightsStrip({ load, hue }: { load: InsightsLoad; hue?: CampHue }) {
  const windowId = React.useId()
  if (load.state === "loading") return <div data-view-insights="loading" className="h-[76px] animate-pulse rounded-lg bg-sunken" />
  if (load.state === "failed" || !load.insights?.days) {
    return (
      <p data-view-insights="failed" className="text-xs text-ink-3">
        Couldn&apos;t load the last 28 days. The list below is still right.{" "}
        {load.state === "failed" ? (
          <button type="button" onClick={load.retry} className={QUIET_LINK}>
            Try again
          </button>
        ) : null}
      </p>
    )
  }
  const i = load.insights
  const daily = i.days.map((d) => d.member_views + d.page_views)
  return (
    <section data-view-insights="" aria-labelledby={windowId} className="rounded-lg bg-sunken px-4 py-3">
      <h3 id={windowId} className="mb-2 text-xs font-[510] text-ink-2">
        Last 28 days
      </h3>
      <div className="flex items-start justify-between gap-4">
        <dl className="flex min-w-0 flex-wrap gap-x-6 gap-y-2">
          <div>
            <dt className="text-xs text-ink-2">Members</dt>
            <dd className="text-title-3 font-semibold tabular-nums text-foreground">{i.members.toLocaleString()}</dd>
            <dd className="text-xs text-ink-3">{plural(i.member_views, "view", "views")}</dd>
          </div>
          {i.page_views > 0 && (
            <div>
              <dt className="text-xs text-ink-2">Page visitors</dt>
              <dd className="text-title-3 font-semibold tabular-nums text-foreground">{i.visitor_days.toLocaleString()}</dd>
              <dd className="text-xs text-ink-3">{plural(i.page_views, "view", "views")}</dd>
            </div>
          )}
        </dl>
        <Sparkline values={daily} color={hue ? `var(--camp-${hue})` : undefined} className="mt-1 block h-8 w-28 shrink-0 overflow-visible" />
      </div>
      {i.page_views > 0 && <p className="mt-2 text-xs text-ink-3">Page visitors are counted per day, without keeping who they are.</p>}
      <Link href="/app/settings/notifications#notifications-doc-views" className={`mt-1 inline-block ${QUIET_LINK}`}>
        Change whether your views are recorded
      </Link>
    </section>
  )
}

/** The resource's newest changes from the record, after its viewers; nothing when there are none. */
export function RecentChanges({ load }: { load: InsightsLoad | null }) {
  const events = load?.state === "ready" ? (load.insights.events ?? []) : []
  if (events.length === 0) return null
  return (
    <section data-recent-changes="" aria-label="Recent changes" className="mt-3 border-t border-line pt-3">
      <h3 className="px-2 pb-1 text-xs font-[510] text-ink-2">Recent changes</h3>
      <ul className="flex flex-col">
        {events.map((e, n) => (
          <ChangeRow key={`${e.at}-${n}`} event={e} />
        ))}
      </ul>
    </section>
  )
}

function ChangeRow({ event }: { event: InsightEvent }) {
  const when = useRelativeTime(event.at)
  const who = event.actor_kind === "system" ? "OneCamp" : event.actor_kind === "agent" ? `An agent for ${event.actor || "someone"}` : event.actor || "Someone"
  return (
    <li className="flex flex-col gap-0.5 rounded-md px-2 py-1.5">
      <span className="text-sm text-foreground">{event.summary}</span>
      <span className="text-xs text-ink-3">
        {who} · {when || "just now"}
      </span>
    </li>
  )
}

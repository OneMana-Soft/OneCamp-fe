"use client"

import Link from "next/link"
import { Fragment, type ReactNode } from "react"
import { format } from "date-fns"
import { CountTick } from "@/components/ui/CountTick"
import { cn } from "@/lib/utils/helpers/cn"
import { clockTime } from "@/lib/utils/date/clock"
import { classifyEvent, eventTitleOf } from "@/components/home/homeTime"
import type { NeedsShown } from "@/components/home/needsGone"

/**
 * Home's summary sentence (hub.md H4): what needs you, then what's next.
 *
 *   "1 task due today · 1 mention waiting · 1 agent request · Next: Launch sync at 11:00"
 *   "Nothing needs you. Next up: Launch sync at 11:00."
 *   "Nothing needs you. Now: Design review, until 3:30 PM."
 *   "Nothing needs you today."
 *
 * It says what the list below shows (glanceOf) and claims only what it knows:
 * a meeting on is "Now", until its end; with the list's read failed, or rows
 * there it doesn't name (a DM), it says only what's next, or nothing.
 * Counts link to their rows; overdue is in danger ink; zeros are left out.
 */
export interface GlanceCounts {
  tasksDue: number
  overdue: number
  mentions: number
  agentRequests: number
}

export interface GlanceNext {
  title: string
  /** "11:00": its start, or its end while it is on. */
  time: string
  href?: string
  /** It has started: said as "Now: …, until" its end. */
  running?: boolean
}

/**
 * Today's next meeting for the sentence: its start, or its end while it is on,
 * and its title as Home says it (eventTitleOf). Pure.
 */
export function glanceNext(
  event: { event_title?: string; event_is_focus?: boolean; event_start_time: string; event_end_time: string } | null | undefined,
  now: Date,
  { clock = clockTime, href }: { clock?: (iso: string) => string; href?: string } = {},
): GlanceNext | null {
  if (!event) return null
  const running = classifyEvent(event, now) === "current"
  return { title: eventTitleOf(event), time: clock(running ? event.event_end_time : event.event_start_time), ...(href ? { href } : {}), running }
}

/** The next meeting's clause: "Now: X, until 3:30 PM", or "Next up: X at 11:00" ("Next:" after counts). */
const nextClause = (n: GlanceNext, alone: boolean) => (n.running ? `Now: ${n.title}, until ${n.time}` : `${alone ? "Next up" : "Next"}: ${n.title} at ${n.time}`)

export type GlancePart =
  | { kind: "tasks"; count: number; overdue: number }
  | { kind: "mentions"; count: number }
  | { kind: "agent"; count: number }

/** The needs-me clauses in the sentence's order. Pure. */
export function glanceParts(c: GlanceCounts): GlancePart[] {
  const parts: GlancePart[] = []
  if (c.tasksDue > 0 || c.overdue > 0) parts.push({ kind: "tasks", count: c.tasksDue, overdue: c.overdue })
  if (c.mentions > 0) parts.push({ kind: "mentions", count: c.mentions })
  if (c.agentRequests > 0) parts.push({ kind: "agent", count: c.agentRequests })
  return parts
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** The sentence as plain text. `failed`: the list's read failed; `unnamed`: its rows this doesn't name. Pure. */
export function glanceText(c: GlanceCounts, next?: GlanceNext | null, failed = false, unnamed = 0): string {
  const parts = glanceParts(c)
  if (failed || (parts.length === 0 && unnamed > 0)) return next ? `${nextClause(next, true)}.` : ""
  if (parts.length === 0) return next ? `Nothing needs you. ${nextClause(next, true)}.` : "Nothing needs you today."
  const said = parts.map((p) => {
    if (p.kind === "tasks") {
      if (p.count === 0) return `${p.overdue} ${plural(p.overdue, "task", "tasks")} overdue`
      return `${p.count} ${plural(p.count, "task", "tasks")} due today${p.overdue ? `, ${p.overdue} overdue` : ""}`
    }
    if (p.kind === "mentions") return `${p.count} ${plural(p.count, "mention", "mentions")} waiting`
    return `${p.count} ${plural(p.count, "agent request", "agent requests")}`
  })
  return [...said, ...(next ? [nextClause(next, false)] : [])].join(" · ")
}

export interface Glance {
  loading: boolean
  failed: boolean
  counts: GlanceCounts
  /** The list's rows the sentence doesn't name: DMs, the AI's questions, emails. */
  unnamed: number
}

/** The line from what the list shows (needsGone): it waits while the list does, and counts its rows. Pure. */
export function glanceOf(shown: NeedsShown | null): Glance {
  const counts: GlanceCounts = { tasksDue: 0, overdue: 0, mentions: 0, agentRequests: 0 }
  if (!shown) return { loading: true, failed: false, counts, unnamed: 0 }
  let unnamed = 0
  for (const i of shown.items) {
    if (i.kind === "due") {
      if (i.overdue) counts.overdue++
      else counts.tasksDue++
    } else if (i.kind === "agent") counts.agentRequests++
    else if (i.kind === "reply" && i.id.startsWith("mention:")) counts.mentions++
    else unnamed++
  }
  return { loading: shown.loading, failed: shown.failed, counts, unnamed }
}

const LINK = "rounded-sm font-medium text-foreground underline-offset-[3px] decoration-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"

function Count({ n, href, children }: { n: number; href: string; children: string }) {
  return (
    <Link href={href} scroll={false} className={LINK}>
      <CountTick value={n} /> {children}
    </Link>
  )
}

export function GlanceLine({
  counts,
  next,
  loading = false,
  failed = false,
  unnamed = 0,
  stacked = false,
  className,
}: {
  counts: GlanceCounts
  next?: GlanceNext | null
  loading?: boolean
  /** What needs you couldn't be read: say only what's next, or nothing. */
  failed?: boolean
  /** The list's rows this doesn't name: never "Nothing needs you" over them. */
  unnamed?: number
  /** On a phone: one clause per line, with no separators to end a line on (DESIGN-BUILD-11's SF2). */
  stacked?: boolean
  className?: string
}) {
  if (loading) {
    return (
      <p className={cn("text-body", className)} role="status" aria-label="Counting what needs you">
        <span aria-hidden="true" className="inline-block h-3.5 w-72 max-w-full rounded-sm bg-press align-middle animate-shimmer" />
      </p>
    )
  }
  const parts = glanceParts(counts)
  const nextLink = next ? (
    next.href ? (
      <Link href={next.href} className={LINK}>
        {next.time}
      </Link>
    ) : (
      <span className="font-medium text-foreground">{next.time}</span>
    )
  ) : null
  // The next meeting's clause, its time a link: "Now: X, until 3:30 PM" or "Next up: X at 11:00".
  // A title with no spaces (a pasted link) breaks anywhere, or it runs past a phone's edge.
  const title = next ? <span className="[overflow-wrap:anywhere]">{next.title}</span> : null
  const clause = (alone: boolean) =>
    next ? (
      next.running ? (
        <>
          Now: {title}, until {nextLink}
        </>
      ) : (
        <>
          {alone ? "Next up" : "Next"}: {title} at {nextLink}
        </>
      )
    ) : null
  if (failed || (parts.length === 0 && unnamed > 0)) {
    if (!next) return null
    return (
      <p className={cn("text-body text-ink-2 [text-wrap:pretty]", className)} data-glance="">
        {clause(true)}.
      </p>
    )
  }
  if (parts.length === 0) {
    return (
      <p className={cn("text-body text-ink-2 [text-wrap:pretty]", className)} data-glance="">
        {!next ? (
          "Nothing needs you today."
        ) : stacked ? (
          <>
            <span data-fact="" className="block">Nothing needs you.</span>
            <span className="sr-only"> </span>
            <span data-fact="" className="block">{clause(true)}.</span>
          </>
        ) : (
          <>Nothing needs you. {clause(true)}.</>
        )}
      </p>
    )
  }
  // Each fact whole, its separator with it: a line breaks only between facts
  // and never starts with "·" (at 390, "· 1" ended a line and "mention
  // waiting" began the next). The next event's title may wrap.
  const facts: { node: ReactNode; then: "," | " ·" | "" }[] = []
  for (const p of parts) {
    if (p.kind === "tasks" && p.count > 0) {
      facts.push({ node: <><Count n={p.count} href="#needs-due">{plural(p.count, "task", "tasks")}</Count> due today</>, then: p.overdue > 0 ? "," : " ·" })
      if (p.overdue > 0) facts.push({ node: <Link href="#needs-due" className={cn(LINK, "text-danger-ink")}>{p.overdue} overdue</Link>, then: " ·" })
    } else if (p.kind === "tasks") {
      facts.push({
        node: (
          <>
            <Link href="#needs-due" className={cn(LINK, "text-danger-ink")}>
              {p.overdue} {plural(p.overdue, "task", "tasks")}
            </Link>{" "}
            overdue
          </>
        ),
        then: " ·",
      })
    } else if (p.kind === "mentions") {
      facts.push({ node: <><Count n={p.count} href="#needs-reply">{plural(p.count, "mention", "mentions")}</Count> waiting</>, then: " ·" })
    } else {
      facts.push({ node: <Count n={p.count} href="#needs-agent">{plural(p.count, "agent request", "agent requests")}</Count>, then: " ·" })
    }
  }
  if (!next && facts.length) facts[facts.length - 1].then = ""
  return (
    <p className={cn("text-body text-ink-2 [text-wrap:pretty]", className)} data-glance="">
      {facts.map((f, i) => (
        <Fragment key={i}>
          <span data-fact="" className={stacked ? "block" : "whitespace-nowrap"}>
            {f.node}
            {stacked ? null : f.then === "," ? "," : f.then ? <span className="text-ink-4"> ·</span> : null}
          </span>
          {/* Stacked, a screen reader reading it all and a copy of it still hear where a clause ends (CR-31). */}
          {i < facts.length - 1 || next ? stacked ? <span className="sr-only">, </span> : " " : null}
        </Fragment>
      ))}
      {next ? <span data-fact="" className={stacked ? "block" : undefined}>{clause(false)}</span> : null}
    </p>
  )
}

/** Today as a quiet eyebrow above a page title: "Sunday 27 September", day before month as everywhere. */
export function todayEyebrow(d: Date = new Date()): string {
  return format(d, "EEEE d MMMM")
}

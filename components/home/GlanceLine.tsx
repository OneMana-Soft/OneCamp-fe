"use client"

import Link from "next/link"
import { format } from "date-fns"
import { CountTick } from "@/components/ui/CountTick"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * Home's summary sentence (hub.md H4): what needs you, then what's next.
 *
 *   "1 task due today · 1 mention waiting · 1 agent request · Next: Launch sync at 11:00"
 *   "Nothing needs you. Next up: Launch sync at 11:00."
 *   "Nothing needs you today."
 *
 * Unread channels and DMs are not here: the sidebar counts them. Counts and
 * the time are ink at 510, each a link to its rows; overdue is said in danger
 * ink. Live counts roll (CountTick). Zeros are left out.
 */
export interface GlanceCounts {
  tasksDue: number
  overdue: number
  mentions: number
  agentRequests: number
}

export interface GlanceNext {
  title: string
  /** "11:00". */
  time: string
  href?: string
}

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

/** The whole sentence as plain text, for tests and assistive tech. Pure. */
export function glanceText(c: GlanceCounts, next?: GlanceNext | null): string {
  const parts = glanceParts(c)
  if (parts.length === 0) return next ? `Nothing needs you. Next up: ${next.title} at ${next.time}.` : "Nothing needs you today."
  const said = parts.map((p) => {
    if (p.kind === "tasks") {
      if (p.count === 0) return `${p.overdue} ${plural(p.overdue, "task", "tasks")} overdue`
      return `${p.count} ${plural(p.count, "task", "tasks")} due today${p.overdue ? `, ${p.overdue} overdue` : ""}`
    }
    if (p.kind === "mentions") return `${p.count} ${plural(p.count, "mention", "mentions")} waiting`
    return `${p.count} ${plural(p.count, "agent request", "agent requests")}`
  })
  return [...said, ...(next ? [`Next: ${next.title} at ${next.time}`] : [])].join(" · ")
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
  className,
}: {
  counts: GlanceCounts
  next?: GlanceNext | null
  loading?: boolean
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
  const sep = <span className="text-ink-4"> · </span>
  const nextLink = next ? (
    next.href ? (
      <Link href={next.href} className={LINK}>
        {next.time}
      </Link>
    ) : (
      <span className="font-medium text-foreground">{next.time}</span>
    )
  ) : null
  if (parts.length === 0) {
    return (
      <p className={cn("text-body text-ink-2 [text-wrap:pretty]", className)} data-glance="">
        {next ? (
          <>
            Nothing needs you. Next up: {next.title} at {nextLink}.
          </>
        ) : (
          "Nothing needs you today."
        )}
      </p>
    )
  }
  return (
    <p className={cn("text-body text-ink-2 [text-wrap:pretty]", className)} data-glance="">
      {parts.map((p, i) => (
        <span key={p.kind}>
          {i > 0 ? sep : null}
          {p.kind === "tasks" ? (
            p.count > 0 ? (
              <>
                <Count n={p.count} href="#needs-due">{plural(p.count, "task", "tasks")}</Count> due today
                {p.overdue > 0 ? (
                  <>
                    ,{" "}
                    <Link href="#needs-due" className={cn(LINK, "text-danger-ink")}>
                      {p.overdue} overdue
                    </Link>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <Link href="#needs-due" className={cn(LINK, "text-danger-ink")}>
                  {p.overdue} {plural(p.overdue, "task", "tasks")}
                </Link>{" "}
                overdue
              </>
            )
          ) : p.kind === "mentions" ? (
            <>
              <Count n={p.count} href="#needs-reply">{plural(p.count, "mention", "mentions")}</Count> waiting
            </>
          ) : (
            <Count n={p.count} href="#needs-agent">{plural(p.count, "agent request", "agent requests")}</Count>
          )}
        </span>
      ))}
      {next ? (
        <>
          {sep}Next: {next.title} at {nextLink}
        </>
      ) : null}
    </p>
  )
}

/** Today as a quiet eyebrow above a page title: "Sunday 27 September", day before month as everywhere. */
export function todayEyebrow(d: Date = new Date()): string {
  return format(d, "EEEE d MMMM")
}

/**
 * Whether Home's counts are real yet. They come from the sidebar in the store,
 * which is seeded from the sidenav answer a render after it arrives: until the
 * answer is here, and in that one render, every count reads 0. Pure.
 */
export function glanceLoading(
  answer: { user_channels?: unknown[] | null; user_dms?: unknown[] | null } | null | undefined,
  inStore: { userChannels?: unknown[] | null; userChats?: unknown[] | null },
): boolean {
  if (!answer) return true
  const answerHas = (answer.user_channels?.length ?? 0) + (answer.user_dms?.length ?? 0) > 0
  const storeHas = (inStore.userChannels?.length ?? 0) + (inStore.userChats?.length ?? 0) > 0
  return answerHas && !storeHas
}

"use client"

import Link from "next/link"
import { cn } from "@/lib/utils/helpers/cn"
import { format } from "date-fns"

export interface GlanceItem {
  count: number
  /** Singular and plural, so the line reads as a sentence. */
  one: string
  many: string
  href: string
  /** A qualifier that deserves attention, such as "1 overdue". */
  flag?: string
}

/**
 * The state of your workspace in one line of type: "3 unread channels · 2
 * notifications · 3 open tasks, 1 overdue". It replaced four identical tiles,
 * each with a coloured icon chip and a number that was usually 0, which gave
 * the most-seen screen the most generic shape on the web. Zeros are left out;
 * when everything is zero it says so.
 */
export function GlanceLine({ items, className }: { items: GlanceItem[]; className?: string }) {
  const live = items.filter((i) => i.count > 0)
  if (live.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>All caught up.</p>
  }
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {live.map((i, n) => (
        <span key={i.href + i.one}>
          {n > 0 && <span aria-hidden="true"> · </span>}
          <Link
            href={i.href}
            scroll={false}
            className="rounded-sm text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          >
            <span className="tabular-nums font-medium">{i.count}</span> {i.count === 1 ? i.one : i.many}
          </Link>
          {i.flag && <span className="text-destructive">, {i.flag}</span>}
        </span>
      ))}
    </p>
  )
}

/** Today as a quiet eyebrow above a page title: "Sunday 27 September", day before month as everywhere. */
export function todayEyebrow(d: Date = new Date()): string {
  return format(d, "EEEE d MMMM")
}

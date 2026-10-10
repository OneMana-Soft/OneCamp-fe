"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { homeGap, homeGlyph, homeInset } from "@/components/home/homeLines"

/**
 * One row of a Home list: Recent, Your channels, Quick actions, Your teams.
 *
 * Every list on Home had its own row: 48px with a second line for Recent,
 * 40 to 52px for channels depending on whether a channel had a description,
 * 36px for quick actions and 32px for teams. Read down the page, the rhythm
 * changed four times. Now each is one line at one height (36px, 44px where it
 * is touched), the glyph quiet, the name in ink, and anything else (a time, a
 * count) at the right edge, like the task panel's values.
 *
 * Its glyph and its name sit on Home's two lines (homeLines), the lines the
 * cards above use, and its hover is as wide as those cards.
 */
export interface HomeRowProps {
  icon?: ReactNode
  label: ReactNode
  /** At the right edge: a time, a count, a state in words. */
  meta?: ReactNode
  /** Unread or otherwise waiting: the name in weight, not in colour. */
  emphasize?: boolean
  /** Selected (an open panel): the soft accent ground, as in the sidebar. */
  active?: boolean
  href?: string
  onClick?: () => void
  /** 44px rows for a finger. */
  touch?: boolean
  className?: string
  "aria-label"?: string
}

export function HomeRow({ icon, label, meta, emphasize, active, href, onClick, touch, className, ...rest }: HomeRowProps) {
  const classes = cn(
    "group flex w-full min-w-0 items-center rounded-md text-left text-sm",
    homeInset,
    homeGap,
    touch ? "h-11" : "h-9",
    "transition-colors duration-100",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
    active ? "bg-brand-muted" : "hover:bg-highlight active:bg-highlight",
    className,
  )
  const body = (
    <>
      {icon && (
        <span aria-hidden="true" className={cn(homeGlyph, "h-6 items-center text-muted-foreground group-hover:text-foreground")}>
          {icon}
        </span>
      )}
      <span className={cn("min-w-0 flex-1 truncate", emphasize ? "font-semibold text-foreground" : "text-foreground")}>{label}</span>
      {meta !== undefined && meta !== null && meta !== false && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{meta}</span>
      )}
    </>
  )
  if (href) {
    return (
      <Link href={href} scroll={false} onClick={onClick} className={classes} aria-label={rest["aria-label"]}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={classes} aria-label={rest["aria-label"]} aria-pressed={active === undefined ? undefined : active}>
      {body}
    </button>
  )
}

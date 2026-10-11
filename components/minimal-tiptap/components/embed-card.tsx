"use client"

import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { ArrowUpRight } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * One card for every block that embeds something (content.md D23): a
 * table, a poll, a diff, a recording. --raised at e1 (e2 on hover), r12,
 * with a 40 px header: a 20 px type tile in its camp tint, the title at
 * 13/590, the meta at 12 ink-3, and "Open" on the right.
 */
export type EmbedKind = "table" | "chart" | "poll" | "diff" | "recording"

const TILE: Record<EmbedKind, string> = {
  table: "bg-camp-moss-tint text-camp-moss-ink",
  chart: "bg-camp-sun-tint text-camp-sun-ink",
  poll: "bg-camp-berry-tint text-camp-berry-ink",
  diff: "bg-camp-dusk-tint text-camp-dusk-ink",
  recording: "bg-camp-sky-tint text-camp-sky-ink",
}

export function EmbedCard({
  kind,
  icon: Icon,
  tile,
  title,
  meta,
  openHref,
  actions,
  selected,
  className,
  bodyClassName,
  children,
}: {
  kind: EmbedKind
  icon?: LucideIcon
  /** A tile of its own instead of the icon (a table's own glyph). */
  tile?: React.ReactNode
  title: React.ReactNode
  meta?: React.ReactNode
  openHref?: string
  actions?: React.ReactNode
  selected?: boolean
  className?: string
  bodyClassName?: string
  children?: React.ReactNode
}) {
  return (
    <div
      data-embed-card={kind}
      className={cn(
        "overflow-hidden rounded-[12px] bg-raised shadow-e1 transition-shadow duration-[140ms] hover:shadow-e2",
        selected && "ring-2 ring-brand ring-offset-2 ring-offset-sheet",
        className,
      )}
    >
      <div className="flex h-10 items-center gap-2 px-3.5">
        {tile ?? (
          <span className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-md", TILE[kind])} aria-hidden="true">
            {Icon ? <Icon className="size-3" /> : null}
          </span>
        )}
        <span className="min-w-0 truncate text-ui-sm font-semibold text-ink">{title}</span>
        {meta ? <span className="min-w-0 truncate text-meta text-ink-3">{meta}</span> : null}
        <span className="flex-1" />
        {actions}
        {openHref ? (
          <a
            href={openHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-meta font-medium text-ink-2 outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
          >
            Open
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </a>
        ) : null}
      </div>
      {children !== undefined ? <div className={bodyClassName}>{children}</div> : null}
    </div>
  )
}

/** The body of an embed that's gone: a sunken strip and a way to remove it. */
export function EmbedGone({ message, onRemove, removeLabel = "Remove" }: { message: string; onRemove?: () => void; removeLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-sunken px-3.5 py-2.5 text-ui-sm text-ink-2">
      <span>{message}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="h-6 shrink-0 rounded-md px-2 text-meta font-medium text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
        >
          {removeLabel}
        </button>
      ) : null}
    </div>
  )
}

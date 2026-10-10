// The row a link becomes under a message: an icon tile, a title and a line of
// detail. Shared by AgentResultCards (a pull request, a branch) and
// WorkLinkCards (a task, doc or project here), which differ only in where the
// link goes, so the two can never drift into two looks.

import type { ReactNode } from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import type { CampHue } from "@/lib/campHue"

/**
 * The card's outline; put it on the <a>, <Link> or <button> that wraps
 * LinkCardBody. One width for every card under a message (448px, the full
 * width on a phone): a task or doc card was 448px, a pull request the whole
 * column (1,113px at 1440) and a file 370px, three widths stacked under one
 * message.
 */
export const linkCardClass =
  "flex w-full max-w-md min-w-0 items-center gap-2.5 rounded-lg border border-border/70 bg-card/40 px-3 py-2 text-left transition-colors hover:border-border hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"

/** A card's icon tile in a thing's own hue (lib/campHue), as its mark is in the sidebar. */
export function hueTileClass(hue: CampHue): string {
  return `${HUE_CLASS[hue]} bg-hue-tint text-hue`
}

export function LinkCardBody({
  icon,
  iconClassName = "bg-muted text-muted-foreground",
  title,
  detail,
  detailClassName,
  trailing,
}: {
  icon: ReactNode
  iconClassName?: string
  title: ReactNode
  detail?: ReactNode
  detailClassName?: string
  trailing?: ReactNode
}) {
  return (
    <>
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", iconClassName)}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-tight text-foreground">{title}</span>
        {detail ? <span className={cn("block truncate text-2xs leading-tight text-muted-foreground", detailClassName)}>{detail}</span> : null}
      </span>
      {trailing}
    </>
  )
}

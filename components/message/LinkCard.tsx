// The card a link becomes under a message (design v3 chat, C24 and C26): one
// material for every kind, so a task, a doc, a pull request and a file never
// drift into four looks. The raised surface at e1, r12, 12/14 of padding and a
// 12px gap, at most 520px wide (the full width on a phone); a 36px r10 tile in
// the thing's own hue with its strong-cut icon; the title at 14/510 and a meta
// line in ink-3; an up-right arrow to say it opens. Under the pointer it lifts
// a pixel onto e2 (hover-lift: a translate and a fading shadow layer, so the
// whole hover runs on the compositor).

import type { ReactNode } from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { ArrowUpRight } from "@/lib/icons"
import type { CampHue } from "@/lib/campHue"

/** The card's material; put it on the <a>, <Link> or <button> that wraps LinkCardBody. */
export const linkCardClass =
  "hover-lift flex w-full max-w-[520px] min-w-0 items-center gap-3 rounded-xl bg-raised px-3.5 py-3 text-left shadow-e1 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

/** A card's icon tile in a thing's own hue (lib/campHue), as its mark is in the sidebar. */
export function hueTileClass(hue: CampHue): string {
  return `${HUE_CLASS[hue]} bg-hue-tint text-hue`
}

/** A tile for something with no hue of its own (a link elsewhere, an unknown file). */
export const NEUTRAL_TILE = "bg-sunken text-ink-3"

export function LinkCardBody({
  icon,
  iconClassName = NEUTRAL_TILE,
  title,
  lead,
  detail,
  detailClassName,
  trailing,
  footer,
}: {
  icon: ReactNode
  iconClassName?: string
  title: ReactNode
  /** Before the title on its line: a task's status glyph. */
  lead?: ReactNode
  detail?: ReactNode
  detailClassName?: string
  /** What closes the card; the up-right arrow when left out, nothing when null. */
  trailing?: ReactNode
  /** Under the meta line: a checklist's progress. */
  footer?: ReactNode
}) {
  return (
    <>
      <span data-card-tile="" className={cn("flex size-9 shrink-0 items-center justify-center rounded-[10px] [&>svg]:size-[18px]", iconClassName)}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          {lead}
          <span className="block min-w-0 truncate text-ui font-medium text-ink">{title}</span>
        </span>
        {detail ? <span className={cn("block truncate text-meta text-ink-3", detailClassName)}>{detail}</span> : null}
        {footer}
      </span>
      {trailing === undefined ? <ArrowUpRight className="size-4 shrink-0 text-ink-3" aria-hidden="true" /> : trailing}
    </>
  )
}

/**
 * The card while its item loads, at the card's final size: a sunken tile and
 * two bars. It used to render nothing until the data came, and the row jumped
 * when the card appeared under it.
 */
export function LinkCardSkeleton() {
  return (
    <div data-card-skeleton="" role="status" aria-label="Loading the link" className="flex w-full max-w-[520px] min-w-0 items-center gap-3 rounded-xl bg-raised px-3.5 py-3 shadow-e1">
      <span className="size-9 shrink-0 rounded-[10px] bg-sunken" />
      <span className="flex min-w-0 flex-1 flex-col gap-2 py-0.5">
        <span className="h-2.5 w-2/5 rounded-[5px] bg-press motion-safe:animate-shimmer" />
        <span className="h-2.5 w-3/5 rounded-[5px] bg-press motion-safe:animate-shimmer" />
      </span>
    </div>
  )
}

/** A checklist's progress (C26): a 6px bar in the progress fill, and "11 / 12". */
export function CardProgress({ done, total }: { done: number; total: number }) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0
  return (
    <span className="mt-2 flex items-center gap-2.5" data-card-progress="">
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-[3px] bg-press">
        <span className="absolute inset-0 origin-left rounded-[3px] bg-progress" style={{ transform: `scaleX(${ratio})` }} />
      </span>
      <span className="shrink-0 text-meta tabular-nums text-ink-3">{done} / {total}</span>
    </span>
  )
}

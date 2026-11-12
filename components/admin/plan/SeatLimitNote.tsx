"use client"

import { ArrowRight, Users } from "@/lib/icons"
import { Disclosure } from "@/components/ui/disclosure"
import { cn } from "@/lib/utils/helpers/cn"
import { PlanNote } from "./PlanNote"
import type { PlanLinks } from "@/types/plan"
import { seatSummary } from "@/lib/utils/seatSummary"
import { seatNoteDue, seatOverflowLine, seatWords } from "@/lib/people/seatWords"
import { askAdmin, LICENSED_VALUE, removeLimit } from "@/lib/plan/planWords"
import { planHref } from "@/lib/plan/planHref"
import { UPGRADE_STEPS } from "@/lib/plan/upgradeSteps"

interface SeatLimitNoteProps {
  /** An admin is offered the way past the limit; a member is told to ask one. */
  asAdmin: boolean
  /** The plan's limit, from the server (usePlan, or a refusal's); 0 says nothing. */
  limit: number
  /** People on the plan. A member who met the limit doesn't know it: the note then says the plan is full. */
  used?: number
  /** People about to be added (the invite form's chips), so the note says when they won't fit. */
  sending?: number
  /** The ways past the limit, as the server names them. */
  links?: PlanLinks
  /** The caller's own words for the line (the import's "60 people came across…"). */
  line?: string
  /** inline: under a field or in a dialog; card: above a list. */
  variant?: "inline" | "card"
  id?: string
  className?: string
}

/**
 * Where the free plan's limit is met (ADMIN-02): the invite dialogs, an
 * import, a placeholder's profile and Members. One note in place of three
 * lines (one of them red, none leading anywhere): a sun tile, what the plan
 * holds in one line with its meter, why a licence is worth it, and
 * "Remove the 25-person limit" with the server's number. A member is told to
 * ask an admin and is offered nothing to buy. Quiet under 80%, unless the
 * people being added won't fit; the line is a polite live region, so a chip
 * that tips it over is announced. Drawn through ./LimitNote, its one way in,
 * so its code comes only when a screen is at the limit.
 */
export function SeatLimitNote({ asAdmin, limit, used, sending = 0, links, line, variant = "inline", id, className }: SeatLimitNoteProps) {
  if (!limit || limit <= 0) return null
  const known = used != null
  if (known && !line && !seatNoteDue(used, limit, sending)) return null
  const card = variant === "card"
  const text =
    line ||
    (known ? seatOverflowLine(sending, Math.max(0, limit - used)) || seatSummary(used, limit)?.text : "This workspace's free plan is full.")
  const meter = known ? seatWords(used, limit) : null
  const href = asAdmin ? planHref(links) : undefined
  const pricing = asAdmin ? links?.pricing : undefined
  const linkClass = "inline-flex items-center gap-1 underline-offset-[3px] hover:underline pointer-coarse:min-h-11"
  return (
    <PlanNote id={id} data-seat-limit-note={variant} icon={<Users />} compact={!card} className={className}>
      <p role="status" aria-live="polite" className="text-sm font-medium text-foreground text-pretty">
        {text}
      </p>
      {meter && (
        <span aria-hidden="true" data-near={meter.near ? "true" : undefined} className="people-meter mt-1.5">
          <span className="people-meter-track">
            <span className="people-meter-fill" style={{ transform: `scaleX(${meter.ratio})` }} />
          </span>
        </span>
      )}
      <p className="mt-1 text-xs text-muted-foreground text-pretty">{asAdmin ? LICENSED_VALUE : askAdmin(limit)}</p>
      {href || pricing ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {href && (
            <a href={href} target="_blank" rel="noopener noreferrer" className={cn(linkClass, "font-medium text-brand-text")}>
              {removeLimit(limit)}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </a>
          )}
          {pricing && (
            <a href={pricing} target="_blank" rel="noopener noreferrer" className={cn(linkClass, "text-muted-foreground hover:text-foreground")}>
              Prices
            </a>
          )}
          {card && (
            <Disclosure className="text-muted-foreground" summary="How" summaryClassName="font-medium hover:text-foreground">
              <p className="mt-1 max-w-[60ch] text-pretty">{UPGRADE_STEPS}</p>
            </Disclosure>
          )}
        </div>
      ) : null}
    </PlanNote>
  )
}

"use client"

// The plan and its seats in the workspace menu, for admins (SHELL-15): which
// plan the workspace is on, how full it is, and the way past the free plan's
// limit, where people look for the plan (the workspace switcher: the menu on
// a computer, the workspace sheet on a phone). A chunk of its own, drawn from
// the menu's or the sheet's first open (SidebarHeader, orgDrawer).

import type { ReactNode } from "react"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { usePlan } from "@/hooks/usePlan"
import { useGrow } from "@/hooks/useGrow"
import { seatWords } from "@/lib/people/seatWords"
import { useAppRouter } from "@/lib/navigation/appRouter"
import { ArrowUpRight } from "@/lib/icons"
import { planName, removeLimit } from "@/lib/plan/planWords"
import { cn } from "@/lib/utils/helpers/cn"

/** The track's tone: moss, sun from 80 %, danger when full. Pure. */
export function seatTone(used: number, limit: number): "moss" | "sun" | "danger" {
  const r = limit > 0 ? used / limit : 0
  return r >= 1 ? "danger" : r >= 0.8 ? "sun" : "moss"
}

const FILL = { moss: "bg-camp-moss", sun: "bg-camp-sun", danger: "bg-danger" }

/**
 * What the row says and where it goes, for the menu and the sheet alike:
 * null when there's nothing to say (a failed read, or an older server that
 * names no plan), "waiting" while the plan comes.
 */
function usePlanRow(): null | "waiting" | { label: string; go: () => void; body: ReactNode } {
  const p = usePlan({ quiet: true })
  const router = useAppRouter()
  const grow = useGrow("plan-row", p.known)
  if (p.failed || (p.known && !p.plan)) return null
  if (!p.known || !p.plan) return "waiting"
  const limited = p.limit > 0
  const { words, near, ratio } = seatWords(p.used, p.limit)
  const seats = !limited ? "unlimited people" : near ? words : `${words} people`
  const tone = seatTone(p.used, p.limit)
  const url = limited ? p.upgradeUrl : undefined
  const cta = url ? removeLimit(p.limit) : ""
  return {
    label: `Plan: ${planName(p.plan)}, ${seats}.${cta ? ` ${cta}` : ""}`,
    go: () => (url ? window.open(url, "_blank", "noopener,noreferrer") : router.push("/app/admin?tab=users")),
    body: (
      <>
        <span className="text-ui-sm font-medium tabular-nums">
          {planName(p.plan)} · {seats}
        </span>
        {limited && (
          <span data-plan-track="" data-tone={tone} className="relative block h-1 overflow-hidden rounded-full bg-press" aria-hidden="true">
            <span className="absolute inset-0 origin-left" style={{ transform: `scaleX(${ratio})` }}>
              <span {...grow.bar(0)} className={cn("block h-full w-full rounded-full", FILL[tone])} />
            </span>
          </span>
        )}
        {cta && (
          <span className="inline-flex items-center gap-1 text-ui-sm font-medium text-brand-text">
            {cta}
            <ArrowUpRight aria-hidden="true" className="!size-3.5 !text-brand-text" />
          </span>
        )}
      </>
    ),
  }
}

/** The row's room while the plan comes. */
function Waiting({ className }: { className: string }) {
  return (
    <div role="status" aria-label="Loading the plan" aria-busy="true" className={cn("flex h-11 flex-col justify-center gap-2", className)}>
      <Skeleton className="h-3 w-2/5 rounded" />
      <Skeleton className="h-1 w-full rounded-full" />
    </div>
  )
}

/** The workspace menu's plan row, on a computer. */
export function PlanRow() {
  const row = usePlanRow()
  if (!row) return null
  if (row === "waiting") return <Waiting className="mx-2" />
  return (
    <DropdownMenuItem data-plan-row="" aria-label={row.label} className="shell-menu-item h-auto flex-col items-stretch gap-1.5 py-2" onSelect={row.go}>
      {row.body}
    </DropdownMenuItem>
  )
}

/** The same row in the phone's workspace sheet: a 56 px row (a sheet row with a second line) that closes the sheet as it goes. */
export function PlanSheetRow({ onGo }: { onGo: () => void }) {
  const row = usePlanRow()
  if (!row) return null
  if (row === "waiting") return <Waiting className="mx-3" />
  return (
    <button
      type="button"
      data-press="row"
      data-plan-row=""
      aria-label={row.label}
      onClick={() => {
        onGo()
        row.go()
      }}
      className="flex min-h-14 w-full flex-col items-stretch justify-center gap-1.5 rounded-[10px] px-3 py-2 text-left text-foreground transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
    >
      {row.body}
    </button>
  )
}

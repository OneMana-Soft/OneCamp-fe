"use client"

// The plan's priority and dates pickers (linear-15): a chunk of its own that
// the chips (ProjectPlanChips) fetch as the pointer or the focus reaches their
// chip. Handed everything as props, it imports none of the shared core (main's
// chunking rule, 30 Oct). Each hands the strip a change and the parts as
// they'll read, and the strip saves. Priority closes on a pick, as a task's
// does; dates stay open, as a person often sets both ends.

import { useState } from "react"
import { PriorityMenuContent, menuSurface } from "@/components/task/StatusMenu"
import { DateField } from "@/components/ui/date-field"
import { PopoverContent } from "@/components/ui/popover"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { ChevronLeft, ChevronRight } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { PLAN_RESOLUTIONS, periodOf, periodsOfYear, whenOf, whenWords, type PlanPick, type PlanResolution, type ProjectPlan } from "@/lib/work/projectPlan"

/** Keys 1 to 4 are the levels, as a task's priority picker has them; 5 takes the priority off. */
const PRIORITY_VALUES = ["low", "medium", "high", "urgent", ""] as const

/** The priority's or the dates' picker on the menu's surface (a sheet on a phone), the dates' a little wider. */
export function PlanPopover({ field, plan, onPick }: { field: "priority" | "dates"; plan: ProjectPlan; onPick: PlanPick }) {
  return (
    <PopoverContent className={cn(menuSurface, field === "dates" && "w-72")} align="start">
      {field === "priority" ? (
        <PriorityMenuContent current={plan.priority} values={PRIORITY_VALUES} onSelect={(v) => onPick({ priority: v || null }, { priority: v })} />
      ) : (
        <DatesPicker plan={plan} onPick={onPick} />
      )}
    </PopoverContent>
  )
}

/** The two ends a date picker sets, on the house's one segmented choice. */
const ENDS = ["start", "target"] as const

/**
 * The start or the target, chosen at a resolution: a day from the date
 * picker (no later than the target, no earlier than the start), or a month,
 * quarter, half or year of the year shown. The server snaps a start to its
 * period's first day and a target to its last.
 */
function DatesPicker({ plan, onPick }: { plan: ProjectPlan; onPick: PlanPick }) {
  const [end, setEnd] = useState<"start" | "target">(plan.start && !plan.target ? "start" : "target")
  const when = plan[end]
  const [resolution, setResolution] = useState<PlanResolution>(when?.resolution ?? "quarter")
  const [year, setYear] = useState(() => Number((when?.date ?? new Date().toISOString()).slice(0, 4)))
  const choose = (day: string) => {
    const w = whenOf(day, resolution, end)
    onPick({ [end]: w }, { [end]: w }, true)
  }
  const clear = () => onPick({ [end]: null }, { [end]: null }, true)
  const chosen = (day: string) => !!when && when.resolution === resolution && periodOf(when.date, resolution).first === periodOf(day, resolution).first
  const switchTo = (e: "start" | "target") => {
    setEnd(e)
    const w = plan[e]
    if (w) {
      setResolution(w.resolution)
      setYear(Number(w.date.slice(0, 4)))
    }
  }
  return (
    <div data-plan-dates="" className="space-y-2 p-1">
      <SegmentedControl
        aria-label="Which date"
        value={end}
        onValueChange={switchTo}
        options={ENDS.map((e) => ({
          value: e,
          label: (
            <>
              {e === "start" ? "Start" : "Target"}
              {plan[e] && <span className="font-[450] text-ink-3"> · {whenWords(plan[e])}</span>}
            </>
          ),
        }))}
        className="grid w-full grid-cols-2"
      />
      <SegmentedControl aria-label="Chosen as" value={resolution} onValueChange={setResolution} options={PLAN_RESOLUTIONS} className="grid w-full grid-cols-5" itemClassName="px-0.5" />
      {resolution === "day" ? (
        <DateField
          aria-label={end === "start" ? "Start day" : "Target day"}
          value={when?.resolution === "day" ? when.date : ""}
          onChange={(day) => (day ? choose(day) : clear())}
          min={end === "target" ? plan.start?.date : undefined}
          max={end === "start" ? plan.target?.date : undefined}
          dense
          className="h-8 w-full"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <button type="button" aria-label="The year before" onClick={() => setYear((y) => y - 1)} className="flex size-7 items-center justify-center rounded-md text-ink-2 hover:bg-press">
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <span data-plan-year={year} className="text-sm font-[510] tabular-nums text-foreground">
              {year}
            </span>
            <button type="button" aria-label="The year after" onClick={() => setYear((y) => y + 1)} className="flex size-7 items-center justify-center rounded-md text-ink-2 hover:bg-press">
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </div>
          <div className={cn("grid gap-1", resolution === "month" || resolution === "quarter" ? "grid-cols-4" : resolution === "half" ? "grid-cols-2" : "grid-cols-1")}>
            {periodsOfYear(year, resolution).map((p) => {
              const on = chosen(p.day)
              return (
                <button
                  key={p.day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => choose(p.day)}
                  className={cn("h-8 rounded-md text-sm tabular-nums transition-colors", on ? "bg-foreground font-[510] text-sheet" : "text-foreground hover:bg-press")}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        </>
      )}
      {when && (
        // The last row, set off by a hairline, a thumb's size on touch (PartRetry's rule).
        <div className="border-t border-line pt-1">
          <button type="button" onClick={clear} className="min-h-11 w-full rounded-md text-xs text-ink-3 hover:bg-press hover:text-foreground md:min-h-7">
            {end === "start" ? "Clear the start" : "Clear the target"}
          </button>
        </div>
      )}
    </div>
  )
}

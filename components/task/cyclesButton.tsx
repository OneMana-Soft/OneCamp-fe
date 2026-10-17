"use client"

// Cycles in a project's task toolbar: Linear's sprints. The button names the
// cycle the list is showing; the popover lists every cycle with its progress,
// shows one by clicking it, opens any cycle's burndown, and lets the
// project's admins start a cycle and complete one (carrying unfinished tasks
// into the next).

import * as React from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RefreshCw, TrendingDown, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { useProjectCycles } from "@/hooks/useProjectCycles"
import { cycleLabel, percentDone, timeLeft, type Cycle } from "@/lib/tasks/cycles"
import { ProgressRing } from "@/components/ui/graphics/ProgressRing"
import { lazyView } from "@/components/task/LazyView"

// The burndown and its chart load when a cycle's chart is asked for.
const CycleBurndownDialog = dynamic(() => import("@/components/task/cycleBurndownDialog").then((m) => m.CycleBurndownDialog), { loading: () => null })

// The switcher's body (its cycles, their actions and the new cycle's form) is
// a chunk of its own: the project's first screen draws only the chip
// (app/firstLoad.test.ts).
const Switcher = lazyView(() => import("@/components/task/cyclesSwitcher"))
/** Starts loading the switcher's body, as the chip does on pointer or focus. */
export const warmSwitcher = () => Switcher.warm()

/**
 * Cycles in the list's toolbar (design v3, work.md W45): a chip "◔ Launch
 * week · 3 d left" whose 16 px ring is how far the cycle is; it opens a
 * switcher with the current cycle as a card at the top, then the rest. With
 * a cycle shown, the chip is raised, with Burndown and "show all" beside it.
 */
export function CyclesButton({
  projectId,
  activeCycleId,
  onShow,
}: {
  projectId: string
  /** The cycle the list is filtered to, if any. */
  activeCycleId?: string
  /** Show one cycle's tasks, or all (null). */
  onShow: (cycleId: string | null) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [making, setMaking] = React.useState(false)
  const [chartFor, setChartFor] = React.useState<Cycle | null>(null)
  // The burndown opens from the popover, which is gone by then: closing it
  // puts focus back on the Cycles button.
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const { cycles } = useProjectCycles(projectId)
  const active = cycles.find((c) => c.id === activeCycleId)
  const current = cycles.find((c) => c.state === "current" && !c.completed_at)
  const chip = active ?? current

  return (
    <div className="flex items-center gap-0.5" data-cycles="">
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setMaking(false) }}>
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            variant={active ? "secondary" : "ghost"}
            size="sm"
            aria-label={chip ? `Cycles: ${cycleLabel(chip)}, ${timeLeft(chip)}` : "Cycles"}
            className={cn("gap-1.5", active && "ring-1 ring-inset ring-brand/40")}
            // The switcher's chunk starts loading as the pointer or the focus
            // reaches the chip, so it is in by the click.
            onPointerEnter={() => void warmSwitcher()}
            onFocus={() => void warmSwitcher()}
          >
            {chip ? (
              <>
                <ProgressRing value={percentDone(chip.progress)} size={16} weight={2.5} label={`${percentDone(chip.progress)}% done`} />
                <span className="max-w-40 truncate">{cycleLabel(chip)}</span>
                <span className="text-ink-3">· {timeLeft(chip)}</span>
              </>
            ) : (
              <>
                <RefreshCw className="size-3.5" aria-hidden />
                Cycles
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-2">
          <Switcher.View
            fallback={<p className="p-2 text-sm text-ink-2">Loading…</p>}
            render={(m) => (
              <m.CyclesSwitcher
                projectId={projectId}
                activeCycleId={activeCycleId}
                making={making}
                onMaking={setMaking}
                onShow={(id) => {
                  onShow(id)
                  setOpen(false)
                }}
                onChart={(c) => {
                  setChartFor(c)
                  setOpen(false)
                }}
              />
            )}
          />
        </PopoverContent>
      </Popover>
      {active && (
        <>
          <Button variant="ghost" size="icon-sm" aria-label={`${cycleLabel(active)} burndown`} title="Burndown" onClick={() => setChartFor(active)}>
            <TrendingDown className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Show all tasks" onClick={() => onShow(null)}>
            <X className="size-3.5" />
          </Button>
        </>
      )}
      {chartFor && <CycleBurndownDialog projectId={projectId} cycle={chartFor} onClose={() => setChartFor(null)} returnFocus={triggerRef} />}
    </div>
  )
}

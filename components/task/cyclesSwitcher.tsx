"use client"

// The cycles switcher's body (CyclesButton): every cycle with its progress,
// the current one as a card at the top, each with its burndown, Complete…
// and Delete, and the form that starts a new cycle. A chunk of its own
// (app/firstLoad.test.ts): a project's first screen shows the Cycles chip,
// and this loads as the pointer or the focus reaches it.

import * as React from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Check, Loader2, Plus, Trash2, TrendingDown } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { useToast } from "@/hooks/use-toast"
import { useProjectCycles } from "@/hooks/useProjectCycles"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cycleDates, cycleLabel, nextStart, percentDone, timeLeft, type Cycle } from "@/lib/tasks/cycles"
import { SpotCalendar } from "@/components/ui/graphics/spots"
import { ProgressRing } from "@/components/ui/graphics/ProgressRing"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { celebrateRing } from "@/lib/celebrate"

const STATE_LABEL: Record<string, string> = { current: "Current", upcoming: "Upcoming", ended: "Ended", completed: "Completed" }

/** What the switcher shows: the form for a new cycle, or the cycles. */
export function CyclesSwitcher({
  projectId,
  activeCycleId,
  making,
  onMaking,
  onShow,
  onChart,
}: {
  projectId: string
  activeCycleId?: string
  making: boolean
  onMaking: (making: boolean) => void
  /** Show one cycle's tasks; the switcher closes. */
  onShow: (cycleId: string) => void
  /** Open a cycle's burndown; the switcher closes. */
  onChart: (cycle: Cycle) => void
}) {
  const { cycles, canEdit, isLoading } = useProjectCycles(projectId)
  const current = cycles.find((c) => c.state === "current" && !c.completed_at)
  const shown = [...cycles].filter((c) => c.id !== current?.id).sort((a, b) => b.number - a.number)

  if (making) return <NewCycle projectId={projectId} cycles={cycles} onDone={() => onMaking(false)} />
  return (
    <div className="grid gap-2">
      {isLoading ? (
        <p className="p-2 text-sm text-ink-2">Loading…</p>
      ) : cycles.length === 0 ? (
        <div className="grid justify-items-center gap-2 px-2 pt-2 text-center" data-cycles-empty="">
          <SpotCalendar size={64} hue="lake" />
          <p className="text-sm text-ink-2">
            Cycles are short, fixed stretches of work, a week or two each. Unfinished tasks move to the next one.
          </p>
        </div>
      ) : (
        <>
          {current && (
            <div data-current-cycle="" className="rounded-lg bg-raised p-1 shadow-e1">
              <ul aria-label="Current cycle">
                <CycleRow
                  projectId={projectId}
                  cycle={current}
                  cycles={cycles}
                  canEdit={canEdit}
                  featured
                  active={current.id === activeCycleId}
                  onShow={() => onShow(current.id)}
                  onChart={() => onChart(current)}
                />
              </ul>
            </div>
          )}
          {shown.length > 0 && (
            <ul className="grid max-h-72 gap-px overflow-y-auto" aria-label="Cycles">
              {shown.map((c) => (
                <CycleRow
                  key={c.id}
                  projectId={projectId}
                  cycle={c}
                  cycles={cycles}
                  canEdit={canEdit}
                  active={c.id === activeCycleId}
                  onShow={() => onShow(c.id)}
                  onChart={() => onChart(c)}
                />
              ))}
            </ul>
          )}
        </>
      )}
      {canEdit && (
        <Button size="sm" variant="ghost" className="justify-self-start gap-1.5" onClick={() => onMaking(true)}>
          <Plus className="size-3.5" /> New cycle
        </Button>
      )}
    </div>
  )
}

function CycleRow({
  projectId,
  cycle,
  cycles,
  canEdit,
  active,
  featured = false,
  onShow,
  onChart,
}: {
  projectId: string
  cycle: Cycle
  cycles: Cycle[]
  canEdit: boolean
  active: boolean
  /** The current cycle's card at the top of the switcher: its ring at 28. */
  featured?: boolean
  onShow: () => void
  onChart: () => void
}) {
  const rowRef = React.useRef<HTMLLIElement>(null)
  // The cycle the unfinished tasks would move to: the next one by number, or a new one.
  const next = cycles.filter((c) => c.number > cycle.number && !c.completed_at).sort((a, b) => a.number - b.number)[0]
  const { complete, remove } = useProjectCycles(projectId)
  const { toast } = useToast()
  const [confirming, setConfirming] = React.useState(false)
  // Deleting asks first, in the row, saying what goes: a cycle's burndown
  // can't be had back, though its tasks stay.
  const [deleting, setDeleting] = React.useState(false)
  const [carry, setCarry] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const p = cycle.progress ?? { total: 0, started: 0, done: 0 }
  const pct = percentDone(p)
  const open = p.total - p.done

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast({ title: "Couldn't do that", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li ref={rowRef} className={cn("rounded-md px-2 py-2", active && !featured && "bg-press")}>
      <button type="button" onClick={onShow} className="flex w-full items-start gap-2.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {cycle.completed_at ? (
          // A completed cycle wears the done glyph, moss: an orange ring read
          // as one not started, and orange is the brand's (PTC-32).
          <StatusGlyph status="done" size={featured ? 28 : 16} label={`${cycleLabel(cycle)} completed`} className="mt-0.5 shrink-0" />
        ) : (
          <ProgressRing value={pct} size={featured ? 28 : 16} weight={featured ? 3 : 2.5} label={`${cycleLabel(cycle)} progress`} className="mt-0.5">
            {featured && <span className="text-micro font-semibold tabular-nums">{p.done}</span>}
          </ProgressRing>
        )}
        <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex items-center justify-between gap-2 text-sm font-medium">
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            {active && <Check className="size-3.5 shrink-0" aria-hidden />}
            {cycleLabel(cycle)}
          </span>
          <span className={cn("shrink-0 text-2xs", cycle.state === "current" ? "font-medium text-foreground" : "text-ink-3")}>
            {cycle.state === "current" ? timeLeft(cycle) : STATE_LABEL[cycle.state ?? "upcoming"]}
          </span>
        </span>
        <span className="text-xs text-ink-3 tabular-nums">
          {cycleDates(cycle)} ·{" "}
          {cycle.completed_at
            ? `${cycle.done_count ?? 0} done${cycle.carried_count ? `, ${cycle.carried_count} carried over` : ""}`
            : `${p.done} of ${p.total} done`}
        </span>
        </span>
      </button>
      {canEdit && !cycle.completed_at && deleting ? (
        <div className="mt-2 grid gap-2 border-t border-line pt-2" role="group" aria-label={`Delete ${cycleLabel(cycle)}`}>
          <p className="text-xs text-ink-2">
            <span className="font-medium text-foreground">Delete {cycleLabel(cycle)}?</span>{" "}
            {p.total > 0 ? `Its ${p.total} ${p.total === 1 ? "task stays" : "tasks stay"} in the project, in no cycle.` : "It has no tasks."} Its burndown
            is deleted with it, and this can&apos;t be undone.
          </p>
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setDeleting(false)}>Cancel</Button>
            <Button size="sm" variant="destructive" className="h-7" disabled={busy} onClick={() => run(async () => {
              await remove(cycle.id)
              toast({ title: `Deleted ${cycleLabel(cycle)}`, description: "Its tasks stay in the project." })
            })}>
              {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Delete cycle
            </Button>
          </div>
        </div>
      ) : canEdit && !cycle.completed_at && confirming ? (
        <div className="mt-2 grid gap-2 border-t border-line pt-2" role="group" aria-label={`Complete ${cycleLabel(cycle)}`}>
          <p className="text-xs text-ink-2">
            <span className="font-medium text-foreground">Complete {cycleLabel(cycle)}?</span>{" "}
            {open === 0
              ? `All ${p.done} ${p.done === 1 ? "task is" : "tasks are"} done.`
              : carry
                ? `${open} unfinished ${open === 1 ? "task moves" : "tasks move"} to ${next ? cycleLabel(next) : "a new cycle"}.`
                : `${open} unfinished ${open === 1 ? "task stays" : "tasks stay"} in the project, in no cycle.`}
          </p>
          {open > 0 && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={carry} onChange={(e) => setCarry(e.target.checked)} />
              Move the unfinished tasks to {next ? cycleLabel(next) : "the next cycle"}
            </label>
          )}
          <div className="flex gap-1.5">
            <Button size="sm" className="h-7" disabled={busy} onClick={() => run(async () => {
              const r = await complete(cycle.id, carry)
              // Every task finished: the Ring tier, from the cycle's row.
              if (open === 0 && p.total > 0) celebrateRing(rowRef.current)
              toast({ title: `${cycleLabel(cycle)} complete`, description: r.carried ? `${r.carried} moved to ${r.next ? cycleLabel(r.next) : "the next cycle"}.` : `${r.done} done.` })
              setConfirming(false)
            })}>
              {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Complete
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="mt-1.5 flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" aria-label={`${cycleLabel(cycle)} burndown`} onClick={onChart}>
            <TrendingDown className="h-3.5 w-3.5" aria-hidden />
            Burndown
          </Button>
          {canEdit && !cycle.completed_at && cycle.state !== "upcoming" && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setConfirming(true)}>Complete…</Button>
          )}
          {canEdit && !cycle.completed_at && (
            <Button size="icon" variant="ghost" className="ml-auto h-7 w-7 text-muted-foreground hover:text-danger-ink" aria-label={`Delete ${cycleLabel(cycle)}`} disabled={busy}
              onClick={() => { setConfirming(false); setDeleting(true) }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

// Loads with the form, not the project page.
const DateField = dynamic(() => import("@/components/ui/date-field").then((m) => m.DateField), { loading: () => <div className="h-8" /> })

function NewCycle({ projectId, cycles, onDone }: { projectId: string; cycles: Cycle[]; onDone: () => void }) {
  const { create } = useProjectCycles(projectId)
  const { toast } = useToast()
  const [start, setStart] = React.useState(() => nextStart(cycles))
  const [weeks, setWeeks] = React.useState("2")
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const startId = React.useId()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      // Midnight where the person is: a cycle starts with their day.
      const c = await create({ name, starts_at: new Date(`${start}T00:00:00`).toISOString(), weeks: Number(weeks) })
      toast({ title: `${cycleLabel(c)} ready`, description: cycleDates(c) })
      onDone()
    } catch (err) {
      toast({ title: "Couldn't make the cycle", description: apiErrorMessage(err, "Try again in a moment."), variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 p-1">
      <p className="text-sm font-medium">New cycle</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label htmlFor={startId} className="text-xs">Starts</Label>
          <DateField id={startId} value={start} onChange={setStart} className="h-8" required />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Length</Label>
          <Select value={weeks} onValueChange={setWeeks}>
            <SelectTrigger className="h-8" aria-label="Length"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((w) => <SelectItem key={w} value={String(w)}>{w} {w === 1 ? "week" : "weeks"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Name (optional)" aria-label="Name" className="h-8" />
      <div className="flex justify-end gap-1.5">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>Back</Button>
        <Button type="submit" size="sm" disabled={busy || !start}>
          {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Start cycle
        </Button>
      </div>
    </form>
  )
}

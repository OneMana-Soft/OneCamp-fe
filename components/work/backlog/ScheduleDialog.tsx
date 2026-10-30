"use client"

import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { DateField } from "@/components/ui/date-field"
import { Label } from "@/components/ui/label"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { Switch } from "@/components/ui/switch"
import { localDay } from "@/lib/utils/timeZone"
import type { CycleSchedule } from "@/lib/work/backlog"

/**
 * The cycle schedule (B3b, PROGRAM.md D-PJ-6): a project's cycles run
 * themselves. How long each runs, a week off between them or not, how many
 * are kept ready ahead, whether unfinished tasks move on when one ends, and
 * when the first starts. Saving makes the cycles it keeps ready; stopping
 * leaves the cycles made where they are.
 */
const LENGTHS = ["1", "2", "3", "4", "6", "8"] as const
const AHEAD = ["1", "2", "3", "4", "6"] as const
// A track the width of the dialog, its choices sharing it equally; the unit follows it.
const TRACK = "flex min-w-0 flex-1 flex-nowrap"

export function ScheduleDialog({
  schedule,
  firstDay,
  onClose,
  onSave,
  onStop,
}: {
  schedule?: CycleSchedule | null
  /** The day offered for the first cycle when there's no schedule yet. */
  firstDay: string
  onClose: () => void
  onSave: (s: CycleSchedule) => void
  onStop: () => void
}) {
  const [weeks, setWeeks] = useState(String(schedule?.weeks ?? 2))
  const [cooldown, setCooldown] = useState((schedule?.cooldown_weeks ?? 0) > 0)
  const [ahead, setAhead] = useState(String(schedule?.upcoming ?? 2))
  const [rollOver, setRollOver] = useState(schedule?.roll_over ?? true)
  const [addStarted, setAddStarted] = useState(schedule?.add_started ?? false)
  const [start, setStart] = useState(schedule ? localDay(new Date(schedule.starts_at)) : firstDay)
  // Stopping changes what happens every cycle, so it asks first, in place.
  const [stopping, setStopping] = useState(false)
  const ids = {
    weeks: useId(),
    ahead: useId(),
    cooldown: useId(),
    roll: useId(),
    started: useId(),
    start: useId(),
  }
  // A schedule kept more ready than the choices offer still shows its own number.
  const aheadOptions = (AHEAD as readonly string[]).includes(ahead) ? AHEAD : [...AHEAD, ahead]
  return (
    <ResponsiveDialog
      title={schedule ? "Cycle schedule" : "Run cycles automatically"}
      description="Each cycle starts and ends by itself, and the next ones are made ahead."
      onClose={onClose}
      wide
      footer={
        stopping ? (
          <>
            <p className="text-ui-sm text-foreground sm:mr-auto" data-stop-confirm="">
              Stop running cycles? The ones made so far stay.
            </p>
            <Button variant="ghost" size="sm" onClick={() => setStopping(false)}>
              Keep them running
            </Button>
            <Button variant="destructive" size="sm" onClick={onStop}>
              Stop
            </Button>
          </>
        ) : (
          <>
            {schedule ? (
              <Button variant="ghost" size="sm" className="text-danger-ink sm:mr-auto" onClick={() => setStopping(true)}>
                Stop running them
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!start}
              onClick={() =>
                onSave({
                  weeks: Number(weeks),
                  cooldown_weeks: cooldown ? 1 : 0,
                  upcoming: Number(ahead),
                  roll_over: rollOver,
                  add_started: addStarted,
                  starts_at: start,
                })
              }
            >
              {schedule ? "Save" : "Run them"}
            </Button>
          </>
        )
      }
    >
      <div className="grid gap-4 pb-2" data-schedule-form="">
        <div className="grid gap-1.5">
          <Label id={ids.weeks}>Weeks each cycle runs</Label>
          <div className="flex items-center gap-2">
            <SegmentedControl
              aria-labelledby={ids.weeks}
              value={weeks}
              onValueChange={setWeeks}
              className={TRACK}
              itemClassName="flex-1"
              options={LENGTHS.map((w) => ({
                value: w,
                label: <span aria-label={w === "1" ? "1 week" : `${w} weeks`}>{w}</span>,
              }))}
            />
            <span aria-hidden className="text-meta text-ink-3">
              weeks
            </span>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={ids.start}>The first one starts</Label>
          <DateField id={ids.start} aria-label="The first one starts" value={start} onChange={setStart} required />
        </div>
        <div className="grid gap-1.5">
          <Label id={ids.ahead}>Cycles ready ahead</Label>
          <div className="flex items-center gap-2">
            <SegmentedControl
              aria-labelledby={ids.ahead}
              value={ahead}
              onValueChange={setAhead}
              className={TRACK}
              itemClassName="flex-1"
              options={aheadOptions.map((n) => ({
                value: n,
                label: <span aria-label={n === "1" ? "1 cycle" : `${n} cycles`}>{n}</span>,
              }))}
            />
            <span aria-hidden className="text-meta text-ink-3">
              cycles
            </span>
          </div>
        </div>
        <div className="grid">
          <label htmlFor={ids.cooldown} className="flex min-h-11 cursor-pointer sm:min-h-10 items-center justify-between gap-3 text-ui-sm text-foreground">
            A week off between cycles
            <Switch id={ids.cooldown} aria-label="A week off between cycles" checked={cooldown} onCheckedChange={setCooldown} />
          </label>
          <label htmlFor={ids.roll} className="flex min-h-11 cursor-pointer sm:min-h-10 items-center justify-between gap-3 text-ui-sm text-foreground">
            Move unfinished tasks to the next cycle
            <Switch id={ids.roll} aria-label="Move unfinished tasks to the next cycle" checked={rollOver} onCheckedChange={setRollOver} />
          </label>
          <label htmlFor={ids.started} className="flex min-h-11 cursor-pointer sm:min-h-10 items-center justify-between gap-3 text-ui-sm text-foreground">
            Add tasks to the running cycle when they start
            <Switch id={ids.started} aria-label="Add tasks to the running cycle when they start" checked={addStarted} onCheckedChange={setAddStarted} />
          </label>
        </div>
      </div>
    </ResponsiveDialog>
  )
}

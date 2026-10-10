"use client"

// The task panel's Repeat row: Asana's recurring tasks. Daily, weekly on
// chosen days, monthly or yearly, every N; on the calendar or counted from the
// day it's done. Completing the task makes the next one (the server does it,
// so a task an agent or GitHub closes repeats too).

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Repeat } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { useToast } from "@/hooks/use-toast"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import {
  WEEKDAYS,
  buildRule,
  describeRepeat,
  parseRule,
  type Freq,
  type RepeatSpec,
  type TaskRecurrence,
} from "@/lib/tasks/recurrence"
import { fieldLabel, fieldRow } from "@/lib/ui/fieldRow"
import { browserTZ } from "@/lib/utils/timeZone"

const UNITS: { value: Freq; one: string; many: string }[] = [
  { value: "DAILY", one: "day", many: "days" },
  { value: "WEEKLY", one: "week", many: "weeks" },
  { value: "MONTHLY", one: "month", many: "months" },
  { value: "YEARLY", one: "year", many: "years" },
]

/** A new repeat starts weekly on the due date's weekday (or Monday). */
function startingSpec(due?: Date): RepeatSpec {
  const code = due ? WEEKDAYS[(due.getDay() + 6) % 7].code : "MO"
  return { freq: "WEEKLY", interval: 1, days: [code], mode: "schedule" }
}

export function TaskRepeatField({
  taskUUID,
  isAdmin,
  isSubtask,
  dueDate,
}: {
  taskUUID: string
  isAdmin: boolean
  isSubtask: boolean
  dueDate?: Date
}) {
  const url = taskUUID ? `${GetEndpointUrl.GetTaskRecurrence}/${taskUUID}` : ""
  const { data, mutate } = useFetch<{ data: TaskRecurrence | null }>(url)
  const { makeRequest, isSubmitting } = usePost()
  const { toast } = useToast()
  const current = data?.data ? parseRule(data.data.rule, data.data.mode) : null
  const [open, setOpen] = React.useState(false)
  const [spec, setSpec] = React.useState<RepeatSpec>(() => current ?? startingSpec(dueDate))

  // Subtasks don't repeat (the server says why); hide the row unless one
  // somehow already does, so it can still be stopped.
  if (isSubtask && !current) return null

  const openWith = (o: boolean) => {
    if (o) setSpec(current ?? startingSpec(dueDate))
    setOpen(o)
  }
  const save = async (rule: string) => {
    const res = await makeRequest<{ task_uuid: string; rule: string; mode: string; tz: string }, TaskRecurrence | null>({
      apiEndpoint: PostEndpointUrl.SetTaskRecurrence,
      // The days in the rule are this person's days: the server works the
      // next date out in their zone, not in UTC.
      payload: { task_uuid: taskUUID, rule, mode: spec.mode, tz: browserTZ() },
      showErrorToast: true,
    })
    if (res === undefined) return
    await mutate({ data: res ?? null }, { revalidate: false })
    setOpen(false)
    toast({
      title: rule ? "Task repeats" : "Task no longer repeats",
      description: rule ? `${describeRepeat(spec)}. Completing it makes the next one.` : undefined,
    })
  }
  const unit = UNITS.find((u) => u.value === spec.freq)!
  const weeklyDays = spec.freq === "WEEKLY" && spec.mode === "schedule"

  return (
    <div className={fieldRow()}>
      <div>
        <span className={fieldLabel}>Repeat</span>
      </div>
      <div className="min-w-0">
        <Popover open={open} onOpenChange={openWith}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className={cn("-ml-2 h-8 max-w-full justify-start px-2 font-normal", !current && "text-muted-foreground")}
              disabled={!isAdmin}
            >
              <Repeat className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{current ? describeRepeat(current) : "Doesn't repeat"}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(92vw,20rem)] space-y-4 p-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="repeat-interval" className="text-sm">
                Every
              </Label>
              <Input dense
                id="repeat-interval"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                value={spec.interval}
                onChange={(e) => setSpec((s) => ({ ...s, interval: Math.min(365, Math.max(1, Number(e.target.value) || 1)) }))}
                className="h-8 w-16"
              />
              <Select value={spec.freq} onValueChange={(v) => setSpec((s) => ({ ...s, freq: v as Freq }))}>
                <SelectTrigger dense className="h-8 flex-1" aria-label="Unit">
                  <SelectValue>{spec.interval === 1 ? unit.one : unit.many}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {spec.interval === 1 ? u.one : u.many}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <RadioGroup
              value={spec.mode}
              onValueChange={(v) => setSpec((s) => ({ ...s, mode: v as RepeatSpec["mode"] }))}
              className="gap-2"
            >
              <label className="flex items-start gap-2 text-sm">
                <RadioGroupItem value="schedule" className="mt-0.5" />
                <span>
                  On a schedule
                  <span className="block text-xs text-muted-foreground">The next due date follows the calendar.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <RadioGroupItem value="completion" className="mt-0.5" />
                <span>
                  After it&apos;s done
                  <span className="block text-xs text-muted-foreground">Counts from the day you complete it.</span>
                </span>
              </label>
            </RadioGroup>

            {weeklyDays && (
              <div role="group" aria-label="On these days" className="flex justify-between gap-1">
                {WEEKDAYS.map((d) => {
                  const on = spec.days.includes(d.code)
                  return (
                    <button
                      key={d.code}
                      type="button"
                      aria-pressed={on}
                      aria-label={d.long}
                      onClick={() =>
                        setSpec((s) => ({ ...s, days: on ? s.days.filter((c) => c !== d.code) : [...s.days, d.code] }))
                      }
                      className={cn(
                        "h-8 w-8 rounded-full border text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                      )}
                    >
                      {d.short}
                    </button>
                  )
                })}
              </div>
            )}

            <p className="text-xs text-muted-foreground">{describeRepeat(spec)}.</p>
            <div className="flex justify-between gap-2">
              {current ? (
                <Button variant="ghost" size="sm" onClick={() => save("")} disabled={isSubmitting}>
                  Stop repeating
                </Button>
              ) : (
                <span />
              )}
              <Button size="sm" onClick={() => save(buildRule(spec))} disabled={isSubmitting}>
                {current ? "Save" : "Repeat"}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

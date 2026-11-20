"use client"

import * as React from "react"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { ZonePicker } from "@/components/ui/zonePicker"
import { SettingsSection } from "@/components/ui/settingsSection"
import { SavedTick, useSaveStatus } from "@/components/ui/saveStatus"
import { X } from "@/lib/icons"
import { usePreference } from "@/lib/preferences/usePreference"
import { browserTZ } from "@/lib/utils/timeZone"
import { zoneCity, zoneLabel } from "@/lib/utils/zones"
import { MAX_OTHER_ZONES, type OtherZone } from "@/lib/calendar/otherZones"
import { WORKING_WEEK, weekOrder, weekProblem, type Week } from "@/lib/calendar/workingHours"
import { WeekHoursEditor } from "@/components/calendar/workingHours/weekHoursEditor"

/** The longest name a zone's column takes, in characters (the server's maxZoneLabel). */
const MAX_ZONE_NAME = 24
const CLOCKS: { value: "auto" | "12" | "24"; label: string }[] = [
  { value: "auto", label: "Automatic" },
  { value: "12", label: "12-hour" },
  { value: "24", label: "24-hour" },
]
const WEEK_STARTS: { value: "1" | "0" | "6"; label: string }[] = [
  { value: "1", label: "Monday" },
  { value: "0", label: "Sunday" },
  { value: "6", label: "Saturday" },
]

/**
 * A change kept the moment it's made, with its row's tick, and offered back as
 * every save that ticks is (design-14): back is the value it had (null: the
 * default again).
 */
function keep<T>(save: ReturnType<typeof useSaveStatus>, set: (value: T | null) => Promise<void>, what: string, to: T | null, from: T | null): Promise<boolean> {
  return save.run(() => set(to), { what, undo: () => keep(save, set, what, from, to) })
}

/**
 * The zones your day and week show beside yours (calendar head 6, gcal-3;
 * Person Preferences calendar.zones): up to two, each with the name its
 * column says (its city when none), kept the moment they change, with their
 * tick. The server says why it refuses one (a zone twice).
 */
function OtherZones() {
  const [kept, setKept] = usePreference<OtherZone[]>("calendar.zones")
  const save = useSaveStatus()
  const zones = kept ?? []
  const change = (next: OtherZone[], what: string) => void keep(save, setKept, what, next, zones)
  const named = (z: OtherZone, label: string): OtherZone => (label ? { zone: z.zone, label } : { zone: z.zone })
  return (
    <div className="grid gap-1.5" data-other-zones="">
      <div className="flex items-center gap-2 text-ui-sm font-medium text-ink">
        Other time zones
        <SavedTick status={save.status} />
      </div>
      {zones.map((z, i) => (
        <div key={z.zone} className="flex min-w-0 flex-wrap items-center gap-2" data-other-zone={z.zone}>
          <ZonePicker
            tz={z.zone}
            label={`Other time zone ${i + 1}`}
            onTz={(tz) => change(zones.map((o, j) => (j === i ? { ...o, zone: tz } : o)), `Other time zone: ${zoneCity(tz)}`)}
            className="-ml-2 w-fit max-w-full"
          />
          <ZoneName
            key={z.label ?? ""}
            zone={z}
            onName={(label) => change(zones.map((o, j) => (j === i ? named(o, label) : o)), `Name: ${label || zoneCity(z.zone)}`)}
          />
          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${z.label || zoneCity(z.zone)}`} onClick={() => change(zones.filter((_, j) => j !== i), `Removed ${z.label || zoneCity(z.zone)}`)}>
            <X />
          </Button>
        </div>
      ))}
      {zones.length < MAX_OTHER_ZONES ? (
        <ZonePicker tz="" adds="Add a time zone" onTz={(tz) => change([...zones, { zone: tz }], `Added ${zoneCity(tz)}`)} className="-ml-2 w-fit" />
      ) : null}
      <p className="text-meta text-ink-3">Shown beside yours on your day and week, up to two.</p>
      {save.status.error ? <p className="text-meta text-danger-ink">{save.status.error}</p> : null}
    </div>
  )
}

/** A zone's column name, kept when the field is left or Enter is pressed; its city when left empty. */
function ZoneName({ zone, onName }: { zone: OtherZone; onName: (label: string) => void }) {
  const [text, setText] = React.useState(zone.label ?? "")
  const commit = () => {
    const label = text.trim()
    if (label !== (zone.label ?? "")) onName(label)
  }
  return (
    <Input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      maxLength={MAX_ZONE_NAME}
      placeholder={zoneCity(zone.zone)}
      aria-label={`Name for ${zoneCity(zone.zone)}`}
      className="w-40"
    />
  )
}

/** The words a change of working hours is offered back with. Pure. */
function hoursWords(next: Week | null, before: Week | null): string {
  return !next ? "Working hours: Off" : before ? "Working hours changed" : "Working hours: On"
}

/**
 * Your time zone, the day your week starts and your working hours (calendar
 * A3; Person Preferences zone, week_start and calendar.working_hours), saved
 * the moment they change, each with its tick. Find a time offers what falls
 * in everyone's hours, the event form says when a time is outside a guest's,
 * and the week draws yours. The zone is never guessed silently: until you
 * keep one, it suggests your browser's in one line.
 */
export function WorkingHoursSection() {
  const [zone, setZone] = usePreference<string | null>("zone")
  const [weekStart, setWeekStart] = usePreference<number>("week_start")
  const [clock, setClock] = usePreference<"auto" | "12" | "24">("clock")
  const clockSave = useSaveStatus()
  const [hours, setHours] = usePreference<Week | null>("calendar.working_hours")
  const zoneSave = useSaveStatus()
  const startSave = useSaveStatus()
  const hoursSave = useSaveStatus()
  // The hours as being edited: a range can be half typed (09:00 to 08:00) while
  // the server would refuse it, so what's shown runs ahead of what's kept.
  const [draft, setDraft] = React.useState<Week | null | undefined>(undefined)
  const shown = draft === undefined ? hours : draft
  const problem = shown ? weekProblem(shown) : null
  const guess = browserTZ()

  const keepHours = (next: Week | null) => {
    setDraft(next)
    if (next && weekProblem(next)) return
    void keep(hoursSave, setHours, hoursWords(next, hours ?? null), next, hours ?? null).then((ok) => ok && setDraft(undefined))
  }
  const keepZone = (tz: string) => void keep(zoneSave, setZone, `Time zone: ${zoneLabel(tz)}`, tz, zone ?? null)
  const order = weekOrder(typeof weekStart === "number" ? weekStart : 1)

  return (
    <div className="space-y-8" data-working-hours="">
      <SettingsSection id="profile-time" title="Time and date" description="How times are written for you, everywhere. Saved as soon as you change them.">
        <div className="grid gap-5">
          <div className="grid gap-1.5" data-hours-zone="">
            <div className="flex items-center gap-2 text-ui-sm font-medium text-ink">
              Time zone
              <SavedTick status={zoneSave.status} />
            </div>
            {zone ? (
              <ZonePicker tz={zone} onTz={keepZone} className="-ml-2 w-fit max-w-full" />
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-ui-sm text-ink-2" data-zone-suggested="">
                <span>Your time zone looks like {zoneLabel(guess)}.</span>
                <Button size="sm" variant="secondary" onClick={() => keepZone(guess)}>
                  Use it
                </Button>
                <ZonePicker tz={guess} onTz={keepZone} label="Pick another time zone" className="w-fit max-w-full" />
              </div>
            )}
            {zoneSave.status.error ? <p className="text-meta text-danger-ink">{zoneSave.status.error}</p> : null}
          </div>

          <OtherZones />

          <div className="grid gap-1.5">
            <div id="week-start-label" className="flex items-center gap-2 text-ui-sm font-medium text-ink">
              Week starts on
              <SavedTick status={startSave.status} />
            </div>
            <SegmentedControl
              aria-labelledby="week-start-label"
              value={String(typeof weekStart === "number" ? weekStart : 1) as "1" | "0" | "6"}
              onValueChange={(v) => void keep(startSave, setWeekStart, `Week starts on ${WEEK_STARTS.find((w) => w.value === v)?.label}`, Number(v), typeof weekStart === "number" ? weekStart : null)}
              options={WEEK_STARTS}
              className="w-fit"
            />
          </div>

          <div className="grid gap-1.5">
            <div id="clock-label" className="flex items-center gap-2 text-ui-sm font-medium text-ink">
              Clock
              <SavedTick status={clockSave.status} />
            </div>
            <SegmentedControl aria-labelledby="clock-label" value={clock ?? "auto"} onValueChange={(v) => void keep(clockSave, setClock, `Clock: ${CLOCKS.find((c) => c.value === v)?.label}`, v, clock ?? null)} options={CLOCKS} className="w-fit" />
            <p className="text-meta text-ink-3">On every device. Automatic follows your browser.</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection id="profile-hours" title="Working hours" description="When people can find a time with you. Saved as soon as you change it.">
        <div className="grid gap-5">
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="hours-on" className="flex items-center gap-2 text-ui-sm font-medium text-ink">
                Set working hours
                <SavedTick status={hoursSave.status} />
              </label>
              <Switch id="hours-on" checked={!!shown} onCheckedChange={(on) => keepHours(on ? WORKING_WEEK : null)} />
            </div>
            {!shown ? (
              <p className="text-meta text-ink-3">Without them, people can ask for any time.</p>
            ) : (
              <div className="grid gap-1" data-hours-week="">
                <WeekHoursEditor week={shown} order={order} onWeek={keepHours} />
                {problem ? (
                  <p role="alert" className="text-meta text-danger-ink">
                    {problem}
                  </p>
                ) : hoursSave.status.error ? (
                  <p className="text-meta text-danger-ink">{hoursSave.status.error}</p>
                ) : zone ? (
                  <p className="text-meta text-ink-3">In {zoneLabel(zone)}.</p>
                ) : (
                  <p className="text-meta text-ink-3">Keep a time zone above, and these hours follow it.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </SettingsSection>
    </div>
  )
}

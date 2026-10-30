"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SwitchRow } from "@/components/ui/settingsSection"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { DateField } from "@/components/ui/date-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCalendarList } from "@/lib/calendar/calendarList"
import { projectHue } from "@/lib/projectHue"
import { ZonePicker } from "@/components/ui/zonePicker"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { OWN_HUE } from "@/components/calendar/calendarTones"
import { RepeatControl } from "@/components/calendar/repeat/repeatControl"
import { FindTimeSuggestions } from "@/components/calendar/findTimeSuggestions"
import { AwayCheckbox, EventOptionCheckbox, FocusTimeCheckbox } from "@/components/calendar/FocusTimeCheckbox"
import { GuestRows } from "@/components/calendar/form/guestRows"
import { ReminderRows } from "@/components/calendar/form/reminderRows"
import { HueRow } from "@/components/calendar/form/hueRow"
import { fieldLabel, fieldRow, inlineChoice } from "@/lib/ui/fieldRow"
import { cn } from "@/lib/utils/helpers/cn"
import { withAllDay, withStart, type EventFormValues, type FormProblem, type OOODecline } from "@/lib/calendar/eventForm"
import { inHours, theirTime, usePeopleHours, zoneDiffers } from "@/lib/calendar/peopleHours"
import { AlertTriangle, Globe, ListTodo, X } from "@/lib/icons"
import { clockTime } from "@/lib/utils/date/clock"
import { zoneCity } from "@/lib/utils/zones"
import { Button } from "@/components/ui/button"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { taskGlyphStatus } from "@/components/calendar/HueBlock"
import { PickTask } from "@/components/task/lazyTaskFinder"
import { blockDueBy, blockTaskOf } from "@/lib/calendar/taskBlock"
import type { CalendarEventTask } from "@/types/calendar"

export interface EventFormProps {
  values: EventFormValues
  onChange: (next: EventFormValues) => void
  /**
   * The calendar keeps its own events here (the one store): repeats, guests
   * by email and their roles, place, colour, zones, busy or free, who may see
   * it and the reader's reminders. Off on a server that keeps the old stores.
   */
  full: boolean
  /** The organiser: what guests may do, and "Email me when guests answer". */
  organiser: boolean
  /** People never offered as guests: whoever fills it in. */
  exclude?: string[]
  /** A new event: free times to pick from, and a copy in Google Calendar. */
  creating?: boolean
  googleConnected?: boolean
  /** What stops a save, shown at its field. */
  problem?: FormProblem | null
  /** The title's look where the form sits: the dialog's, or the panel's. */
  titleClassName?: string
  autoFocusTitle?: boolean
  /**
   * Its rows' columns: the dialog's own (a 96 px label), or the panel's
   * (lib/ui/fieldRow), so a field opens for editing where its value was.
   */
  layout?: "dialog" | "panel"
}

const Layout = React.createContext<"dialog" | "panel">("dialog")

/**
 * The one Event Form (calendar FORM; PROGRAM.md A7): the full dialog, the
 * right panel and the phone's page edit an event with it, every field once,
 * as property rows (a label column, then the value). Controlled: the host
 * holds the values and saves them (components/calendar/form/saveEvent).
 * Rows that don't apply aren't drawn: focus time, time off and time for a
 * task have no guests and don't repeat; a server with the old stores keeps
 * the fields it has. A new event can be made time for one of your tasks (B1).
 */
export function EventForm({ values: v, onChange, full, organiser, exclude = [], creating, googleConnected, problem, titleClassName, autoFocusTitle, layout = "dialog" }: EventFormProps) {
  const id = React.useId()
  const set = (patch: Partial<EventFormValues>) => onChange({ ...v, ...patch })
  const meeting = v.kind === "event"
  // Focus time and time for a task run from a time to a time.
  const timed = v.kind === "focus" || v.kind === "task_block"
  // A block is named for its task until it's given a name; it has nobody on it.
  const pickTask = (task: CalendarEventTask) =>
    set({ kind: "task_block", task, allDay: false, guests: [], rule: "", ...(!v.title.trim() ? { title: task.task_name ?? "" } : {}) })
  const [otherEndZone, setOtherEndZone] = React.useState(!!v.endZone)
  const length = Math.round((v.end.getTime() - v.start.getTime()) / 60000) || 30

  return (
    <Layout.Provider value={layout}>
    <div className="grid" data-event-form="">
      <div className="pb-3">
        <input
          value={v.title}
          onChange={(e) => set({ title: e.target.value })}
          autoFocus={autoFocusTitle}
          aria-label="Title"
          aria-invalid={problem?.field === "title" || undefined}
          aria-describedby={problem?.field === "title" ? `${id}-problem` : undefined}
          placeholder={v.kind === "focus" ? "Focus time" : v.kind === "out_of_office" ? "Away" : v.kind === "task_block" ? v.task?.task_name || "Time for a task" : "Event title"}
          className={cn("w-full bg-transparent font-display text-title-2 font-semibold text-ink outline-none placeholder:text-ink-3", titleClassName)}
        />
        {problem?.field === "title" ? (
          <p id={`${id}-problem`} role="alert" className="pt-1 text-meta text-danger-ink">
            {problem.message}
          </p>
        ) : null}
      </div>

      {v.kind === "task_block" ? (
        <TaskRow
          task={v.task}
          creating={!!creating}
          dueBy={blockDueBy(v.start)}
          problem={problem?.field === "task" ? problem.message : undefined}
          problemId={id}
          onPick={pickTask}
          onClear={() => set({ kind: "event", task: null })}
        />
      ) : null}

      {full && !timed ? (
        // One 44 px row, its switch at the end, on a phone's sheet and a dialog alike (the shared SwitchRow).
        <SwitchRow
          id={`${id}-allday`}
          label="All day"
          checked={v.allDay}
          onChange={(on) => onChange(withAllDay(v, on))}
          className="min-h-11 px-0 py-1 hover:bg-transparent"
        />
      ) : null}
      {v.allDay ? (
        <>
          <Row label="Starts" htmlFor={`${id}-start`}>
            <DateField id={`${id}-start`} aria-label="Start" value={v.startDate} onChange={(d) => d && set({ startDate: d, lastDate: d > v.lastDate ? d : v.lastDate })} dense />
          </Row>
          <Row label="Ends" htmlFor={`${id}-end`}>
            <DateField id={`${id}-end`} aria-label="End" min={v.startDate} value={v.lastDate} onChange={(d) => d && set({ lastDate: d })} dense aria-invalid={problem?.field === "end" || undefined} />
            {problem?.field === "end" ? <Problem id={id} message={problem.message} /> : null}
          </Row>
        </>
      ) : (
        <>
          <Row label="Starts" htmlFor={`${id}-start`}>
            <DateTimePicker id={`${id}-start`} aria-label="Start" value={v.start} onChange={(d) => onChange(withStart(v, d))} />
          </Row>
          <Row label="Ends" htmlFor={`${id}-end`}>
            <DateTimePicker
              id={`${id}-end`}
              aria-label="End"
              since={v.start}
              value={v.end}
              onChange={(d) => set({ end: d })}
              aria-invalid={problem?.field === "end" || undefined}
              aria-describedby={problem?.field === "end" ? `${id}-problem` : undefined}
            />
            {problem?.field === "end" ? <Problem id={id} message={problem.message} /> : null}
            {meeting ? <GuestHours guests={v.guests} start={v.start} end={v.end} /> : null}
          </Row>
          {full ? (
            <Row label="Time zone">
              <div className="grid gap-0.5">
                <ZonePicker tz={v.zone} onTz={(zone) => set({ zone })} className="-ml-2 w-fit max-w-full" />
                {otherEndZone ? (
                  <ZonePicker tz={v.endZone || v.zone} onTz={(endZone) => set({ endZone })} label="Ends in" className="-ml-2 w-fit max-w-full" />
                ) : (
                  <button type="button" onClick={() => setOtherEndZone(true)} className="w-fit text-meta text-ink-3 hover:text-ink-2 hover:underline" data-touch-target="">
                    Ends in another time zone
                  </button>
                )}
              </div>
            </Row>
          ) : null}
        </>
      )}

      {full && meeting ? (
        <Row label="Repeat" htmlFor={`${id}-repeat`}>
          <RepeatControl id={`${id}-repeat`} start={v.allDay ? new Date(`${v.startDate}T12:00:00`) : v.start} rule={v.rule} onChange={(rule) => set({ rule })} />
        </Row>
      ) : null}

      {meeting ? (
        <Row label="Guests" htmlFor={`${id}-guests`} align="start">
          <GuestRows
            id={`${id}-guests`}
            guests={v.guests}
            onChange={(guests) => set({ guests })}
            allowEmail={full}
            exclude={exclude}
            {...(full && organiser
              ? {
                  permissions: { modify: v.guestsCanModify, invite: v.guestsCanInvite, seeGuests: v.guestsCanSeeGuests },
                  onPermissions: (p) => set({ guestsCanModify: p.modify, guestsCanInvite: p.invite, guestsCanSeeGuests: p.seeGuests }),
                }
              : {})}
          />
        </Row>
      ) : null}

      {creating && meeting && !v.allDay ? (
        <Row label="Free times">
          <FindTimeSuggestions
            participants={v.guests.filter((g) => g.uuid).map((g) => g.uuid)}
            durationMinutes={length}
            selected={v.start}
            onPick={(start, end) => set({ start, end })}
          />
        </Row>
      ) : null}

      {full ? (
        <Row label="Place" htmlFor={`${id}-place`}>
          <Input id={`${id}-place`} value={v.location} onChange={(e) => set({ location: e.target.value })} placeholder="Add a room, an address or a call link" />
        </Row>
      ) : null}

      <Row label="Notes" htmlFor={`${id}-notes`} align="start">
        <textarea
          id={`${id}-notes`}
          rows={3}
          value={v.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Agenda, a call link, anything people should know"
          className="w-full resize-none rounded-lg bg-raised px-2.5 py-2 text-ui text-ink shadow-e1 outline-none placeholder:text-ink-3 focus-visible:focus-halo"
        />
      </Row>

      {full ? (
        <Row label="Reminders" htmlFor={`${id}-reminders`} align="start">
          <ReminderRows id={`${id}-reminders`} reminders={v.reminders} allDay={v.allDay} onChange={(reminders) => set({ reminders })} />
        </Row>
      ) : null}

      <CalendarRow value={v.calendarId} editing={!creating || !full} onChange={(calendarId) => set({ calendarId })} />
      {full && meeting ? (
        <>
          <Row label="Colour">
            <HueRow value={v.hue} onChange={(hue) => set({ hue })} />
          </Row>
          <Row label="Show as" htmlFor={`${id}-show-as`}>
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              <Select value={v.showAs} onValueChange={(showAs) => set({ showAs: showAs as EventFormValues["showAs"] })}>
                <SelectTrigger id={`${id}-show-as`} className={inlineChoice} aria-label="Show as" dense>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="busy">Busy</SelectItem>
                  <SelectItem value="free">Free</SelectItem>
                </SelectContent>
              </Select>
              <Select value={v.visibility} onValueChange={(visibility) => set({ visibility: visibility as EventFormValues["visibility"] })}>
                <SelectTrigger className={inlineChoice} aria-label="Who can see it" dense>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Visible as the calendar is</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Row>
        </>
      ) : null}

      <div className="mt-2 border-t border-line pt-1">
        {v.kind === "task_block" ? null : (
          <>
            <FocusTimeCheckbox
              checked={v.kind === "focus"}
              hint="Pause your notifications while this runs. Someone who really needs you can still use Notify anyway."
              onChange={(on) =>
                set({
                  kind: on ? "focus" : "event",
                  // A block with no name yet is named for what it is; focus time is yours, and runs from a time to a time.
                  ...(on && !v.title.trim() ? { title: "Focus time" } : {}),
                  ...(on ? { allDay: false } : {}),
                })
              }
            />
            <AwayCheckbox
              checked={v.kind === "out_of_office"}
              onChange={(on) => set({ kind: on ? "out_of_office" : "event", ...(on && !v.title.trim() ? { title: "Away" } : {}) })}
            />
            {full && v.kind === "out_of_office" ? (
              // Out of office declines for you while you're away (head 5b, gcal-9b): its rows sit right under
              // the Away switch, indented as its children, so they show where the switch was flipped (DB-25).
              <div className="mb-1 ml-1 border-l-2 border-line pl-3" data-away-rows="">
                <Row label="Invitations" htmlFor={`${id}-ooo-decline`}>
                  <Select value={v.oooDecline} onValueChange={(oooDecline) => set({ oooDecline: oooDecline as OOODecline })}>
                    <SelectTrigger id={`${id}-ooo-decline`} className={inlineChoice} aria-label="While you're away" dense data-ooo-decline="">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Don't decline</SelectItem>
                      <SelectItem value="new">Decline new invitations</SelectItem>
                      <SelectItem value="all">Decline new and existing</SelectItem>
                    </SelectContent>
                  </Select>
                </Row>
                {v.oooDecline !== "none" ? (
                  <Row label="Message" htmlFor={`${id}-ooo-message`} align="start">
                    <Textarea
                      id={`${id}-ooo-message`}
                      value={v.oooMessage}
                      maxLength={500}
                      rows={2}
                      placeholder="I'm away and back on Monday."
                      aria-label="Message with each decline"
                      onChange={(e) => set({ oooMessage: e.target.value })}
                    />
                  </Row>
                ) : null}
              </div>
            ) : null}
          </>
        )}
        {creating && full && v.kind !== "task_block" ? <BlockTimeOption dueBy={blockDueBy(v.start)} onPick={pickTask} /> : null}
        {full && meeting && organiser && v.guests.length > 0 ? (
          <EventOptionCheckbox label="Email me when guests answer" hint="You're told in OneCamp either way." checked={v.emailOnAnswers} onChange={(emailOnAnswers) => set({ emailOnAnswers })} />
        ) : null}
        {creating && googleConnected && !v.rule ? (
          <EventOptionCheckbox label="Add to Google Calendar too" hint="It goes on your Google Calendar as well as here." checked={v.syncToGoogle} onChange={(syncToGoogle) => set({ syncToGoogle })} />
        ) : null}
      </div>
    </div>
    </Layout.Provider>
  )
}

/** One property: a label on the left and its value on the right (stacked on a phone), in the columns of where the form sits. */
function Row({ label, htmlFor, align = "center", children }: { label: string; htmlFor?: string; align?: "center" | "start"; children: React.ReactNode }) {
  const layout = React.useContext(Layout)
  if (layout === "panel") {
    return (
      <div className={fieldRow(align, "mb-2 space-y-0")} data-property-row="">
        <label htmlFor={htmlFor} className={cn(fieldLabel, "sm:flex sm:h-8 sm:items-center")}>
          {label}
        </label>
        <div className="min-w-0">{children}</div>
      </div>
    )
  }
  return (
    <div className={cn("grid gap-1 py-1.5 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-3", align === "start" ? "items-start" : "items-center")} data-property-row="">
      <label htmlFor={htmlFor} className="flex items-center text-ui-sm text-ink-3 sm:h-8">
        {label}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/**
 * The time at each guest's end (calendar A3), for those who keep hours: one
 * quiet line, "10:00 your time · 05:30 for Jonas (London)", when a guest's
 * clock reads otherwise; then who it is outside the working hours of,
 * "That's 21:00 for Jonas, outside their working hours", three at most and
 * then how many more. Notes, not refusals: the event can still be saved.
 */
function GuestHours({ guests, start, end }: { guests: EventFormValues["guests"]; start: Date; end: Date }) {
  const members = guests.filter((g) => g.uuid)
  const hours = usePeopleHours(members.map((g) => g.uuid))
  if (!hours || end <= start) return null
  const first = (g: { name: string }) => g.name.split(" ")[0] || g.name
  const elsewhere = members.filter((g) => hours[g.uuid] && zoneDiffers(start, hours[g.uuid].tz))
  const outside = members.filter((g) => hours[g.uuid] && !inHours(hours[g.uuid], start, end))
  if (!elsewhere.length && !outside.length) return null
  return (
    <div className="grid gap-0.5 pt-1.5">
      {elsewhere.length ? (
        <p className="flex items-start gap-1.5 text-meta text-ink-3" data-guest-times="">
          <Globe className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {[`${clockTime(start)} your time`, ...elsewhere.slice(0, 3).map((g) => `${theirTime(start, hours[g.uuid].tz)} for ${first(g)} (${zoneCity(hours[g.uuid].tz)})`)].join(" · ")}
            {elsewhere.length > 3 ? ` · ${elsewhere.length - 3} more` : ""}
          </span>
        </p>
      ) : null}
      {outside.length ? (
        <div className="grid gap-0.5" role="status" data-outside-hours="">
          {outside.slice(0, 3).map((g) => (
            <p key={g.uuid} className="flex items-start gap-1.5 text-meta text-ink-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning-ink" aria-hidden="true" />
              That&apos;s {theirTime(start, hours[g.uuid].tz)} for {first(g)}, outside their working hours.
            </p>
          ))}
          {outside.length > 3 ? <p className="pl-5 text-meta text-ink-3">And {outside.length - 3} more.</p> : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The task a block is time for (calendar B1): picked from your tasks while the
 * block is new, with where it stands and its project. A block keeps its task
 * once made; taking it off a new one makes it an event again.
 */
function TaskRow({ task, creating, dueBy, problem, problemId, onPick, onClear }: { task: CalendarEventTask | null; creating: boolean; dueBy: Date; problem?: string; problemId: string; onPick: (task: CalendarEventTask) => void; onClear: () => void }) {
  const shown = task ? (
    <>
      <StatusGlyph status={taskGlyphStatus(task.task_status)} size={16} className="shrink-0" />
      <span className="min-w-0 truncate text-ui-sm text-ink-2">
        <span className="font-medium text-ink">{task.task_name || "A task you can no longer see"}</span>
        {task.project_name ? <span className="text-ink-3"> · {task.project_name}</span> : null}
      </span>
    </>
  ) : null
  return (
    <Row label="Task">
      <div className="flex min-w-0 items-center gap-1" data-form-task="">
        {!creating ? (
          <span className="flex min-h-8 min-w-0 items-center gap-2">{shown}</span>
        ) : (
          <>
            <PickTask dueBy={dueBy} onPick={(t) => onPick(blockTaskOf(t))}>
              {task ? (
                <button
                  type="button"
                  aria-label={`Time for ${task.task_name || "a task"}. Change the task`}
                  data-touch-target=""
                  className="-ml-2 flex min-h-8 min-w-0 items-center gap-2 rounded-lg px-2 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {shown}
                </button>
              ) : (
                <Button type="button" variant="ghost" size="sm" className="-ml-2" aria-invalid={problem ? true : undefined} aria-describedby={problem ? `${problemId}-problem` : undefined}>
                  <ListTodo aria-hidden="true" />
                  Choose a task
                </Button>
              )}
            </PickTask>
            {task ? (
              <Button type="button" variant="ghost" size="icon-xs" aria-label="Not for a task" onClick={onClear}>
                <X />
              </Button>
            ) : null}
          </>
        )}
      </div>
      {problem ? <Problem id={problemId} message={problem} /> : null}
    </Row>
  )
}

/** Making a new event time for one of your tasks: an option beside focus time and time off. */
function BlockTimeOption({ dueBy, onPick }: { dueBy: Date; onPick: (task: CalendarEventTask) => void }) {
  const id = React.useId()
  return (
    <PickTask dueBy={dueBy} onPick={(t) => onPick(blockTaskOf(t))}>
      <button
        type="button"
        aria-label="Block time for a task"
        aria-describedby={`${id}-hint`}
        data-event-option=""
        className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between gap-4 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="grid gap-0.5">
          <span className="text-ui font-medium text-ink">Block time for a task</span>
          <span id={`${id}-hint`} className="text-meta leading-snug text-ink-3">
            Time on your calendar for one of your tasks. It shows where the task stands, and counts as busy.
          </span>
        </span>
        <ListTodo aria-hidden="true" className="size-4 shrink-0 text-ink-3" />
      </button>
    </PickTask>
  )
}

function Problem({ id, message }: { id: string; message: string }) {
  return (
    <p id={`${id}-problem`} role="alert" className="pt-1 text-meta text-danger-ink">
      {message}
    </p>
  )
}

/**
 * Which calendar it goes on (calendar A6): your own, or a project's you may
 * add to, in its colour. A new event chooses; an event already made says
 * where it is (moving it to another calendar isn't here yet).
 */
function CalendarRow({ value, editing, onChange }: { value: string; editing: boolean; onChange: (id: string) => void }) {
  const list = useCalendarList()
  const writable = list.filter((c) => c.kind !== "personal" && c.access !== "view")
  const hueOfCal = (c?: { container_kind?: string; container_id?: string }) => (c?.container_kind === "project" && c.container_id ? projectHue(c.container_id) : OWN_HUE)
  const current = list.find((c) => c.id === value)
  const swatch = (hue: string) => <span aria-hidden="true" className={cn(HUE_CLASS[hue as keyof typeof HUE_CLASS], "size-2 shrink-0 rounded-[3px] bg-hue")} />
  if (editing || writable.length === 0) {
    return (
      <Row label="Calendar">
        <span className="flex h-8 items-center gap-2 text-ui text-ink">
          {swatch(hueOfCal(current))}
          {current && current.kind !== "personal" ? current.name : "OneCamp · Personal"}
        </span>
      </Row>
    )
  }
  return (
    <Row label="Calendar" htmlFor="event-calendar">
      <Select value={value || "own"} onValueChange={(id) => onChange(id === "own" ? "" : id)}>
        <SelectTrigger id="event-calendar" className={inlineChoice} aria-label="Calendar" dense>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="own">
            <span className="flex items-center gap-2">{swatch(OWN_HUE)}OneCamp · Personal</span>
          </SelectItem>
          {writable.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              <span className="flex items-center gap-2">{swatch(hueOfCal(c))}{c.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Row>
  )
}


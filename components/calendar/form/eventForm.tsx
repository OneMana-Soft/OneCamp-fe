"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { DateField } from "@/components/ui/date-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ZonePicker } from "@/components/ui/zonePicker"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { CALENDAR_HUE } from "@/components/calendar/calendarTones"
import { RepeatControl } from "@/components/calendar/repeat/repeatControl"
import { FindTimeSuggestions } from "@/components/calendar/findTimeSuggestions"
import { AwayCheckbox, EventOptionCheckbox, FocusTimeCheckbox } from "@/components/calendar/FocusTimeCheckbox"
import { GuestRows } from "@/components/calendar/form/guestRows"
import { ReminderRows } from "@/components/calendar/form/reminderRows"
import { HueRow } from "@/components/calendar/form/hueRow"
import { fieldLabel, fieldRow, inlineChoice } from "@/lib/ui/fieldRow"
import { cn } from "@/lib/utils/helpers/cn"
import { withAllDay, withStart, type EventFormValues } from "@/lib/calendar/eventForm"

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
  problem?: { field: "title" | "end"; message: string } | null
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
 * Rows that don't apply aren't drawn: focus time and time off have no guests
 * and don't repeat; a server with the old stores keeps the fields it has.
 */
export function EventForm({ values: v, onChange, full, organiser, exclude = [], creating, googleConnected, problem, titleClassName, autoFocusTitle, layout = "dialog" }: EventFormProps) {
  const id = React.useId()
  const set = (patch: Partial<EventFormValues>) => onChange({ ...v, ...patch })
  const meeting = v.kind === "event"
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
          placeholder={v.kind === "focus" ? "Focus time" : v.kind === "out_of_office" ? "Away" : "Event title"}
          className={cn("w-full bg-transparent font-display text-title-2 font-semibold text-ink outline-none placeholder:text-ink-3", titleClassName)}
        />
        {problem?.field === "title" ? (
          <p id={`${id}-problem`} role="alert" className="pt-1 text-meta text-danger-ink">
            {problem.message}
          </p>
        ) : null}
      </div>

      {full && v.kind !== "focus" ? (
        <Row label="All day" htmlFor={`${id}-allday`}>
          <div className="flex h-8 items-center">
            <Switch id={`${id}-allday`} checked={v.allDay} onCheckedChange={(on) => onChange(withAllDay(v, on === true))} />
          </div>
        </Row>
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

      <Row label="Calendar">
        <span className="flex h-8 items-center gap-2 text-ui text-ink">
          <span aria-hidden="true" className={cn(HUE_CLASS[CALENDAR_HUE.onecamp], "size-2 rounded-[3px] bg-hue")} />
          OneCamp · Personal
        </span>
      </Row>
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

function Problem({ id, message }: { id: string; message: string }) {
  return (
    <p id={`${id}-problem`} role="alert" className="pt-1 text-meta text-danger-ink">
      {message}
    </p>
  )
}

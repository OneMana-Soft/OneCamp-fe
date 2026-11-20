import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

const makeRequest = vi.hoisted(() => vi.fn(async () => []))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
const calendarList = vi.hoisted(() => ({ value: [] as { id: string; name: string; kind: string; container_kind?: string; container_id?: string; access: string; source?: string; read_only?: boolean }[] }))
vi.mock("@/lib/calendar/calendarList", async (importOriginal) => ({ ...(await importOriginal<object>()), useCalendarList: () => calendarList.value }))
const peopleHours = vi.hoisted(() => ({ value: undefined as import("@/lib/calendar/peopleHours").PeopleDays | undefined, args: [] as unknown[] }))
vi.mock("@/lib/calendar/peopleHours", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/calendar/peopleHours")>()),
  usePeopleHours: (...args: unknown[]) => {
    peopleHours.args = args
    return peopleHours.value
  },
}))
// Rooms (gcal-6): who may book is read from the profile; here a reader who may not, unless a case says otherwise.
const rooms = vi.hoisted(() => ({ mayBook: false, freeArgs: [] as unknown[] }))
vi.mock("@/hooks/useRooms", () => ({
  useMayBookRooms: () => rooms.mayBook,
  useFreeRooms: (...args: unknown[]) => {
    rooms.freeArgs = args
    return { rooms: [], failed: false, retry: () => {} }
  },
  useRoomDirectory: () => ({ rooms: undefined, failed: false, retry: () => {} }),
}))
// The task finder is a chunk of its own; here it offers one task.
vi.mock("@/components/task/taskFinder", () => ({
  TaskFinder: ({ onPick }: { onPick: (t: unknown) => void }) => (
    <button type="button" onClick={() => onPick({ task_uuid: "t-brief", task_name: "Write the launch brief", task_status: "inProgress", task_project: { project_uuid: "p-launch", project_name: "Launch" } })}>
      pick the brief
    </button>
  ),
}))

import { EventForm } from "./eventForm"
import { eventPatch, newEventValues, patchChanges, type EventFormValues } from "@/lib/calendar/eventForm"
import { pinTestClock } from "@/lib/testing/testClock"
import { clockRange, clockTime } from "@/lib/utils/date/clock"
import { format } from "date-fns"

// The reader's day: Thu 15 Oct 2026, 10:20.
pinTestClock(new Date(2026, 9, 15, 10, 20))

afterEach(() => {
  cleanup()
  rooms.mayBook = false
  rooms.freeArgs = []
})

const base = (extra: Partial<EventFormValues> = {}): EventFormValues => ({
  ...newEventValues("Europe/London", new Date(2026, 9, 15, 10, 20)),
  title: "Design review",
  ...extra,
})

/** The form, holding its values as a host does; every change is kept in seen. */
function Form(props: Partial<React.ComponentProps<typeof EventForm>> & { start?: EventFormValues; seen?: EventFormValues[] }) {
  const [v, setV] = React.useState<EventFormValues>(props.start ?? base())
  return (
    <EventForm
      full
      organiser
      {...props}
      values={v}
      onChange={(next) => {
        props.seen?.push(next)
        setV(next)
      }}
    />
  )
}

// A property's label, and All day's, which sits on the shared switch row: label left, switch right, one row.
const rowLabels = () => Array.from(document.querySelectorAll("[data-property-row] > label, [data-setting-row='switch'] label")).map((l) => l.textContent)

describe("the one Event Form", () => {
  it("draws every row where the calendar keeps its own events", () => {
    render(<Form creating />)
    expect(rowLabels()).toEqual(["All day", "Starts", "Ends", "Time zone", "Repeat", "Guests", "Free times", "Place", "Linked", "Notes", "Reminders", "Calendar", "Colour", "Show as"])
    // All day is one row on a phone too, never a label over a lone switch (DESIGN-BUILD-2, 20 Oct).
    const allDay = document.querySelector("[data-setting-row='switch']")
    expect(allDay?.querySelector("[role='switch']")?.getAttribute("aria-checked")).toBe("false")
    expect(allDay?.closest("[data-property-row]")).toBeNull()
  })

  it("asks for the rooms free all through the slot, seating its guests and you: its times, or its whole days on its own clock", () => {
    rooms.mayBook = true
    const guest = (uuid: string, name: string) => ({ uuid, email: "", name, optional: false })
    const start = new Date("2026-10-21T09:00:00Z")
    const end = new Date("2026-10-21T10:30:00Z")
    render(<Form start={base({ start, end, guests: [guest("kai", "Kai Tane"), guest("sam", "Sam Rivera")] })} />)
    expect(rooms.freeArgs).toEqual([start, end, 3])
    cleanup()
    // Kiritimati is UTC+14 all year: its midnights, never the browser's.
    render(<Form start={base({ zone: "Pacific/Kiritimati", allDay: true, startDate: "2026-10-20", lastDate: "2026-10-21" })} />)
    expect(rooms.freeArgs).toEqual([new Date("2026-10-19T10:00:00Z"), new Date("2026-10-21T10:00:00Z"), 1])
  })

  it("offers a room to a member on a meeting in the full form, and asks for no free rooms otherwise", () => {
    rooms.mayBook = true
    render(<Form creating />)
    expect(rowLabels()).toEqual(["All day", "Starts", "Ends", "Time zone", "Repeat", "Guests", "Rooms", "Free times", "Place", "Linked", "Notes", "Reminders", "Calendar", "Colour", "Show as"])
    expect(rooms.freeArgs).toHaveLength(3)
    cleanup()
    rooms.freeArgs = []
    // The short form and your own time have no room row, and look for no rooms.
    render(<Form full={false} creating />)
    expect(rowLabels()).not.toContain("Rooms")
    cleanup()
    render(<Form start={base({ kind: "focus" })} />)
    expect(rowLabels()).not.toContain("Rooms")
    expect(rooms.freeArgs).toEqual([])
  })

  it("keeps to the fields the old stores have elsewhere", () => {
    render(<Form full={false} creating />)
    expect(rowLabels()).toEqual(["Starts", "Ends", "Guests", "Free times", "Notes", "Calendar"])
  })

  it("gives focus time no guests, no repeat and no whole days", () => {
    render(<Form start={base({ kind: "focus" })} />)
    expect(rowLabels()).toEqual(["Starts", "Ends", "Time zone", "Place", "Notes", "Reminders", "Calendar"])
  })

  it("turns the times into their days when it is all day", () => {
    const seen: EventFormValues[] = []
    render(<Form seen={seen} start={base({ start: new Date(2026, 9, 20, 14), end: new Date(2026, 9, 20, 15) })} />)
    fireEvent.click(screen.getByRole("switch", { name: "All day" }))
    expect(seen.at(-1)).toMatchObject({ allDay: true, startDate: "2026-10-20", lastDate: "2026-10-20" })
    expect(screen.queryByRole("button", { name: /^Time zone/ })).toBeNull()
  })

  it("marks a guest optional with a chip by their name, makes them required again, and takes one off", () => {
    const seen: EventFormValues[] = []
    const guests = [
      { uuid: "maya", email: "", name: "Maya", optional: false, response: "accepted" as const },
      { uuid: "", email: "alex@example.com", name: "Alex Kim", optional: false },
    ]
    render(<Form seen={seen} start={base({ guests })} />)
    const list = screen.getByRole("list", { name: "Guests" })
    const maya = within(list).getAllByRole("listitem")[0]
    expect(within(maya).getByText("Maya")).toBeTruthy()
    expect(within(maya).getByText("· going")).toBeTruthy()
    expect(maya.querySelector("[data-optional-chip]")).toBeNull()
    // The state is a chip by the name; the button says what it does.
    fireEvent.click(within(list).getByRole("button", { name: "Mark Maya optional" }))
    expect(seen.at(-1)?.guests[0].optional).toBe(true)
    expect(maya.querySelector("[data-optional-chip]")?.textContent).toBe("Optional")
    expect(within(maya).getByRole("button", { name: "Make Maya required" }).textContent).toBe("Make required")
    fireEvent.click(within(maya).getByRole("button", { name: "Make Maya required" }))
    expect(seen.at(-1)?.guests[0].optional).toBe(false)
    expect(within(maya).getByRole("button", { name: "Mark Maya optional" }).textContent).toBe("Mark optional")
    fireEvent.click(within(list).getByRole("button", { name: "Remove Alex Kim" }))
    expect(seen.at(-1)?.guests.map((g) => g.name)).toEqual(["Maya"])
  })

  it("lets the organiser say what guests can do, changing the event letting them invite others too", () => {
    const seen: EventFormValues[] = []
    render(<Form seen={seen} start={base({ guests: [{ uuid: "maya", email: "", name: "Maya", optional: false }], guestsCanInvite: false })} />)
    const can = screen.getByRole("group", { name: "Guests can" })
    fireEvent.click(within(can).getByRole("checkbox", { name: "Change the event" }))
    expect(seen.at(-1)).toMatchObject({ guestsCanModify: true, guestsCanInvite: true })
    expect(within(can).getByRole("checkbox", { name: "Invite others" }).hasAttribute("disabled")).toBe(true)
  })

  it("gives a guest who may change it no say in what guests can do", () => {
    render(<Form organiser={false} start={base({ guests: [{ uuid: "maya", email: "", name: "Maya", optional: false }] })} />)
    expect(screen.queryByRole("group", { name: "Guests can" })).toBeNull()
    expect(screen.queryByRole("switch", { name: /Email me when guests answer/ })).toBeNull()
  })

  it("writes the default reminder, then says it is the reader's default; a change makes them theirs", () => {
    const seen: EventFormValues[] = []
    render(<Form seen={seen} />)
    expect(screen.getByRole("combobox", { name: "Reminder 1" }).textContent).toBe("10 minutes before · your default")
    fireEvent.click(screen.getByRole("button", { name: "Add a reminder" }))
    expect(seen.at(-1)?.reminders).toHaveLength(2)
    expect(seen.at(-1)?.reminders?.[0]).toBe(10)
    expect(screen.getByRole("combobox", { name: "Reminder 1" }).textContent).toBe("10 minutes before")
    // Its way off is the row's last thing: an icon, named.
    const first = document.querySelectorAll("[data-form-reminder]")[0] as HTMLElement
    expect(first.lastElementChild?.getAttribute("aria-label")).toBe("Remove reminder")
    fireEvent.click(within(first).getByRole("button", { name: "Remove reminder" }))
    expect(seen.at(-1)?.reminders).toHaveLength(1)
  })

  it("sends a reminder by email, sets a custom one up to four weeks, and shows the calendar's default (head A)", () => {
    const seen: EventFormValues[] = []
    const choose = (trigger: string, option: string | RegExp) => {
      act(() => {
        fireEvent.keyDown(screen.getByRole("combobox", { name: trigger }), { key: "ArrowDown" })
      })
      act(() => {
        fireEvent.keyDown(screen.getByRole("option", { name: option }), { key: "Enter" })
      })
    }
    render(<Form seen={seen} defaultReminders={{ mine: { timed: { minutes: [30], email: [30] } } }} />)
    // A new event shows the reader's default for their own calendar, its way too.
    expect(screen.getByRole("combobox", { name: "Reminder 1" }).textContent).toBe("30 minutes before · your default")
    expect(screen.getByRole("combobox", { name: "Reminder 1 comes as" }).textContent).toBe("Email")
    choose("Reminder 1 comes as", "Pop-up")
    expect(seen.at(-1)).toMatchObject({ reminders: [30], reminderEmail: [] })
    choose("Reminder 1 comes as", "Email")
    expect(seen.at(-1)).toMatchObject({ reminders: [30], reminderEmail: [30] })
    // Custom: 2 weeks; past four weeks it says why and sets nothing.
    choose("Reminder 1", "Custom…")
    const count = screen.getByRole("spinbutton", { name: "How many" })
    fireEvent.change(count, { target: { value: "5" } })
    choose("Unit", "weeks before")
    expect(screen.getByRole("alert").textContent).toBe("Up to 4 weeks before, in whole numbers.")
    expect((screen.getByRole("button", { name: "Set" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(count, { target: { value: "2" } })
    fireEvent.click(screen.getByRole("button", { name: "Set" }))
    // The reminder keeps its way: by email.
    expect(seen.at(-1)).toMatchObject({ reminders: [2 * 7 * 24 * 60], reminderEmail: [2 * 7 * 24 * 60] })
    expect(screen.getByRole("combobox", { name: "Reminder 1" }).textContent).toBe("2 weeks before")
  })

  it("gives Place the field its neighbours have, and Show as values that say they open", () => {
    render(<Form />)
    const place = screen.getByRole("textbox", { name: "Place" })
    expect(place.className).toMatch(/\bfield-surface\b/)
    expect(place.className).not.toMatch(/(^|\s)bg-transparent(\s|$)/)
    for (const name of ["Show as", "Who can see it"]) {
      const value = screen.getByRole("combobox", { name })
      expect(value.className).not.toMatch(/\[&>svg\]:opacity-0/)
      expect(value.className).toMatch(/pointer-coarse:h-11/)
      expect(value.querySelector("svg")).toBeTruthy()
    }
  })

  it("shows notes kept as rich text as text, line breaks and all", () => {
    render(<Form start={base({ notes: "Walk the checklist.\nThen decide.", notesKept: "<p>Walk the checklist.</p><p>Then decide.</p>" })} />)
    expect((screen.getByRole("textbox", { name: "Notes" }) as HTMLTextAreaElement).value).toBe("Walk the checklist.\nThen decide.")
  })

  it("offers an all-day event's reminders as times of day", () => {
    render(<Form start={base({ allDay: true, startDate: "2026-10-20", lastDate: "2026-10-20" })} />)
    expect(screen.getByRole("combobox", { name: "Reminder 1" }).textContent).toBe(`The day before at ${clockTime("09:00")} · your default`)
  })

  it("picks a colour from named swatches, by click or arrow key", () => {
    const seen: EventFormValues[] = []
    render(<Form seen={seen} />)
    const colours = screen.getByRole("radiogroup", { name: "Colour" })
    // The calendar's own colour is hollow, a ring in its hue, and says which it is.
    const calendar = within(colours).getByRole("radio", { name: "Calendar colour (Sun)" })
    expect(calendar.getAttribute("aria-checked")).toBe("true")
    expect(calendar.getAttribute("title")).toBe("Calendar colour (Sun)")
    expect(calendar.className).toMatch(/\bborder-2\b.*\bborder-hue\b/)
    expect(calendar.className).not.toMatch(/\bbg-hue\b/)
    expect(within(colours).getByRole("radio", { name: "Sky" }).className).toMatch(/\bbg-hue\b/)
    fireEvent.click(within(colours).getByRole("radio", { name: "Moss" }))
    expect(seen.at(-1)?.hue).toBe("moss")
    fireEvent.keyDown(within(colours).getByRole("radio", { name: "Moss" }), { key: "ArrowRight" })
    expect(seen.at(-1)?.hue).toBe("sun")
  })

  // Calendar A3: a time outside a guest's working hours, at their own time.
  it("says when a time is outside a guest's working hours, at their time", () => {
    peopleHours.value = { hours: { maya: { tz: "Asia/Kolkata", week: { "1": [{ start: "10:00", end: "18:30" }] } } }, where: {} }
    // Monday 19 Oct 2026, 15:00 to 16:00 UTC: 20:30 in India.
    render(<Form start={base({ start: new Date("2026-10-19T15:00:00Z"), end: new Date("2026-10-19T16:00:00Z"), guests: [{ uuid: "maya", email: "", name: "Maya Chen", optional: false }] })} />)
    expect(document.querySelector("[data-outside-hours]")?.textContent).toMatch(/^That's (20:30|8:30\sPM) for Maya, outside their working hours\.$/)
    peopleHours.value = undefined
  })

  // Calendar A3: "10:00 your time · 05:30 for Jonas (London)".
  it("says the time at a guest's end when their clock reads otherwise, and nothing when it doesn't", () => {
    const start = new Date("2026-10-19T15:00:00Z")
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone
    peopleHours.value = {
      hours: {
        kai: { tz: "Pacific/Kiritimati", week: { "2": [{ start: "00:00", end: "23:59" }] } },
        sam: { tz: here, week: { "1": [{ start: "00:00", end: "23:59" }] } },
      },
      where: {},
    }
    const guest = (uuid: string, name: string) => ({ uuid, email: "", name, optional: false })
    render(<Form start={base({ zone: here, start, end: new Date("2026-10-19T15:30:00Z"), guests: [guest("kai", "Kai Tane"), guest("sam", "Sam Rivera")] })} />)
    // Kiritimati is 14 hours ahead of UTC: 05:00 on Tuesday.
    expect(document.querySelector("[data-guest-times]")?.textContent).toBe(`${clockTime(start)} your time · ${clockTime(new Date(2000, 0, 1, 5, 0))} for Kai (Kiritimati)`)
    cleanup()
    // An event kept in another zone says the reader's time once, under its times (V-642): the guests' line doesn't again.
    render(<Form start={base({ zone: here === "Pacific/Chatham" ? "Asia/Tokyo" : "Pacific/Chatham", start, end: new Date("2026-10-19T15:30:00Z"), guests: [guest("kai", "Kai Tane")] })} />)
    expect(document.querySelector("[data-your-time]")?.textContent).toMatch(/ your time$/)
    expect(document.querySelector("[data-guest-times]")?.textContent).toBe(`${clockTime(new Date(2000, 0, 1, 5, 0))} for Kai (Kiritimati)`)
    cleanup()
    peopleHours.value = { hours: { sam: peopleHours.value.hours.sam }, where: {} }
    render(<Form start={base({ start, end: new Date("2026-10-19T15:30:00Z"), guests: [guest("sam", "Sam Rivera")] })} />)
    expect(document.querySelector("[data-guest-times]")).toBeNull()
    peopleHours.value = undefined
  })

  it("says what stops a save at its field", () => {
    // The form says the problem its values have: these end an hour before they start.
    const ends = base()
    render(<Form problem={{ field: "end", message: "It has to end after it starts" }} start={{ ...ends, end: new Date(ends.start.getTime() - 3_600_000) }} />)
    expect(screen.getByRole("alert").textContent).toBe("It has to end after it starts")
    expect(screen.getByLabelText(/^End(,|$)/).getAttribute("aria-invalid")).toBe("true")
  })

  it("names a new block for what it is", () => {
    const seen: EventFormValues[] = []
    render(<Form seen={seen} start={base({ title: "" })} />)
    fireEvent.click(screen.getByRole("switch", { name: /^Focus time/ }))
    expect(seen.at(-1)).toMatchObject({ kind: "focus", title: "Focus time", allDay: false })
  })

  // Calendar A6: a new event goes on your calendar, or a project's you may add to.
  it("puts a new event on a project's calendar you may add to, and says where one already is", () => {
    calendarList.value = [
      { id: "own", name: "Personal", kind: "personal", access: "manage" },
      { id: "c-launch", name: "Launch", kind: "project", container_kind: "project", container_id: "p-1", access: "edit" },
      { id: "c-site", name: "Site", kind: "project", container_kind: "project", container_id: "p-2", access: "view" },
    ]
    const seen: EventFormValues[] = []
    render(<Form creating seen={seen} />)
    const picker = screen.getByRole("combobox", { name: "Calendar" })
    expect(picker.textContent).toContain("OneCamp · Personal")
    cleanup()
    render(<Form start={{ ...base(), calendarId: "c-launch" }} />)
    expect(screen.queryByRole("combobox", { name: "Calendar" })).toBeNull()
    expect(screen.getByText("Launch")).toBeTruthy()
    calendarList.value = []
  })

  // V-594: a calendar Google or Outlook lets OneCamp only read is no home for a new event: its push would be refused.
  it("leaves a calendar read-only in its provider out of a new event's choice, and says a refused one at the Calendar row", () => {
    calendarList.value = [
      { id: "own", name: "Personal", kind: "personal", access: "manage" },
      { id: "c-g", name: "Team holidays", kind: "external", access: "manage", source: "google", read_only: true },
    ]
    render(<Form creating />)
    // Nowhere else to put it: the row says where it goes, with no choice.
    expect(screen.queryByRole("combobox", { name: "Calendar" })).toBeNull()
    expect(screen.getByText("OneCamp · Personal")).toBeTruthy()
    cleanup()
    calendarList.value = [...calendarList.value, { id: "c-launch", name: "Launch", kind: "project", container_kind: "project", container_id: "p-1", access: "edit", source: "onecamp" }]
    const msg = "This calendar is read-only in Google. Put the event on another calendar."
    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView")
    render(<Form creating start={base({ calendarId: "c-launch" })} problem={{ field: "calendar", message: msg, calendar: "c-launch" }} />)
    const picker = screen.getByRole("combobox", { name: "Calendar" })
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toBe(msg)
    expect(picker.getAttribute("aria-invalid")).toBe("true")
    expect(document.getElementById(picker.getAttribute("aria-describedby") ?? "")?.textContent).toBe(msg)
    // DESIGN-BUILD-123 F3: the row and its words come into view (not cut under the footer), and the picker has the focus.
    expect(scrolled).toHaveBeenCalledWith({ block: "nearest" })
    const row = scrolled.mock.contexts.at(-1) as Element
    expect(row.contains(picker) && row.contains(alert)).toBe(true)
    expect(document.activeElement).toBe(picker)
    // Said once: typing elsewhere keeps the focus where it is.
    const title = screen.getByRole("textbox", { name: "Title" })
    title.focus()
    fireEvent.change(title, { target: { value: "Offsite plan" } })
    expect(document.activeElement).toBe(title)
    scrolled.mockRestore()
    cleanup()
    // Another calendar picked since: the refusal was that one's.
    render(<Form creating start={base({ calendarId: "" })} problem={{ field: "calendar", message: msg, calendar: "c-launch" }} />)
    expect(screen.queryByRole("alert")).toBeNull()
    calendarList.value = []
  })
})


// Time for a task (calendar B1, gcal-new-task-blocks): a new event can be
// made a block of time for one of your tasks; a block is yours alone, so it
// has no guests, no repeat and no free times to find, and it keeps its task.
describe("time for a task", () => {
  const TASK = { task_uuid: "t-brief", task_name: "Write the launch brief", task_status: "inProgress", project_uuid: "p-launch", project_name: "Launch" }

  it("makes a new event time for the task picked, named for it", async () => {
    const seen: EventFormValues[] = []
    render(<Form seen={seen} creating start={base({ title: "", guests: [{ uuid: "maya", email: "", name: "Maya", optional: false }] })} />)
    fireEvent.click(screen.getByRole("button", { name: "Block time for a task" }))
    fireEvent.click(await screen.findByRole("button", { name: "pick the brief" }))
    expect(seen.at(-1)).toMatchObject({ kind: "task_block", task: TASK, title: "Write the launch brief", allDay: false, guests: [] })
    expect(rowLabels()).toEqual(["Task", "Starts", "Ends", "Time zone", "Place", "Notes", "Reminders", "Calendar"])
    expect(screen.queryByRole("switch", { name: /^Focus time/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "Block time for a task" })).toBeNull()
  })

  it("is an event again once the task is taken off, keeping its title", async () => {
    const seen: EventFormValues[] = []
    render(<Form seen={seen} creating start={base({ kind: "task_block", task: TASK, title: "Outline" })} />)
    expect(within(document.querySelector("[data-form-task]") as HTMLElement).getByText("Write the launch brief")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Not for a task" }))
    expect(seen.at(-1)).toMatchObject({ kind: "event", task: null, title: "Outline" })
    expect(screen.getByRole("button", { name: "Block time for a task" })).toBeTruthy()
  })

  it("keeps a block's task as it is when the block is changed", () => {
    render(<Form start={base({ kind: "task_block", task: TASK })} />)
    expect(document.querySelector("[data-form-task]")?.textContent).toContain("Write the launch brief · Launch")
    expect(screen.queryByRole("button", { name: "Not for a task" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Block time for a task" })).toBeNull()
  })

  it("says when the task is missing, at its row", () => {
    render(<Form creating start={base({ kind: "task_block", task: null })} problem={{ field: "task", message: "Choose the task this is time for" }} />)
    expect(screen.getByRole("alert").textContent).toBe("Choose the task this is time for")
    expect(screen.getByRole("button", { name: "Choose a task" }).getAttribute("aria-invalid")).toBe("true")
  })

  it("isn't offered where the calendar keeps the old stores", () => {
    render(<Form full={false} creating />)
    expect(screen.queryByRole("button", { name: "Block time for a task" })).toBeNull()
  })

  // Own time isn't time for a task (DB-50's rule, for every kind of it): while Focus time, Away or a working
  // location is on, the row is gone, and it comes back when the switch is off.
  it.each(["Focus time", "Away", "Working location"])("isn't offered while %s is on", (kind) => {
    const seen: EventFormValues[] = []
    render(<Form seen={seen} creating start={base({ title: "" })} />)
    const blockTime = () => screen.queryByRole("button", { name: "Block time for a task" })
    expect(blockTime()).not.toBeNull()
    const own = screen.getByRole("switch", { name: new RegExp(`^${kind}`) })
    fireEvent.click(own)
    expect(seen.at(-1)?.kind).not.toBe("event")
    expect(blockTime()).toBeNull()
    fireEvent.click(own)
    expect(seen.at(-1)).toMatchObject({ kind: "event" })
    expect(blockTime()).not.toBeNull()
  })
})

describe("a working location (head 5d)", () => {
  it("is a choice after Away that makes it a whole-day place, with only the rows a place has", () => {
    const seen: EventFormValues[] = []
    render(<Form seen={seen} creating googleConnected start={base({ title: "", start: new Date(2026, 9, 20, 14), end: new Date(2026, 9, 20, 15) })} />)
    const options = Array.from(document.querySelectorAll("[data-event-option] label > span:first-child")).map((s) => s.textContent)
    expect(options.slice(0, 3)).toEqual(["Focus time", "Away", "Working location"])
    const blockTime = () => screen.queryByRole("button", { name: "Block time for a task" })
    expect(blockTime()).not.toBeNull()
    const place = screen.getByRole("switch", { name: /^Working location/ })
    fireEvent.click(place)
    expect(seen.at(-1)).toMatchObject({ kind: "working_location", allDay: true, startDate: "2026-10-20", lastDate: "2026-10-20" })
    expect(screen.getByLabelText("Title").getAttribute("placeholder")).toBe("Where you're working")
    expect(rowLabels()).toEqual(["All day", "Starts", "Ends", "Repeat", "Notes", "Calendar", "Place"])
    expect(screen.queryByRole("switch", { name: /^Add to Google Calendar too/ })).toBeNull()
    // Where you are all day isn't time for a task (DB-50): its row goes while the switch is on, and comes back off.
    expect(blockTime()).toBeNull()
    fireEvent.click(place)
    expect(seen.at(-1)).toMatchObject({ kind: "event" })
    expect(blockTime()).not.toBeNull()
  })

  it("picks Home or Office as its place, and a press on the one picked clears it", () => {
    const seen: EventFormValues[] = []
    render(<Form seen={seen} start={base({ kind: "working_location", title: "", allDay: true })} />)
    const place = within(document.querySelector("[data-place-rows]") as HTMLElement)
    fireEvent.click(place.getByRole("button", { name: "Home" }))
    expect(seen.at(-1)?.title).toBe("Home")
    expect(place.getByRole("button", { name: "Home" }).getAttribute("aria-pressed")).toBe("true")
    expect(place.getByRole("button", { name: "Office" }).getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(place.getByRole("button", { name: "Home" }))
    expect(seen.at(-1)?.title).toBe("")
  })

  it("says where guests work that day, three at most", () => {
    peopleHours.value = { hours: {}, where: { maya: "Home", jonas: "Lisbon office", kai: "Office", sam: "Home" } }
    const guest = (uuid: string, name: string) => ({ uuid, email: "", name, optional: false })
    const guests = [guest("maya", "Maya Chen"), guest("lee", "Lee Park"), guest("jonas", "Jonas Weber"), guest("kai", "Kai Tane"), guest("sam", "Sam Rivera")]
    render(<Form start={base({ start: new Date(2026, 9, 19, 15), end: new Date(2026, 9, 19, 16), guests })} />)
    expect(peopleHours.args).toEqual([["maya", "lee", "jonas", "kai", "sam"], "2026-10-19"])
    expect(document.querySelector("[data-guest-where]")?.textContent).toBe("Maya: Home · Jonas: Lisbon office · Kai: Office · 1 more")
    peopleHours.value = undefined
  })
})

// DB-51 (5d's read): its host (the create dialog, the panel's edit) says a problem when Create or Save is pressed, and
// the alert stayed after the form was put right. Once one is said, the form says the problem as the form stands.
describe("a problem the form says", () => {
  const alert = () => screen.queryByRole("alert")?.textContent ?? null

  it("goes as soon as the title is given, and comes back if it's cleared", () => {
    render(<Form creating problem={{ field: "title", message: "Give it a title" }} start={base({ title: "" })} />)
    expect(alert()).toBe("Give it a title")
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Planning" } })
    expect(alert()).toBeNull()
    expect(screen.getByLabelText("Title").getAttribute("aria-invalid")).toBeNull()
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: " " } })
    expect(alert()).toBe("Give it a title")
  })

  it("goes when a working location's place is picked", () => {
    render(<Form creating problem={{ field: "title", message: "Say where you're working" }} start={base({ kind: "working_location", title: "", allDay: true })} />)
    expect(alert()).toBe("Say where you're working")
    fireEvent.click(within(document.querySelector("[data-place-rows]") as HTMLElement).getByRole("button", { name: "Home" }))
    expect(alert()).toBeNull()
  })
})

// CR-113 S1: Focus time, Away and Working location could be switched on while editing a meeting with guests, and the
// save was refused. The event's read says which own time a save keeping its guests can't make it, in the words the save
// is refused with (own_time_refused); the form offers only the rest and says why on each switch it can't offer.
describe("own time the server refuses", () => {
  const REFUSED = {
    focus: "Focus time is yours alone: it has no guests.",
    out_of_office: "An out of office is yours alone: it has no guests.",
    working_location: "A working location is yours alone: it has no guests.",
  }
  const guests = [{ uuid: "maya", email: "", name: "Maya", optional: false }]
  // The ink of a switch row's name. A refused row reads as off, its name dimmed as a disabled setting's is (the shared
  // SwitchRow's RowWords; DB-52); the server's words keep their own ink-3.
  const nameInk = (own: HTMLElement) =>
    (own.closest("[data-event-option]")?.querySelector("label > span:first-child")?.className ?? "").split(/\s+/).filter((c) => c.startsWith("text-ink"))

  it.each([
    ["Focus time", "focus"],
    ["Away", "out_of_office"],
    ["Working location", "working_location"],
  ] as const)("%s can't be switched on, and its switch says why", (label, kind) => {
    const seen: EventFormValues[] = []
    render(<Form seen={seen} ownTimeRefused={REFUSED} start={base({ guests })} />)
    const own = screen.getByRole("switch", { name: new RegExp(`^${label}`) })
    expect(own.hasAttribute("disabled")).toBe(true)
    expect(own.getAttribute("aria-checked")).toBe("false")
    expect(document.getElementById(own.getAttribute("aria-describedby") ?? "")?.textContent).toBe(REFUSED[kind])
    expect(nameInk(own)).toEqual(["text-ink-3"])
    fireEvent.click(own)
    expect(seen).toEqual([])
  })

  it("offers every switch when the server refuses none", () => {
    render(<Form start={base({ guests })} />)
    for (const label of ["Focus time", "Away", "Working location"]) {
      const own = screen.getByRole("switch", { name: new RegExp(`^${label}`) })
      expect(own.hasAttribute("disabled")).toBe(false)
      expect(nameInk(own)).toEqual(["text-ink"])
    }
  })
})

// V-642: an event's times are read and written in its own zones, Starts in its zone and Ends in its end's, as Google's
// form does; the reader's own time is one quiet line under them when it reads otherwise. A New York event at 12:30Z,
// landing in London, read in Kolkata, said "Starts Fri 6 Nov · 6:00 PM" beside "Eastern Standard Time".
describe("times in the event's own zones", () => {
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone
  const start = new Date("2026-11-06T12:30:00Z")
  const end = new Date("2026-11-06T13:30:00Z")
  const flight = () => base({ zone: "America/New_York", endZone: "Europe/London", start, end })
  const wall = (h: number, m = 0) => clockTime(new Date(2000, 0, 1, h, m))
  const named = (zone: string, name: string) => (zone === here ? "" : ` ${name}`)
  const pickTime = (field: string, h: number, m = 0) => {
    fireEvent.click(screen.getByLabelText(new RegExp(`^${field}(,|$)`)))
    fireEvent.click(screen.getAllByRole("option").find((o) => (o.textContent ?? "").startsWith(wall(h, m)))!)
  }

  it("reads a New York event at 7:30 AM in New York and its end in London, with the reader's time beneath", () => {
    render(<Form start={flight()} />)
    expect(screen.getByLabelText(/^Start(,|$)/).textContent).toBe(`Fri 6 Nov · ${wall(7, 30)}${named("America/New_York", "EST")}`)
    expect(screen.getByLabelText(/^End(,|$)/).textContent).toBe(`Fri 6 Nov · ${wall(13, 30)}${named("Europe/London", "GMT")}`)
    // The end's list counts from the start on the end's own clock: 12:30 in London.
    fireEvent.click(screen.getByLabelText(/^End(,|$)/))
    expect(screen.getAllByRole("option")[0].textContent).toMatch(new RegExp(`^${wall(12, 45)}.*15 min`))
    expect(document.querySelector("[data-your-time]")?.textContent).toBe(`${clockRange(start, end)} your time`)
  })

  // V-642 F1 + F2 (DESIGN-BUILD-120): two clocks with no names read as one. Each time names its zone where it isn't
  // the reader's, the two zone pickers say which end each sets, and a screen reader hears each time with its zone and
  // the end's with the reader's own time.
  it("names each time's zone where it isn't the reader's, says which end each zone sets, and describes End by the reader's time", () => {
    render(<Form start={flight()} />)
    const start = screen.getByLabelText(/^Start(,|$)/)
    const end = screen.getByLabelText(/^End(,|$)/)
    expect(start.getAttribute("aria-label")).toBe(`Start, Fri 6 Nov, ${wall(7, 30)}${named("America/New_York", "Eastern Standard Time")}`)
    expect(end.getAttribute("aria-label")).toBe(`End, Fri 6 Nov, ${wall(13, 30)}${named("Europe/London", "Greenwich Mean Time")}`)
    expect(screen.getByText("Starts in")).toBeTruthy()
    expect(screen.getByText("Ends in")).toBeTruthy()
    const yours = document.querySelector("[data-your-time]")
    expect(yours?.id).toBeTruthy()
    expect(end.getAttribute("aria-describedby")).toBe(yours?.id)
  })

  it("sends the same instants when its time is picked again, and a time picked in its zone", () => {
    const seen: EventFormValues[] = []
    const was = flight()
    render(<Form seen={seen} start={was} />)
    pickTime("Start", 7, 30)
    expect([seen.at(-1)?.start, seen.at(-1)?.end]).toEqual([start, end])
    expect(patchChanges(eventPatch(seen.at(-1)!, was, 3, true))).toBe(false)
    // 9:00 AM in New York is 14:00Z, and the end keeps the hour.
    pickTime("Start", 9)
    expect([seen.at(-1)?.start, seen.at(-1)?.end]).toEqual([new Date("2026-11-06T14:00:00Z"), new Date("2026-11-06T15:00:00Z")])
    // 4:00 PM in London is 16:00Z.
    pickTime("End", 16)
    expect(seen.at(-1)?.end).toEqual(new Date("2026-11-06T16:00:00Z"))
  })

  it("says no time of the reader's when the event keeps their zone", () => {
    render(<Form start={base({ zone: here, endZone: "", start, end })} />)
    expect(screen.getByLabelText(/^Start(,|$)/).textContent).toBe(`${format(start, "EEE d MMM")} · ${clockTime(start)}`)
    expect(document.querySelector("[data-your-time]")).toBeNull()
    expect(screen.queryByText("Starts in")).toBeNull()
  })

  it("phrases its repeats from its own day: 8 PM on Friday in New York is Saturday in Kolkata", () => {
    render(<Form start={base({ zone: "America/New_York", start: new Date("2026-11-07T01:00:00Z"), end: new Date("2026-11-07T02:00:00Z"), rule: "FREQ=YEARLY" })} />)
    expect(screen.getByRole("combobox", { name: "Repeat" }).textContent).toBe("Annually on 6 November")
  })

  it("turns into its days in its own zone when it is all day", () => {
    const seen: EventFormValues[] = []
    render(<Form seen={seen} start={base({ zone: "America/New_York", start: new Date("2026-11-07T01:00:00Z"), end: new Date("2026-11-07T02:00:00Z") })} />)
    fireEvent.click(screen.getByRole("switch", { name: "All day" }))
    expect(seen.at(-1)).toMatchObject({ allDay: true, startDate: "2026-11-06", lastDate: "2026-11-06" })
  })
})

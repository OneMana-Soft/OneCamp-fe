import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

const makeRequest = vi.hoisted(() => vi.fn(async () => []))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
const calendarList = vi.hoisted(() => ({ value: [] as { id: string; name: string; kind: string; container_kind?: string; container_id?: string; access: string }[] }))
vi.mock("@/lib/calendar/calendarList", () => ({ useCalendarList: () => calendarList.value }))
const peopleHours = vi.hoisted(() => ({ value: undefined as Record<string, { tz: string; week: Record<string, { start: string; end: string }[]> }> | undefined }))
vi.mock("@/lib/calendar/peopleHours", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/calendar/peopleHours")>()),
  usePeopleHours: () => peopleHours.value,
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
import { newEventValues, type EventFormValues } from "@/lib/calendar/eventForm"
import { pinTestClock } from "@/lib/testing/testClock"
import { clockTime } from "@/lib/utils/date/clock"

// The reader's day: Thu 15 Oct 2026, 10:20.
pinTestClock(new Date(2026, 9, 15, 10, 20))

afterEach(cleanup)

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
    expect(rowLabels()).toEqual(["All day", "Starts", "Ends", "Time zone", "Repeat", "Guests", "Free times", "Place", "Notes", "Reminders", "Calendar", "Colour", "Show as"])
    // All day is one row on a phone too, never a label over a lone switch (DESIGN-BUILD-2, 20 Oct).
    const allDay = document.querySelector("[data-setting-row='switch']")
    expect(allDay?.querySelector("[role='switch']")?.getAttribute("aria-checked")).toBe("false")
    expect(allDay?.closest("[data-property-row]")).toBeNull()
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
    peopleHours.value = { maya: { tz: "Asia/Kolkata", week: { "1": [{ start: "10:00", end: "18:30" }] } } }
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
      kai: { tz: "Pacific/Kiritimati", week: { "2": [{ start: "00:00", end: "23:59" }] } },
      sam: { tz: here, week: { "1": [{ start: "00:00", end: "23:59" }] } },
    }
    const guest = (uuid: string, name: string) => ({ uuid, email: "", name, optional: false })
    render(<Form start={base({ start, end: new Date("2026-10-19T15:30:00Z"), guests: [guest("kai", "Kai Tane"), guest("sam", "Sam Rivera")] })} />)
    // Kiritimati is 14 hours ahead of UTC: 05:00 on Tuesday.
    expect(document.querySelector("[data-guest-times]")?.textContent).toBe(`${clockTime(start)} your time · ${clockTime(new Date(2000, 0, 1, 5, 0))} for Kai (Kiritimati)`)
    cleanup()
    peopleHours.value = { sam: peopleHours.value.sam }
    render(<Form start={base({ start, end: new Date("2026-10-19T15:30:00Z"), guests: [guest("sam", "Sam Rivera")] })} />)
    expect(document.querySelector("[data-guest-times]")).toBeNull()
    peopleHours.value = undefined
  })

  it("says what stops a save at its field", () => {
    render(<Form problem={{ field: "end", message: "It has to end after it starts" }} />)
    expect(screen.getByRole("alert").textContent).toBe("It has to end after it starts")
    expect(screen.getByLabelText("End").getAttribute("aria-invalid")).toBe("true")
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
})

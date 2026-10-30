import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { GlanceLine, glanceNext, glanceOf, glanceText } from "@/components/home/GlanceLine"
import type { NeedsItem } from "@/components/home/needsMe"
import { pinTestClock } from "@/lib/testing/testClock"

/**
 * Home's summary sentence (hub.md H4): what needs you, then what's next.
 * Unread channels and DMs left it for the sidebar.
 */
afterEach(cleanup)
// The next meeting is read against the clock (glanceNext): one afternoon for the whole file.
pinTestClock(new Date(2026, 9, 21, 15, 10))

const zero = { tasksDue: 0, overdue: 0, mentions: 0, agentRequests: 0 }
const next = { title: "Launch sync", time: "11:00" }

describe("the summary sentence", () => {
  it("puts what needs you before the next event", () => {
    expect(glanceText({ tasksDue: 1, overdue: 1, mentions: 1, agentRequests: 2 }, next)).toBe(
      "1 task due today, 1 overdue · 1 mention waiting · 2 agent requests · Next: Launch sync at 11:00",
    )
    const { container } = render(<GlanceLine counts={{ tasksDue: 1, overdue: 0, mentions: 1, agentRequests: 1 }} next={next} />)
    expect(container.textContent).toBe("1 task due today · 1 mention waiting · 1 agent request · Next: Launch sync at 11:00")
  })

  it("never counts unread channels or DMs", () => {
    const { container } = render(<GlanceLine counts={{ ...zero, tasksDue: 2 }} />)
    expect(container.textContent).not.toMatch(/unread|channel|message/)
  })

  it("has exact words when nothing needs you", () => {
    expect(glanceText(zero, next)).toBe("Nothing needs you. Next up: Launch sync at 11:00.")
    expect(glanceText(zero)).toBe("Nothing needs you today.")
    const { container } = render(<GlanceLine counts={zero} next={next} />)
    expect(container.textContent).toBe("Nothing needs you. Next up: Launch sync at 11:00.")
  })

  // At 390 "· 1" ended one line and "mention waiting" began the next
  // (DESIGN-BUILD-3): a line breaks only between facts, and never starts with ·.
  it("keeps each fact whole, its separator with it", () => {
    const { container } = render(<GlanceLine counts={{ tasksDue: 2, overdue: 1, mentions: 1, agentRequests: 0 }} next={next} />)
    const units = [...container.querySelectorAll("[data-glance] > [data-fact]")]
    expect(units.map((u) => u.textContent)).toEqual(["2 tasks due today,", "1 overdue ·", "1 mention waiting ·", "Next: Launch sync at 11:00"])
    for (const u of units.slice(0, -1)) expect(u.className.split(" ")).toContain("whitespace-nowrap")
    for (const u of units) expect(u.textContent!.startsWith("·")).toBe(false)
    expect(container.textContent).toBe("2 tasks due today, 1 overdue · 1 mention waiting · Next: Launch sync at 11:00")
  })

  // At 390 the line broke after "Now:", which ended a line alone (DESIGN-BUILD-11's SF2, DESIGN-BUILD-15):
  // on a phone each clause is a line of its own, with no separators to end lines on.
  it("stacks one clause per line on a phone", () => {
    const running = { title: "Design review", time: "3:30 PM", running: true }
    const { container } = render(<GlanceLine stacked counts={{ tasksDue: 2, overdue: 1, mentions: 1, agentRequests: 0 }} next={running} />)
    const units = [...container.querySelectorAll("[data-glance] > [data-fact]")]
    expect(units.map((u) => u.textContent)).toEqual(["2 tasks due today", "1 overdue", "1 mention waiting", "Now: Design review, until 3:30 PM"])
    for (const u of units) expect(u.className.split(" ")).toContain("block")
    // A screen reader reading it all, and a copy of it, still hear where one clause ends (CR-31).
    expect(container.textContent).toBe("2 tasks due today, 1 overdue, 1 mention waiting, Now: Design review, until 3:30 PM")
    const calm = render(<GlanceLine stacked counts={zero} next={running} />).container
    expect([...calm.querySelectorAll("[data-glance] > [data-fact]")].map((u) => u.textContent)).toEqual(["Nothing needs you.", "Now: Design review, until 3:30 PM."])
    expect(calm.textContent).toBe("Nothing needs you. Now: Design review, until 3:30 PM.")
  })

  it("says overdue in danger ink", () => {
    render(<GlanceLine counts={{ ...zero, tasksDue: 1, overdue: 2 }} />)
    expect(screen.getByText("2 overdue").className).toMatch(/text-danger-ink/)
  })

  it("holds the line's place while the counts aren't in", () => {
    const { container } = render(<GlanceLine loading counts={zero} />)
    expect(container.textContent).not.toContain("Nothing needs you")
    expect(screen.getByRole("status", { name: "Counting what needs you" })).toBeTruthy()
  })
})

// DESIGN-BUILD-3 on Home (21 Oct 2026): the sentence said "Nothing needs you"
// over a list that couldn't be read, and "Next up" for a meeting already on.
describe("what the sentence may claim", () => {
  const on = { title: "Design review", time: "3:30 PM", running: true }

  it("says a meeting already on as Now, until its end", () => {
    expect(glanceText(zero, on)).toBe("Nothing needs you. Now: Design review, until 3:30 PM.")
    expect(glanceText({ ...zero, mentions: 1 }, on)).toBe("1 mention waiting · Now: Design review, until 3:30 PM")
    const { container } = render(<GlanceLine counts={{ ...zero, mentions: 1 }} next={on} />)
    expect(container.textContent).toBe("1 mention waiting · Now: Design review, until 3:30 PM")
    cleanup()
    const alone = render(<GlanceLine counts={zero} next={on} />)
    expect(alone.container.textContent).toBe("Nothing needs you. Now: Design review, until 3:30 PM.")
  })

  it("says nothing of what needs you when that couldn't be read, only what's next", () => {
    expect(glanceText(zero, next, true)).toBe("Next up: Launch sync at 11:00.")
    expect(glanceText(zero, on, true)).toBe("Now: Design review, until 3:30 PM.")
    expect(glanceText(zero, null, true)).toBe("")
    const { container } = render(<GlanceLine failed counts={zero} next={next} />)
    expect(container.textContent).toBe("Next up: Launch sync at 11:00.")
    cleanup()
    const empty = render(<GlanceLine failed counts={zero} />)
    expect(empty.container.textContent).toBe("")
  })

  it("takes the next meeting's end when it is on, and its start when it is to come", () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 21, h, m)
    const meeting = { event_uuid: "e1", event_title: "Design review", event_start_time: at(15).toISOString(), event_end_time: at(15, 30).toISOString() }
    const opts = { clock: (iso: string) => iso, href: "/app/calendar" }
    expect(glanceNext(meeting, at(14), opts)).toEqual({ title: "Design review", time: meeting.event_start_time, href: "/app/calendar", running: false })
    expect(glanceNext(meeting, at(15, 10), opts)).toEqual({ title: "Design review", time: meeting.event_end_time, href: "/app/calendar", running: true })
    expect(glanceNext(meeting, at(14), { clock: opts.clock })).toEqual({ title: "Design review", time: meeting.event_start_time, running: false })
    expect(glanceNext(undefined, at(15))).toBeNull()
  })

  // A meeting's link can carry its password (?pwd=), and Home is on screens people share (DESIGN-BUILD-11, 14).
  it("says a meeting titled with a link by its host, never the link's query", () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 21, h, m)
    const linked = { event_title: "https://meet.example.com/j/8812345678?pwd=Zm9yZXZlcg", event_start_time: at(15).toISOString(), event_end_time: at(15, 30).toISOString() }
    const on = glanceNext(linked, at(15, 10), { clock: () => "3:30 PM" })!
    expect(on.title).toBe("meet.example.com")
    expect(glanceText(zero, on)).toBe("Nothing needs you. Now: meet.example.com, until 3:30 PM.")
    const { container } = render(<GlanceLine counts={zero} next={on} />)
    expect(container.textContent).not.toContain("pwd")
    // A title with words in it keeps them, and its link reads as its host too (CR-27).
    const worded = glanceNext({ ...linked, event_title: "Standup https://zoom.us/j/1?pwd=x" }, at(15, 10), { clock: () => "3:30 PM" })!
    expect(glanceText(zero, worded)).toBe("Nothing needs you. Now: Standup zoom.us, until 3:30 PM.")
  })

  // The events API leaves an untitled event's title out (omitempty), whatever the type says (CR-29).
  // Main (24 Oct): never "Now: , until 3:30 PM". The calendar names no untitled event, so Home says "Untitled event".
  it("names a meeting with no title", () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 21, h, m)
    const times = { event_start_time: at(15).toISOString(), event_end_time: at(15, 30).toISOString() }
    const on = glanceNext(times, at(15, 10), { clock: () => "3:30 PM" })!
    expect(on.title).toBe("Untitled event")
    const { container } = render(<GlanceLine counts={zero} next={on} />)
    expect(container.textContent).toBe("Nothing needs you. Now: Untitled event, until 3:30 PM.")
    expect(glanceNext({ ...times, event_title: "  " }, at(15, 10))!.title).toBe("Untitled event")
    expect(glanceNext({ ...times, event_is_focus: true }, at(15, 10))!.title).toBe("Focus time")
  })
})

// DESIGN-BUILD-3 (21 Oct 2026): the line counted 1 task and 1 mention over a
// list still drawing its loading rows. They read apart: the list waits for
// whether this server has AI, and with AI it adds the AI's own rows, which the
// line never counted; and the line said "Nothing needs you" over a DM the list
// showed. The line now says what the list shows.
describe("the line, from what the list shows", () => {
  const row = (id: string, kind: NeedsItem["kind"], extra: Partial<NeedsItem> = {}): NeedsItem => ({ id, kind, title: id, ...extra })

  it("waits until the list has drawn, and while it draws its loading rows", () => {
    expect(glanceOf(null).loading).toBe(true)
    expect(glanceOf({ items: [row("mention:p1", "reply")], loading: true, failed: false }).loading).toBe(true)
    expect(glanceOf({ items: [], loading: false, failed: false }).loading).toBe(false)
  })

  it("counts the list's rows, the AI's among them, and leaves the rest to the list", () => {
    const items = [
      row("task:1", "due"),
      row("task:2", "due", { overdue: true }),
      row("ai:task:3", "due"),
      row("mention:p1", "reply"),
      row("dm:g1", "reply"),
      row("ai:question:q1", "reply"),
      row("ai:approval:a1", "agent"),
      row("email:m1", "email"),
    ]
    expect(glanceOf({ items, loading: false, failed: false })).toEqual({
      loading: false,
      failed: false,
      counts: { tasksDue: 2, overdue: 1, mentions: 1, agentRequests: 1 },
      unnamed: 3,
    })
  })

  it("says the read failed when the list does", () => {
    expect(glanceOf({ items: [], loading: false, failed: true }).failed).toBe(true)
  })

  it("never says nothing needs you while the list shows a row it doesn't name", () => {
    expect(glanceText(zero, next, false, 1)).toBe("Next up: Launch sync at 11:00.")
    expect(glanceText(zero, null, false, 2)).toBe("")
    expect(glanceText({ ...zero, mentions: 1 }, next, false, 3)).toBe("1 mention waiting · Next: Launch sync at 11:00")
    const { container } = render(<GlanceLine counts={zero} unnamed={1} next={next} />)
    expect(container.textContent).toBe("Next up: Launch sync at 11:00.")
    cleanup()
    const alone = render(<GlanceLine counts={zero} unnamed={1} />)
    expect(alone.container.textContent).toBe("")
  })
})

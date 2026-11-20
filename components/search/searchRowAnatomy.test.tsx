import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { SearchResult } from "@/services/searchService"
import { hueFor } from "@/lib/campHue"
import { personHue } from "@/lib/utils/getAvatarColor"
import { eventWhen } from "@/lib/search/eventWhen"
import { pinTestClock } from "@/lib/testing/testClock"

vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => undefined }))

const { SearchResultRow, statusKindOf } = await import("@/components/search/searchResultRow")

/**
 * A search result's anatomy (hub.md S9): a two-line HubRow with a lead per
 * type under design v3's identity rules. These are the demo's own hits for
 * "launch" (11 Oct), trimmed.
 */
const HITS: Record<string, SearchResult> = {
  project: { type: "project", project: { project_id: "0f81", project_name: "Q4 launch", project_team_name: "Launch", created_date: 1791614951 } },
  task: { type: "task", task: { task_id: "96a6", task_name: "Pick the launch date", task_status: "done", task_project_id: "0f81", task_project_name: "Q4 launch", task_assignee_user_id: "289b", task_assignee_user_full_name: "Sam Rivera", created_date: 1791614952 } },
  doc: { type: "doc", doc: { doc_uuid: "9879", doc_title: "Q4 launch plan", created_date: 1791614952 }, highlight: { doc_body: ["We <mark>launch</mark> on the last Tuesday"] } },
  post: { type: "post", post: { post_id: "8089", post_body: "Release candidate for the Q4 launch is up", post_by_user_id: "289b", post_by_user_full_name: "Sam Rivera", post_ch_id: "e1cf", post_ch_name: "engineering", created_date: 1791614953 } },
  user: { type: "user", user: { user_id: "3408", user_full_name: "Maya Chen", user_email: "maya@example.com" } },
  channel: { type: "channel", channel: { ch_id: "e1cf", ch_name: "engineering" } },
}

afterEach(cleanup)
// The event hits below write dates (app/testClock.test.ts).
pinTestClock()

const lead = (r: SearchResult) => {
  const { container } = render(<ul><SearchResultRow result={r} onOpen={() => {}} href="/x" /></ul>)
  return container.querySelector("[data-search-lead]") as HTMLElement
}

describe("a search result's anatomy", () => {
  it("is a two-line HubRow", () => {
    const { container } = render(<ul><SearchResultRow result={HITS.task} onOpen={() => {}} /></ul>)
    expect(container.querySelector("[data-hub-row][data-density=two-line]")).toBeTruthy()
  })

  it("leads with what each type is: a project tile, a status glyph, a face, a glyph in ink-3", () => {
    expect(lead(HITS.project).getAttribute("data-search-lead")).toBe("project")
    // The one project tile (components/ui/graphics/ProjectTile), at the lead's 24px.
    expect(lead(HITS.project).querySelector("[data-project-tile]")?.getAttribute("data-project-tile")).toBe("24")
    expect(lead(HITS.task).querySelector("svg")).toBeTruthy()
    expect(lead(HITS.post).getAttribute("data-search-lead")).toBe("message")
    expect(lead(HITS.user).getAttribute("data-search-lead")).toBe("person")
  })

  // INTERACTION_SPEC D13: a channel leads with its tile and a doc with its
  // glyph, each in its own hue, and the row tints in it. Both were ink-3.
  it("gives a channel and a doc their own hues, on the lead and the row", () => {
    const channel = lead(HITS.channel)
    expect(channel.querySelector("[data-channel-tile]")?.getAttribute("data-hue")).toBe(hueFor("e1cf"))
    expect(channel.closest("[data-hub-row]")?.getAttribute("data-hue")).toBe(hueFor("e1cf"))
    cleanup()
    const doc = lead(HITS.doc)
    expect(doc.querySelector("[data-doc-icon]")?.getAttribute("data-hue")).toBe(hueFor("9879"))
    expect(doc.closest("[data-hub-row]")?.getAttribute("data-hue")).toBe(hueFor("9879"))
  })

  it("keeps a board in an ink-3 glyph and the accent, and a person's row in their own hue", () => {
    const board = lead({ type: "board", board: { board_uuid: "b1", board_name: "Launch wall" } } as SearchResult)
    expect(board.className).toContain("text-ink-3")
    expect(board.closest("[data-hub-row]")?.hasAttribute("data-hue")).toBe(false)
    cleanup()
    expect(lead(HITS.user).closest("[data-hub-row]")?.getAttribute("data-hue")).toBe(personHue(HITS.user.user))
    cleanup()
    // A message's row, in its author's.
    expect(lead(HITS.post).closest("[data-hub-row]")?.getAttribute("data-hue")).toBe(personHue("Sam Rivera"))
  })

  // gcal-13: an event leads with the calendar glyph in ink-3, as a board
  // does, and its row keeps the accent. Its line says it repeats, when (in
  // the reader's own time, the app's one way) and where; a match in its notes
  // is the passage; and it has no "made" date: its own time is its line.
  it("leads an event with the calendar glyph, says when and where, and shows the notes it matched in", () => {
    const start = Date.UTC(2026, 9, 29, 9, 0) / 1000
    const event: SearchResult = {
      type: "event",
      event: { event_uuid: "e7", event_title: "Design review", event_location: "Room 4", event_repeats: true, event_start: start, event_end: start + 1800, event_calendar_id: "c1", created_date: 1791614952 },
      highlight: { event_notes: ["Bring the <mark>launch</mark> mocks"] },
    }
    const glyph = lead(event)
    expect(glyph.getAttribute("data-search-lead")).toBe("event")
    expect(glyph.className).toContain("text-ink-3")
    expect(glyph.querySelector("svg")?.getAttribute("class")).toMatch(/lucide-calendar-days/)
    expect(glyph.closest("[data-hub-row]")?.hasAttribute("data-hue")).toBe(false)
    cleanup()
    const { container } = render(<ul><SearchResultRow result={event} onOpen={() => {}} href="/app/calendar/event/e7" /></ul>)
    expect(container.textContent).toContain(`Repeating event · ${eventWhen(event.event)} · Room 4`)
    expect(container.querySelector("[data-search-snippet] mark")?.textContent).toBe("launch")
    expect(container.querySelector(".hub-row-meta")).toBeNull()
    cleanup()
    // A single all-day event, with no place: "Event" and its day alone.
    const { container: allDay } = render(<ul><SearchResultRow result={{ type: "event", event: { event_uuid: "e8", event_title: "Offsite", event_start_date: "2026-10-30", event_end_date: "2026-10-31", event_repeats: false } }} onOpen={() => {}} /></ul>)
    expect(allDay.textContent).toContain("Event · Fri 30 Oct")
    expect(allDay.textContent).not.toContain("Fri 30 Oct ·")
  })

  it("says where a message is and who wrote it", () => {
    const { container } = render(<ul><SearchResultRow result={HITS.post} onOpen={() => {}} /></ul>)
    expect(container.textContent).toContain("#engineering · Sam Rivera")
  })

  it("adds the passage a doc matched in", () => {
    const { container } = render(<ul><SearchResultRow result={HITS.doc} onOpen={() => {}} /></ul>)
    expect(container.querySelector("[data-search-snippet] mark")?.textContent).toBe("launch")
  })

  it("reads a task's status into the glyph set", () => {
    expect(statusKindOf("done")).toBe("done")
    expect(statusKindOf("in_progress")).toBe("progress")
    expect(statusKindOf("canceled")).toBe("cancelled")
    expect(statusKindOf(undefined)).toBe("todo")
  })
})

describe("the match highlight", () => {
  it("is the sun highlighter, not the accent", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
    const mark = css.slice(css.indexOf("  mark {"), css.indexOf("}", css.indexOf("  mark {")))
    expect(mark).toMatch(/var\(--camp-sun\) 24%/)
    expect(mark).not.toMatch(/--primary|--brand/)
  })
})

// zoom-13: a line said in a call reads as a message does, said by its speaker, with where and when in the call.
describe("a call's line", () => {
  const STARTED = 1_762_500_000
  const line = {
    type: "transcript",
    transcript: {
      transcript_id: "t1", transcript_text: "we ship it friday", transcript_offset_ms: 125_900, transcript_recording_id: "EG_1", transcript_has_media: true,
      transcript_conv_id: "c1", transcript_conv_kind: "channel", transcript_by_user_id: "u1", transcript_by_user_full_name: "Maya Rao",
      transcript_call_started_at: STARTED, created_date: STARTED + 126,
    },
    highlight: { transcript_text: ["we <mark>ship</mark> it friday"] },
  } as unknown as SearchResult
  const row = (r: SearchResult, place?: string) =>
    render(<ul><SearchResultRow result={r} onOpen={() => {}} href="/app/channel/c1/recording?play=EG_1&at=125900" place={place} /></ul>).container

  it("leads with its speaker, says its words marked, and the call's place, day and moment", async () => {
    const { formatListTimestamp } = await import("@/lib/utils/date/formatTimeForPostOrComment")
    const c = row(line, "#launch")
    const l = c.querySelector("[data-search-lead]")
    expect(l?.getAttribute("data-search-lead")).toBe("message")
    expect(l?.textContent).toBe("MR")
    expect(c.querySelector("[data-search-result]")?.textContent).toBe("we ship it friday")
    expect(c.querySelector("[data-search-result] mark")?.textContent).toBe("ship")
    expect(c.querySelector("[data-hub-second]")?.textContent).toBe(`Call · #launch · Maya Rao · ${formatListTimestamp(new Date(STARTED * 1000).toISOString())}`)
    // Its moment is the row's end, which never cuts off at 390, so a long line can't hide it (CR-330 G1).
    expect(c.querySelector(".hub-row-meta")?.textContent).toBe("at 2:05")
  })

  it("names its speaker in the line under its words, and in the link's name, as a message row does (CR-330 F1)", async () => {
    const { formatListTimestamp } = await import("@/lib/utils/date/formatTimeForPostOrComment")
    const { getByRole } = render(
      <ul><SearchResultRow result={line} onOpen={() => {}} href="/app/channel/c1/recording?play=EG_1&at=125900" place="#launch" /></ul>,
    )
    const day = formatListTimestamp(new Date(STARTED * 1000).toISOString())
    expect(document.querySelector("[data-hub-second]")?.textContent).toBe(`Call · #launch · Maya Rao · ${day}`)
    expect(document.querySelector(".hub-row-meta")?.textContent).toBe("at 2:05")
    // A screen reader hears who said it with the words; the 24 px initials stay out of the reading.
    expect(getByRole("link", { name: "we ship it friday Maya Rao" })).toBeTruthy()
    expect(document.querySelector("[data-search-lead] [aria-label], [data-search-lead][aria-label]")).toBeNull()
  })

  it("says its words unmarked with no highlight, and no place it doesn't know", () => {
    const c = row({ ...line, highlight: undefined } as SearchResult)
    expect(c.querySelector("[data-search-result]")?.textContent).toBe("we ship it friday")
    expect(c.querySelector("[data-hub-second]")?.textContent).toMatch(/^Call · Maya Rao · [^·]+$/)
    expect(c.querySelector(".hub-row-meta")?.textContent).toBe("at 2:05")
    expect(c.textContent).not.toContain("undefined")
  })

  it("is a link, so Enter opens it", () => {
    const a = row(line, "#launch").querySelector("a[data-search-result]")
    expect(a?.getAttribute("href")).toBe("/app/channel/c1/recording?play=EG_1&at=125900")
  })

  it("never draws a line the server marks deleted", () => {
    const gone = { ...line, transcript: { ...(line.transcript as object), deleted_date: STARTED + 999 } } as SearchResult
    expect(row(gone, "#launch").querySelector("[data-hub-row]")).toBeNull()
  })
})

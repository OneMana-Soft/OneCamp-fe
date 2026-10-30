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

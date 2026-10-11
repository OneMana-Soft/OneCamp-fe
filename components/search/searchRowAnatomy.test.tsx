import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { SearchResult } from "@/services/searchService"

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
    expect(lead(HITS.project).className).toContain("avatar-person")
    expect(lead(HITS.task).querySelector("svg")).toBeTruthy()
    expect(lead(HITS.post).getAttribute("data-search-lead")).toBe("message")
    expect(lead(HITS.user).getAttribute("data-search-lead")).toBe("person")
  })

  it("gives a channel and a doc no hue", () => {
    for (const r of [HITS.channel, HITS.doc]) {
      const el = lead(r)
      expect(el.className).toContain("text-ink-3")
      expect(el.className).not.toMatch(/hue|avatar-person|tint/)
      cleanup()
    }
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

import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// The task panel's Comments, Activity and GitHub tabs had three insets, three
// empty-state paddings, a line of text for GitHub's loading and no error
// state on Activity. Design v3 (work.md W32) made them one stream with a
// filter (All, Comments, History, and GitHub when linked).
describe("the task panel's activity", () => {
  const panel = readFileSync("components/rightPanel/taskInfoPanel.tsx", "utf8")
  const gh = readFileSync("components/task/GitHubActivityTab.tsx", "utf8")
  it("is one stream with a filter, not tabs", () => {
    expect(panel).not.toMatch(/<TabsContent\b/)
    expect(panel).toMatch(/<SegmentedControl[\s\S]{0,120}value=\{streamFilter\}/)
    expect(panel).toMatch(/<TaskStream\b/)
    expect(gh).not.toContain('className="flex flex-col gap-3 py-2 pr-2"')
  })
  it("draw their states alike", () => {
    expect(readFileSync("components/task/taskActivitySection.tsx", "utf8")).toContain('className="py-8" />}')
    expect(gh).not.toContain("Loading GitHub activity…</div>")
    expect(gh.match(/className="py-8"/g)?.length).toBe(2)
    expect(panel).toMatch(/subject="the activity"/)
  })
})

describe("linking a task to GitHub", () => {
  const src = readFileSync("components/task/GitHubIssueSearchDialog.tsx", "utf8")
  it("keeps one height for Search and Paste URL, and says so in sentence case", () => {
    expect(src).toContain("h-[min(36rem,80vh)]")
    expect(src).not.toMatch(/Link GitHub Issue|Tasks to GitHub/)
  })
})

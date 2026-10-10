import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// The task panel's Comments, Activity and GitHub tabs had three insets (a
// switch moved the first row 16px sideways and 8px down), three empty-state
// paddings (py-8, py-6, py-12), a line of text for GitHub's loading and no
// error state on Activity.
describe("the task panel's tabs", () => {
  const panel = readFileSync("components/rightPanel/taskInfoPanel.tsx", "utf8")
  const gh = readFileSync("components/task/GitHubActivityTab.tsx", "utf8")
  it("share one body", () => {
    expect(panel.match(/<TabsContent value="(comments|activities|github)" className=\{PANEL_TAB\}>/g)?.length).toBe(3)
    expect(gh).not.toContain('className="flex flex-col gap-3 py-2 pr-2"')
  })
  it("draw their states alike", () => {
    expect(readFileSync("components/task/taskActivitySection.tsx", "utf8")).toContain('className="py-8" />}')
    expect(gh).not.toContain("Loading GitHub activity…</div>")
    expect(gh.match(/className="py-8"/g)?.length).toBe(2)
    expect(panel).toMatch(/subject="the activity"/)
  })
})

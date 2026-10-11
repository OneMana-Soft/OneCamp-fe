import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// The full task page (design v3, work.md W37). Desktop used to open the
// right panel and replace the URL, so the panel's "Open the full page" led
// back into the panel.
describe("the full task page", () => {
  const page = readFileSync("app/app/task/[task-id]/page.tsx", "utf8")
  const panel = readFileSync("components/rightPanel/taskInfoPanel.tsx", "utf8")

  it("is a page on every screen, not a bounce into the panel", () => {
    expect(page).toMatch(/<TaskInfoPanel[^>]*\bonPage\b/)
    expect(page).not.toMatch(/openRightPanel|router\.replace/)
  })

  it("lays out two columns with the properties as a sticky 280px rail", () => {
    expect(panel).toContain("lg:grid-cols-[minmax(0,1fr)_280px]")
    expect(panel).toMatch(/data-task-properties[\s\S]{0,200}lg:sticky/)
  })

  it("has no close or open-full-page in its header", () => {
    const header = readFileSync("components/rightPanel/RightPanelTaskHeader.tsx", "utf8")
    expect(header).toMatch(/isDesktop && !onPage && \(\s*<Button asChild/)
    expect(header).toMatch(/isDesktop && !onPage && \(\s*<Button variant="ghost" size="icon" className=\{iconButton\} onClick=\{\(\) => dispatch\(closeRightPanel\(\)\)\}/)
  })
})

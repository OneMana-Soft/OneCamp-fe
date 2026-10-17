import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * Every tab of a project and of My Tasks draws in one frame
 * (components/task/workFrame): a toolbar row from the first paint, the body
 * 16px under it, and its empty and failed states in WorkState. Each tab used
 * to build its own, and a switch moved the first row by up to 180px.
 */
const TABS: Record<string, { toolbar: boolean; states: boolean }> = {
  "components/project/projectTaskTable.tsx": { toolbar: false, states: true },
  "components/myTask/myTaskTable.tsx": { toolbar: false, states: true },
  // The board shares the list's toolbar (WorkToolbar draws the band: PTC-6).
  "components/project/projectTaskKanban.tsx": { toolbar: false, states: true },
  "components/myTask/myTaskKanban.tsx": { toolbar: true, states: true },
  "components/project/timeline/ProjectTimeline.tsx": { toolbar: true, states: true },
  // Updates has the band too, with New update as its primary (PTC-6); its
  // prompt card opens the body under it.
  "components/projectUpdates/ProjectUpdates.tsx": { toolbar: true, states: true },
  "components/project/ProjectAttachments.tsx": { toolbar: true, states: true },
}

describe("the task views' tabs share one frame", () => {
  for (const [file, want] of Object.entries(TABS)) {
    const src = readFileSync(file, "utf8")
    it(`${file} draws in it`, () => {
      if (want.toolbar) {
        expect(src).toMatch(/className=\{(cn\()?workToolbar\b/)
        // The band is the frame's own: no tab pins it to a fixed height (a
        // wrapped row slid under the timeline on a phone) or pads it again.
        expect(src).not.toMatch(/cn\(workToolbar, "[^"]*\b(h-11|h-8|px-\d|pl-\d|min-h-\d+)\b/)
      }
      if (want.states) {
        expect(src).toContain("<WorkState")
        expect(src).toContain("ErrorState")
      }
      // No tab centres its column or insets itself from the others.
      expect(src).not.toMatch(/mx-auto flex w-full max-w-3xl/)
      // Controls that vanish below 1024px left a narrow window without View.
      expect(src).not.toMatch(/hidden h-8[^"]*lg:flex/)
    })
  }

  it("draws the v3 band: 44 px, a hairline under it, 16 px in, flush under the tabs", () => {
    const src = readFileSync("components/task/workFrame.tsx", "utf8")
    const band = src.match(/export const workToolbar = "([^"]+)"/)?.[1] ?? ""
    for (const c of ["min-h-11", "border-b", "border-line", "px-4"]) expect(band.split(" ")).toContain(c)
    // The Files tab's body is padded, not the tab around its band.
    expect(readFileSync("components/project/projectTaskDesktop.tsx", "utf8")).not.toMatch(/TabsContent value="attachments" className="[^"]*px-6/)
  })

  it("draws a project's board with the list's toolbar, the board's own Display in it", () => {
    const src = readFileSync("components/project/projectTaskKanban.tsx", "utf8")
    expect(src).toMatch(/<WorkToolbar\b/)
    expect(src).toMatch(/display=\{\s*<BoardDisplayMenu/)
    // Display before the one primary, New task, at the band's end: the toolbar's order.
    const bar = readFileSync("components/task/WorkToolbar.tsx", "utf8")
    expect(bar.indexOf("<DisplayMenu")).toBeLessThan(bar.indexOf('aria-label="New task"'))
  })

  it("puts Display before the one primary, New task, at the band's end on My Tasks' board", () => {
    for (const file of ["components/myTask/myTaskKanban.tsx"]) {
      const src = readFileSync(file, "utf8")
      const display = src.indexOf('aria-label="Display"')
      const create = src.indexOf('aria-label="New task"')
      expect(display, file).toBeGreaterThan(-1)
      expect(create, file).toBeGreaterThan(display)
    }
  })

  it("the project page has one scroll container for its tabs, and no boxed section in Attachments", () => {
    const src = readFileSync("components/project/projectTaskDesktop.tsx", "utf8")
    expect(src).toContain('<div className="min-h-0 flex-1 overflow-y-auto">')
    expect(src).not.toContain('<div className="p-4">')
  })
})

describe("the client's project view", () => {
  // Design v3 (work.md W51): Board, Timeline and "Needs your review" are one
  // row of tabs above both views, not a switch inside each view's toolbar.
  it("puts one row of tabs above both views", () => {
    const src = readFileSync("app/guest/p/[token]/page.tsx", "utf8")
    expect(src).toContain("<GuestTabs tabs={tabs} value={tab} onChange={pick} />")
    expect(src).not.toContain("leading={modeSwitch}")
  })
})

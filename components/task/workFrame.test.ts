import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * Every tab of a project and of My Tasks draws in one frame
 * (components/task/workFrame): a toolbar row from the first paint, the body
 * 16px under it, and its empty and failed states in WorkState. Each tab used
 * to build its own, and a switch moved the first row by up to 180px.
 */
const TABS: Record<string, { toolbar: boolean; states: boolean }> = {
  "components/task/taskTableToolbar.tsx": { toolbar: true, states: false },
  "components/project/projectTaskTable.tsx": { toolbar: false, states: true },
  "components/myTask/myTaskTable.tsx": { toolbar: false, states: true },
  "components/project/projectTaskKanban.tsx": { toolbar: true, states: true },
  "components/myTask/myTaskKanban.tsx": { toolbar: true, states: true },
  "components/project/timeline/ProjectTimeline.tsx": { toolbar: true, states: true },
  "components/projectUpdates/ProjectUpdates.tsx": { toolbar: true, states: true },
  "components/project/ProjectAttachments.tsx": { toolbar: true, states: true },
}

describe("the task views' tabs share one frame", () => {
  for (const [file, want] of Object.entries(TABS)) {
    const src = readFileSync(file, "utf8")
    it(`${file} draws in it`, () => {
      if (want.toolbar) expect(src).toMatch(/className=\{cn\(workToolbar/)
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

  it("the project page has one scroll container for its tabs, and no boxed section in Attachments", () => {
    const src = readFileSync("components/project/projectTaskDesktop.tsx", "utf8")
    expect(src).toContain('<div className="min-h-0 flex-1 overflow-y-auto">')
    expect(src).not.toContain('<div className="p-4">')
  })
})

describe("the client's project view", () => {
  it("leads one 32px toolbar row with its Board and Timeline switch on both views", () => {
    const src = readFileSync("app/guest/p/[token]/page.tsx", "utf8")
    expect(src).toContain("leading={modeSwitch}")
    expect(src).toContain('<div data-work-toolbar="" className={workToolbar}>{modeSwitch}</div>')
  })
})

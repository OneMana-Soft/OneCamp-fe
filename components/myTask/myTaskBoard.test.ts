import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const read = (f: string) => readFileSync(join(__dirname, "../..", f), "utf8")

describe("My Tasks' board matches the project board", () => {
  it("sits on the sheet with the same gutter as the project board (the page itself has none, work.md W20)", () => {
    expect(read("components/myTask/myTaskDesktop.tsx")).toMatch(/<MyTaskKanban className="px-5 pt-3" \/>/)
    expect(read("components/project/projectTaskDesktop.tsx")).toMatch(/<(m\.)?ProjectTaskKanban projectId=\{projectId\} className="px-5 pt-3" \/>/)
  })

  it("has one filled button, New task, and a quiet Display (work.md W10)", () => {
    const src = read("components/myTask/myTaskKanban.tsx")
    expect(src).not.toMatch(/variant="outline"/)
    expect(src).toMatch(/variant="ghost"[^>]*aria-label="Display">\s*<SlidersHorizontal/)
    expect(src).toMatch(/>New task</)
  })
})

describe("the task page's comment box on a phone", () => {
  it("keeps clear of the home indicator", () => {
    expect(read("components/task/taskCommentComposer.tsx")).toMatch(/env\(safe-area-inset-bottom\)/)
  })
})

describe("My Tasks' cards name their project (work.md W15)", () => {
  it("tells the board its cards span projects, so each wears its project's edge", () => {
    expect(read("components/myTask/myTaskKanban.tsx")).toMatch(/<TaskBoard[\s\S]*?\bcrossProject\b/)
    expect(read("components/kanbanComponents/Item/Item.tsx")).toMatch(/data-project-edge=\{edgeHue\}/)
    expect(read("components/kanbanComponents/Item/Item.tsx")).toMatch(/before:h-\[3px\][^"]*before:bg-hue/)
  })
})

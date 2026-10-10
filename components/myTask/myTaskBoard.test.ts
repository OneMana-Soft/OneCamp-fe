import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const read = (f: string) => readFileSync(join(__dirname, "../..", f), "utf8")

describe("My Tasks' board matches the project board", () => {
  it("lines up with the page title: the page passes the board no gutter of its own", () => {
    expect(read("components/myTask/myTaskDesktop.tsx")).toMatch(/<MyTaskKanban className="px-0 pt-0" \/>/)
  })

  it("has one filled button, Create task, and a quiet View", () => {
    const src = read("components/myTask/myTaskKanban.tsx")
    expect(src).not.toMatch(/variant="outline"/)
    expect(src).toMatch(/variant="ghost"[^>]*>\s*<MixerHorizontalIcon/)
  })
})

describe("the task page's comment box on a phone", () => {
  it("keeps clear of the home indicator", () => {
    expect(read("components/task/taskCommentComposer.tsx")).toMatch(/env\(safe-area-inset-bottom\)/)
  })
})

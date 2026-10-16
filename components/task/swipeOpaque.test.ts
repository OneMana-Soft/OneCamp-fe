import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// A phone row slides over its swipe actions (work.md W53), so it stays opaque
// in every state: a translucent press or selection fill let Due and More show
// through the row being dragged.
describe("the phone task row", () => {
  it("is the sheet in every state, its press and selection drawn over it", () => {
    const src = readFileSync("components/task/taskListTask.tsx", "utf8")
    const row = src.match(/data-swipe-row=""[\s\S]*?className=\{cn\(([^\n]+)\)\}/)?.[1] ?? ""
    expect(row).toContain("bg-sheet")
    expect(row).not.toMatch(/\bbg-(press|sel|hover)\b/)
  })
})

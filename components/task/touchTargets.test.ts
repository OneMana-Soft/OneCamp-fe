import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Mark complete on the task page and empty My Tasks' one action were 32px on
// a phone, under the 44px touch target; with a mouse they stay 32px.
describe("touch targets in tasks", () => {
  it("are 44px on a touch screen", () => {
    expect(readFileSync("components/rightPanel/RightPanelTaskHeader.tsx", "utf8")).toMatch(/className="h-8 gap-1\.5 pointer-coarse:h-11"/)
    expect(readFileSync("components/myTask/myTaskList.tsx", "utf8")).toMatch(/className="pointer-coarse:h-11"\s*>\s*Create a task/)
  })
})

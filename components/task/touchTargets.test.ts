import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Mark complete on the task page and empty My Tasks' one action were 32px on
// a phone, under the 44px touch target; with a mouse they stay 32px. My Tasks'
// empty state is one, the computer's and the phone's (NothingAssigned). The task
// header's Save for later was 32px too, and 28 once it took the header's icon
// size (24 Oct); with a mouse it stays 28.
describe("touch targets in tasks", () => {
  it("are 44px on a touch screen", () => {
    const header = readFileSync("components/rightPanel/RightPanelTaskHeader.tsx", "utf8")
    expect(header).toMatch(/"h-7 gap-1\.5 pointer-coarse:h-11"/)
    expect(header).toMatch(/<SaveForLaterButton[^>]*className="size-7 pointer-coarse:size-11"/)
    expect(readFileSync("components/myTask/nothingAssigned.tsx", "utf8")).toMatch(/className="pointer-coarse:h-11"\s*>\s*New task/)
  })
})

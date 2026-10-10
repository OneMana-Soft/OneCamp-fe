import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

// A client's Board or Timeline is a choice of one: the app's segmented
// control, 44px on a phone. It was a 28px toggle group.
describe("the client project's view switch", () => {
  it("is the shared segmented control", () => {
    const src = readFileSync("app/guest/p/[token]/page.tsx", "utf8")
    expect(src).toMatch(/<SegmentedControl[\s\S]{0,120}aria-label="Show the tasks as"/)
    expect(src).not.toMatch(/ToggleGroupItem/)
  })
})

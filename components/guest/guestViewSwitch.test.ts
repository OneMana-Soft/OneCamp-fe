import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

// A client's Board, Timeline and "Needs your review" are tabs in the app's
// tab language (design v3, work.md W51, W17): a 40px row with one underline.
// It was a segmented control, and before that a 28px toggle group.
describe("the client project's view switch", () => {
  it("is a row of tabs", () => {
    const src = readFileSync("app/guest/p/[token]/page.tsx", "utf8")
    expect(src).toMatch(/role="tablist" aria-label="Show the tasks as"/)
    expect(src).toMatch(/h-10/)
    expect(src).not.toMatch(/ToggleGroupItem/)
  })
})

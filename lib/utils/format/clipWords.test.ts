import { describe, expect, it } from "vitest"
import { clipWords } from "./clipWords"

// Text a box shows but can't widen for (split view's ghost, design r5): cut
// at a word, with an ellipsis, never past the limit.
describe("text cut to fit, at a word", () => {
  it("leaves text that fits as it is, its spaces made single", () => {
    expect(clipWords("  Q4   launch plan ", 30)).toBe("Q4 launch plan")
  })

  it("cuts at the last word that fits, with an ellipsis, inside the limit", () => {
    const out = clipWords("Quarterly planning for the platform team", 24)
    expect(out).toBe("Quarterly planning for…")
    expect(out.length).toBeLessThanOrEqual(24)
  })

  it("cuts a word longer than half the limit where it must", () => {
    expect(clipWords("Supercalifragilisticexpialidocious", 12)).toBe("Supercalifr…")
  })

  it("leaves no comma or stop before the ellipsis", () => {
    expect(clipWords("Launch plan, budget and hiring", 14)).toBe("Launch plan…")
  })
})

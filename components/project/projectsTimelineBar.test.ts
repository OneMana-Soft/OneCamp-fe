import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Step 3, part 3: a project's bar on the projects timeline had its white name
// on the a1 end of its gradient (3.75 to 4.32:1) and, where some of it was
// done, under a white band (2.79 to 3.19:1): under AA for every hue. White
// reads on a2 (paletteContrast.test: 5.5:1 and up), so the name's end is a2,
// and done is a darker band, which only raises that.
const src = readFileSync("components/project/ProjectsTimeline.tsx", "utf8")

describe("a project's bar on the projects timeline", () => {
  it("starts its gradient at the a2 cut, where its white name sits", () => {
    expect(src).toContain('backgroundImage: "linear-gradient(140deg, var(--hue-a2), var(--hue-a1))"')
    expect(src).not.toContain("linear-gradient(140deg, var(--hue-a1), var(--hue-a2))")
  })

  it("shows how much is done as a darker band, never a white one over the name", () => {
    expect(src).toMatch(/data-done-band="" className="[^"]*bg-black\/15/)
    expect(src).not.toMatch(/data-done-band="" className="[^"]*bg-white\//)
  })
})

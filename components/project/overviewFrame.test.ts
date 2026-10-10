import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * The projects overview draws every view (Table, Timeline, Workload, Goals,
 * Reports) in one frame: one header, the switcher row from the first paint,
 * and each view's row of controls where Table's is. Goals and Reports used to
 * rewrite the header and slide the switcher 310px left; the switcher waited
 * for the projects, so with none Goals and Reports couldn't be reached.
 */
const read = (f: string) => readFileSync(f, "utf8")

describe("the projects overview's frame", () => {
  const overview = read("components/project/ProjectsOverview.tsx")
  it("keeps one header and an unconditional switcher", () => {
    expect(overview).toContain('eyebrow="Every project you\'re in" title="Projects"')
    expect(overview).not.toMatch(/title=\{goalsView/)
    expect(overview).not.toMatch(/all\.length > 0 \|\| ownTools/)
  })
  it("draws every view's controls in a 32px toolbar row, and states in WorkState", () => {
    for (const f of ["components/project/ProjectsTimeline.tsx", "components/project/ProjectsWorkload.tsx", "components/goals/GoalsView.tsx", "components/reports/ReportsView.tsx"]) {
      const src = read(f)
      expect(src, f).toMatch(/workToolbar/)
      expect(src, f).not.toContain("StatePlaceholder")
      expect(src, f).not.toMatch(/className="h-7 [^"]*px-2\.5 text-xs"/)
    }
    expect(read("components/goals/GoalsView.tsx")).not.toMatch(/\{all\.length > 0 && \(\s*<div/)
  })
})

describe("the projects overview on a phone", () => {
  it("lets its rows take the page's 16px inset rather than adding their own", () => {
    // Project and goal rows sat 32px in, inside a body that was already inset.
    expect(read("components/project/ProjectsOverview.tsx")).not.toContain('<div className="px-4 py-3" {...longPress}>')
    expect(read("components/goals/GoalsView.tsx")).not.toContain("paddingLeft: 16 + depth * 16")
  })
})

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Home must not jump while it loads (hub.md H1, "First paint").
 *
 * The AI's reading cards fetch after the page paints; placed above Home's own
 * sections, one that arrived late pushed the page down (0.18 of layout shift
 * once from the briefing). The briefing is last, the agents' strip puts up no
 * placeholder, the lazy sections and needs-me hold their height while they
 * load, and the summary sentence waits for its counts.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "..", "..", p), "utf8")

describe("home layout while things load", () => {
  for (const [name, file] of [
    ["desktop", "components/home/desktop/desktopDashboard.tsx"],
    ["mobile", "components/home/mobile/mobileHome.tsx"],
  ] as const) {
    it(`${name}: the briefing comes last`, () => {
      const src = read(file)
      expect(src.lastIndexOf("<BriefingCard")).toBeGreaterThan(src.lastIndexOf("<ProjectsStrip"))
    })

    it(`${name}: the summary waits for the counts`, () => {
      expect(read(file)).toMatch(/<GlanceLine[\s\S]*?loading=\{needs\.loading\}/)
    })
  }

  it("needs-me holds two rows' height loading, empty or with one row", () => {
    const src = read("components/home/NeedsMeSection.tsx")
    expect(src).toMatch(/\[0, 1\]\.map\(\(i\) => \(\s*<HubRowSkeleton key=\{i\} density="two-line" \/>/)
    expect(src).toMatch(/const NEEDS_MIN_H = "min-h-\[138px\]"/)
    expect(src.match(/className=\{cn\(NEEDS_MIN_H, className\)\}/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it("the lazy agenda and projects hold their sections' height", () => {
    const src = read("components/home/desktop/desktopDashboard.tsx")
    expect(src).toMatch(/loading: \(\) => <SectionSkeleton title="Today" rows=\{1\} card \/>/)
    expect(src).toMatch(/loading: \(\) => <SectionSkeleton title="Projects" rows=\{1\} \/>/)
  })

  it("the agents' strip puts up nothing until a job runs", () => {
    expect(read("components/ai/AgentWorkCard.tsx")).toMatch(/if \(jobs\.length === 0\) return null/)
  })
})

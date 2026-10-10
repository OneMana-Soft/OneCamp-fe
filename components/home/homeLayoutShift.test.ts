import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Home must not jump while it loads.
 *
 * The AI cards fetch after the page paints. Placed above Home's own lists, a
 * card that arrived late pushed the page down when it came: 0.18 of layout
 * shift once from the briefing, and 0.055 on 10 Oct 2026 from the agents'
 * card, whose placeholder then collapsed to nothing. So the reading cards (the
 * agents' work and the briefing) render after the lists, and the cards above
 * them hold their place while they load (tested in components/ai).
 */
const read = (p: string) => readFileSync(resolve(__dirname, "..", "..", p), "utf8")

describe("home layout while AI cards load", () => {
  for (const [name, file] of [
    ["desktop", "components/home/desktop/desktopDashboard.tsx"],
    ["mobile", "components/home/mobile/mobileHome.tsx"],
  ] as const) {
    it(`${name}: the reading cards come after the page's own rows`, () => {
      const src = read(file)
      const lastRow = src.lastIndexOf("<HomeRow")
      expect(lastRow).toBeGreaterThan(0)
      expect(src.indexOf("<AgentWorkCard")).toBeGreaterThan(lastRow)
      expect(src.indexOf("<BriefingCard")).toBeGreaterThan(lastRow)
    })

    it(`${name}: the glance line waits for the counts`, () => {
      expect(read(file)).toMatch(/<GlanceLine\s+loading=\{glanceLoading\(/)
    })
  }

  it("the action queue holds its place while it loads", () => {
    expect(read("components/ai/AttentionCard.tsx")).toMatch(/if \(loading\) return <AttentionCardSkeleton \/>/)
  })

  it("the agents' card puts up no placeholder that would collapse", () => {
    expect(read("components/ai/AgentWorkCard.tsx")).toMatch(/if \(isLoading\) return null/)
  })
})

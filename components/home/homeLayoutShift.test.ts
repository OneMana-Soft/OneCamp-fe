import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Home must not jump while it loads.
 *
 * The AI cards fetch after the page paints. The briefing is the tallest of them
 * and its height is unpredictable, and placed above the stats it pushed the
 * whole page down when it arrived: a layout shift of 0.18 on the demo, where
 * Google's "good" is under 0.1. So it renders last, and the action queue at the
 * top holds its own place with a skeleton instead of appearing from nothing.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "..", "..", p), "utf8")

describe("home layout while AI cards load", () => {
  for (const [name, file, anchor] of [
    ["desktop", "components/home/desktop/desktopDashboard.tsx", "<StatCard"],
    ["mobile", "components/home/mobile/mobileHome.tsx", "<QuickActionTile"],
  ] as const) {
    it(`${name}: the briefing comes after the page's own content`, () => {
      const src = read(file)
      expect(src.indexOf("<BriefingCard")).toBeGreaterThan(src.lastIndexOf(anchor))
    })
  }

  it("the action queue holds its place while it loads", () => {
    expect(read("components/ai/AttentionCard.tsx")).toMatch(/if \(loading\) return <AttentionCardSkeleton \/>/)
  })
})

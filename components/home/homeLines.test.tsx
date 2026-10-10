import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { HomeRow } from "@/components/home/HomeRow"
import { GreetingBand } from "@/components/home/GreetingBand"
import { homeGap, homeGlyph, homeInset } from "@/components/home/homeLines"

afterEach(cleanup)

const read = (p: string) => readFileSync(resolve(__dirname, "..", "..", p), "utf8")
const classes = (s: string) => s.split(/\s+/).filter(Boolean)

/**
 * Home's two lines (homeLines.ts). On 10 Oct, at 1440, text in Home's one
 * column started at eight x positions (330 to 387) because every block chose
 * its own padding and gap. Every block now takes the inset, the 24px glyph
 * column and the 12px gap from one place, and none of the paddings that broke
 * the lines may come back.
 */
describe("Home's two lines", () => {
  it("a list row puts its glyph in the 24px column and its name 12px after it, at the cards' inset", () => {
    render(<HomeRow href="/app/channel/c1" icon={<svg />} label="engineering" />)
    const row = classes(screen.getByRole("link").className)
    for (const c of [...classes(homeInset), ...classes(homeGap)]) expect(row).toContain(c)
    expect(row).not.toContain("px-2")
    const glyph = classes(screen.getByRole("link").querySelector("[aria-hidden]")!.className)
    for (const c of classes(homeGlyph)) expect(glyph).toContain(c)
  })

  it("the greeting starts on the first line, not 28px in", () => {
    const { container } = render(<GreetingBand>Good evening, Sam</GreetingBand>)
    const band = classes(container.querySelector("section")!.className)
    for (const c of classes(homeInset)) expect(band).toContain(c)
    expect(band).not.toContain("md:px-7")
  })

  it.each([
    "components/home/GreetingBand.tsx",
    "components/home/HomeRow.tsx",
    "components/home/desktop/desktopDashboard.tsx",
    "components/home/mobile/mobileHome.tsx",
    "components/home/SetupChecklist.tsx",
    "components/home/NoChannelsYet.tsx",
    "components/ai/AttentionCard.tsx",
    "components/ai/WhileYouWereAwayCard.tsx",
    "components/ai/AgentWorkCard.tsx",
    "components/ai/BriefingCard.tsx",
  ])("%s takes its inset from homeLines", (file) => {
    expect(read(file)).toMatch(/from "@\/components\/home\/homeLines"/)
  })

  it.each<[string, RegExp]>([
    // a section label 8px in, where the cards' glyphs are 20px in
    ["components/home/desktop/desktopDashboard.tsx", /justify-between px-2"/],
    ["components/home/mobile/mobileHome.tsx", /justify-between px-2"/],
    // the band and the place tiles 4px wider than everything else on a phone
    ["components/home/mobile/mobileHome.tsx", /-mx-1/],
    // a 32px header tile beside steps with 16px circles: title 16px off the steps
    ["components/home/SetupChecklist.tsx", /className="p-5"/],
    // rows at 16px with a 10px gap, approvals with a 6px gap
    ["components/ai/AttentionCard.tsx", /gap-2\.5 px-4|gap-1\.5 px-4/],
    ["components/ai/AgentWorkCard.tsx", /className="px-4 py-2\.5"/],
    ["components/ai/WhileYouWereAwayCard.tsx", /"px-4 py-3\.5"|gap-3 px-4 py-3\.5/],
    // a 14px icon 8px before the words
    ["components/ai/BriefingCard.tsx", /className="p-4"|items-start gap-2 rounded-md/],
    ["components/home/NoChannelsYet.tsx", /border-border\/60 p-4"/],
  ])("%s keeps none of the paddings that broke the lines (%s)", (file, old) => {
    expect(read(file)).not.toMatch(old)
  })

  it("the AI cards' heads sit on the same lines: a 12px gap, 16px in, 20px from md", () => {
    const css = read("app/globals.css")
    const head = css.slice(css.indexOf(".ai-panel-head {"))
    expect(head).toMatch(/^\.ai-panel-head \{[^}]*gap: 0\.75rem;[^}]*padding: 0\.875rem 1rem 0\.375rem;/)
    expect(head).toMatch(/@media \(width >= 48rem\) \{\s*\.ai-panel-head \{\s*padding-inline: 1\.25rem;/)
  })
})

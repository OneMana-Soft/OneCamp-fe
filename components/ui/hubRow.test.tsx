import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { HubRow, HubRowSkeleton, HubToolButton } from "@/components/ui/hubRow"
import { KindBadge, KIND_BADGE_TONE } from "@/components/ui/kindBadge"

/** The HubRow (hub.md §1.2): one row anatomy for every hub list. */
const CSS = readFileSync(join(process.cwd(), "app/hub.css"), "utf8")

afterEach(cleanup)

describe("the HubRow", () => {
  it("draws its three densities at 36, 52 and 64px, 8px taller on touch", () => {
    expect(CSS).toMatch(/\.hub-row\[data-density="compact"\] \{\s*min-height: 36px;/)
    expect(CSS).toMatch(/\.hub-row\[data-density="two-line"\] \{\s*min-height: 52px;/)
    expect(CSS).toMatch(/\.hub-row\[data-density="feed"\] \{\s*--hub-lead: 32px;\s*min-height: 64px;/)
    const touch = CSS.slice(CSS.indexOf("@media (pointer: coarse)"))
    expect(touch).toMatch(/compact"\] \{ min-height: 44px; \}/)
    expect(touch).toMatch(/two-line"\] \{ min-height: 60px; \}/)
    expect(touch).toMatch(/feed"\] \{ min-height: 72px; \}/)
  })

  it("says unread with a dot in the gutter only: read and unread rows have the same weight", () => {
    const { container } = render(
      <>
        <HubRow density="feed" title={<b>Jonas</b>} unread />
        <HubRow density="feed" title={<b>Jonas</b>} unread={false} />
      </>,
    )
    const [a, b] = Array.from(container.querySelectorAll("[data-hub-row]"))
    expect(a.querySelector(".hub-unread-dot")?.hasAttribute("data-read")).toBe(false)
    expect(b.querySelector(".hub-unread-dot")?.hasAttribute("data-read")).toBe(true)
    const weight = (el: Element) => el.querySelector(".min-w-0 > span")?.className
    expect(weight(a)).toBe(weight(b))
  })

  it("has no dot at all in a list with no read state", () => {
    const { container } = render(<HubRow density="two-line" title="Write the launch announcement" />)
    expect(container.querySelector(".hub-unread-dot")).toBeNull()
  })

  it("floats its toolbar on e3 at r10, in place of the meta on hover", () => {
    const tools = CSS.slice(CSS.indexOf(".hub-row-tools {"), CSS.indexOf("}", CSS.indexOf(".hub-row-tools {")))
    expect(tools).toMatch(/border-radius: 10px/)
    expect(tools).toMatch(/box-shadow: var\(--e3\)/)
    expect(CSS).toMatch(/\.hub-row\[data-has-tools\]:is\(:hover, :focus-within\) \.hub-row-meta \{\s*opacity: 0;/)
    const { container } = render(
      <HubRow density="two-line" title="t" meta="10:42" tools={<HubToolButton label="Done" shortcut="E">x</HubToolButton>} />,
    )
    expect(container.querySelector("[data-has-tools]")).toBeTruthy()
    expect(container.querySelector("button")?.getAttribute("title")).toBe("Done (E)")
  })

  it("draws separators inset to the content column, never in compact", () => {
    expect(CSS).toMatch(/\.hub-row:is\(\[data-density="two-line"\], \[data-density="feed"\]\) \+ \.hub-row::before/)
    expect(CSS).toMatch(/left: calc\(12px \+ var\(--hub-lead\) \+ 12px\)/)
  })

  it("leaves with the resolve recipe's slide, by transform", () => {
    const { container } = render(<HubRow density="two-line" title="t" resolve="leaving" />)
    expect(container.querySelector("[data-hub-row]")?.className).toContain("hub-resolve-out")
    const kf = CSS.slice(CSS.indexOf("@keyframes hub-resolve-out"), CSS.indexOf("}\n}", CSS.indexOf("@keyframes hub-resolve-out")))
    expect(kf).toMatch(/translateX\(12px\)/)
    expect(kf).not.toMatch(/height/)
  })

  it("has a skeleton in its own shape", () => {
    const { container } = render(<HubRowSkeleton density="feed" />)
    expect(container.querySelector("[data-hub-skeleton][data-density=feed]")).toBeTruthy()
  })
})

describe("the kind badge", () => {
  it("draws a refusal in the agent's tint, never danger or brand", () => {
    expect(KIND_BADGE_TONE.refused).toBe("bg-agent-muted text-agent-ink")
    for (const tone of Object.values(KIND_BADGE_TONE)) expect(tone).not.toMatch(/danger|destructive/)
    const { container } = render(<KindBadge kind="reaction" emoji="🎉" />)
    expect(container.textContent).toBe("🎉")
  })
})

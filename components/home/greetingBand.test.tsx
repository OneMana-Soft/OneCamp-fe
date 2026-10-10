import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { GreetingBand } from "@/components/home/GreetingBand"

afterEach(cleanup)

describe("the greeting band", () => {
  it("carries one decorative orbit of the person's own channels, in their colours", () => {
    const { container } = render(<GreetingBand hues={["moss", "sky", "berry"]}>Good afternoon</GreetingBand>)
    const motif = container.querySelector("[data-greeting-motif]")!
    expect(motif.getAttribute("aria-hidden")).toBe("true")
    expect(motif.querySelectorAll("svg")).toHaveLength(1)
    const dots = [...motif.querySelectorAll("circle")].filter((c) => /hue-(moss|sky|berry)/.test(c.getAttribute("class") || ""))
    expect(dots).toHaveLength(3)
  })

  it("falls back to quiet rings for someone in no channel yet", () => {
    const { container } = render(<GreetingBand>Good morning</GreetingBand>)
    expect(container.querySelector("[data-greeting-motif] svg")).toBeTruthy()
  })
})

describe("search with nothing found", () => {
  it("shows the magnifier above its words", () => {
    const src = readFileSync(resolve(__dirname, "../../app/app/search/page.tsx"), "utf8")
    expect(src).toMatch(/<SpotSearch[^>]*\/>\s*<h2[^>]*>Nothing matches/)
  })
})

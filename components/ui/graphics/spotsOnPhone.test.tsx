import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { SpotDocs, SpotInbox, SpotTasks } from "./spots"

// Empty states take spot illustrations (96px). At 390 wide that pushed the
// sentence and the one action down; on a phone a spot is at most 72px.

afterEach(() => cleanup())

describe("spots on a phone", () => {
  it("marks every spot so the phone rule can find it", () => {
    for (const Spot of [SpotInbox, SpotTasks, SpotDocs]) {
      const { container } = render(<Spot />)
      expect(container.querySelector("svg")?.hasAttribute("data-spot")).toBe(true)
      cleanup()
    }
  })

  it("caps a spot at 72px below sm, and never enlarges a smaller one", () => {
    const css = readFileSync("app/globals.css", "utf8")
    expect(css).toMatch(/@media \(max-width: 639\.98px\) \{\s*svg\[data-spot\] \{\s*max-width: 72px;\s*max-height: 72px;/)
    const block = css.slice(css.indexOf("svg[data-spot]"), css.indexOf("svg[data-spot]") + 120)
    expect(block, "a fixed size would grow a 64px spot").not.toMatch(/(^|\s)(width|height):/)
  })
})

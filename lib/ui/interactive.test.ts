import { createElement } from "react"
import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"

import { ix, withLabel } from "./interactive"

// The interaction layer's attributes (INTERACTION_SPEC §9.2).
describe("ix", () => {
  it("names the kind and nothing else when nothing else is set", () => {
    expect(ix("row")).toEqual({ "data-interactive": "row" })
  })

  it("sets the hue, the tone, a selected that no ARIA state fits, and a reason it can't be used", () => {
    expect(ix("chip", { hue: "sun", selected: true, tone: "danger", disabledReason: "Archived projects can't be changed" })).toEqual({
      "data-interactive": "chip",
      "data-hue": "sun",
      "data-tone": "danger",
      "data-selected": "true",
      "aria-disabled": true,
      "data-disabled-reason": "Archived projects can't be changed",
    })
  })

  // Spread over a primitive's own attributes, an unset key once erased them:
  // a disabled menu item (Radix's aria-disabled) read as enabled.
  it("never erases a primitive's own attribute with one it hasn't set", () => {
    const { container } = render(createElement("div", { "aria-disabled": "true", "data-hue": "lake", ...ix("item") }))
    const el = container.firstElementChild!
    expect(el.getAttribute("aria-disabled")).toBe("true")
    expect(el.getAttribute("data-hue")).toBe("lake")
  })
})

describe("withLabel", () => {
  it("wraps a control's words in a label that reserves its selected weight (D8)", () => {
    const { container } = render(createElement("button", null, withLabel(["Board", createElement("span", { key: "c" }, "3")])))
    const label = container.querySelector("[data-label]")!
    expect(label.getAttribute("data-label")).toBe("Board")
    expect(label.textContent).toBe("Board")
    expect(container.querySelectorAll("[data-label]")).toHaveLength(1)
  })

  it("leaves space and anything that isn't words alone", () => {
    const { container } = render(createElement("button", null, withLabel([" ", createElement("svg", { key: "i" })])))
    expect(container.querySelector("[data-label]")).toBeNull()
  })
})

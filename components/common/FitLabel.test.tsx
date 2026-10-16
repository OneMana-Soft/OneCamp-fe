import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { FitLabel } from "./FitLabel"

// jsdom has no layout: every element is as wide as 10 px a character, and
// the row is as wide as the test says.
let rowWidth = 0
const realRect = Element.prototype.getBoundingClientRect
const realClient = Object.getOwnPropertyDescriptor(Element.prototype, "clientWidth")

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function () {
    const w = (this.textContent ?? "").length * 10
    return { width: w, height: 20, top: 0, left: 0, right: w, bottom: 20, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  }
  Object.defineProperty(Element.prototype, "clientWidth", {
    configurable: true,
    get() {
      return (this as HTMLElement).dataset?.testid === "row" ? rowWidth : 0
    },
  })
})
afterEach(() => {
  cleanup()
  Element.prototype.getBoundingClientRect = realRect
  if (realClient) Object.defineProperty(Element.prototype, "clientWidth", realClient)
})

const OPTIONS = ["12 – 18 Oct 2026", "12 – 18 Oct", "12–18 Oct"]
function row(width: number) {
  rowWidth = width
  return render(
    <div data-testid="row">
      <FitLabel options={OPTIONS} />
      <button type="button">Today</button>
    </div>,
  )
}

describe("FitLabel", () => {
  it("says it in full when the row has room", () => {
    const { container } = row(400)
    const label = container.querySelector("[data-fit-label]")!
    expect(label.firstChild?.textContent).toBe("12 – 18 Oct 2026")
    expect(label.getAttribute("title")).toBeNull()
  })

  it("drops to the longest wording that fits beside its neighbours, and reads the full one out", () => {
    // 200 px less "Today" (50) leaves 150: the year (160) goes, "12 – 18 Oct" (110) stays.
    const { container } = row(200)
    const label = container.querySelector("[data-fit-label]")!
    expect(label.querySelector('[aria-hidden="true"]')?.textContent).toBe("12 – 18 Oct")
    expect(label.querySelector(".sr-only")?.textContent).toBe("12 – 18 Oct 2026")
    expect(label.getAttribute("title")).toBe("12 – 18 Oct 2026")
  })

  it("only ever truncates its shortest wording", () => {
    const { container } = row(60)
    expect(container.querySelector("[data-fit-label] [aria-hidden='true']")?.textContent).toBe("12–18 Oct")
  })
})

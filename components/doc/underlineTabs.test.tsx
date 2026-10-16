import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { UnderlineTabs, edgeMask } from "./underlineTabs"

// The docs home's tabs (docs programme B5): one can be chosen or none (while
// a search shows every doc), and a row of tabs wider than its column fades
// at the edge with more past it, so a cut-off tab reads as more to scroll to.

afterEach(cleanup)

const TABS = [
  { value: "recent", label: "Recent", count: 4 },
  { value: "mine", label: "Mine", count: 3 },
  { value: "archived", label: "Archived" },
]

describe("underline tabs", () => {
  it("underline the chosen tab, and none when the value is no tab's", () => {
    const { container, rerender } = render(<UnderlineTabs tabs={TABS} value="mine" onValueChange={() => {}} label="Docs" />)
    expect(container.querySelector("[data-tab-indicator]")).not.toBeNull()
    expect(screen.getByRole("tab", { name: /Mine/ })).toHaveAttribute("aria-selected", "true")

    rerender(<UnderlineTabs tabs={TABS} value="" onValueChange={() => {}} label="Docs" />)
    expect(container.querySelector("[data-tab-indicator]")).toBeNull()
    expect(screen.getAllByRole("tab").map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"])
  })

  it("move from no tab to the first with →, and to the last with ←", () => {
    const pick = vi.fn()
    render(<UnderlineTabs tabs={TABS} value="" onValueChange={pick} label="Docs" />)
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" })
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" })
    expect(pick.mock.calls.map((c) => c[0])).toEqual(["recent", "archived"])
  })

  it("fade only an edge with more tabs past it", () => {
    expect(edgeMask(false, false)).toBeUndefined()
    expect(edgeMask(false, true)).toBe("linear-gradient(to right, black, black calc(100% - 24px), transparent)")
    expect(edgeMask(true, false)).toBe("linear-gradient(to right, transparent, black 24px, black)")
    expect(edgeMask(true, true)).toBe("linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)")
  })
})

import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"

import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "./drawer"

// Docs C1 (390px, dark, under load): Escape on the phone's date sheet left
// vaul's scrim in the page, and it took every tap after it. Radix keeps a
// closing sheet and its scrim mounted until their close animation reports its
// end, and Chrome reports nothing when one is interrupted (it fires no
// animationcancel). jsdom runs no animations, so here every close animation is
// one that never reports: what an interrupted one is in Chrome.

/** The computed animations phone.css and vaul give a sheet and its scrim: one name open, another closed, 300ms. */
function closeAnimations() {
  const real = window.getComputedStyle.bind(window)
  return vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
    const style = real(el, pseudo)
    if (!(el instanceof HTMLElement) || !el.matches("[data-vaul-overlay], [data-vaul-drawer]")) return style
    const scrim = el.hasAttribute("data-vaul-overlay")
    return new Proxy(style, {
      get(target, prop) {
        const closed = el.getAttribute("data-state") === "closed"
        if (prop === "animationName") return scrim ? (closed ? "fadeOut" : "fadeIn") : closed ? "slideToBottom" : "slideFromBottom"
        if (prop === "animationDuration") return "0.3s"
        if (prop === "animationDelay") return "0s"
        const value = Reflect.get(target, prop)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
  })
}

function DateSheet() {
  const [open, setOpen] = React.useState(true)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerTitle>Pick a date</DrawerTitle>
          <DrawerDescription>The day it is due</DrawerDescription>
          <p>days</p>
        </DrawerContent>
      </Drawer>
    </>
  )
}

const scrim = () => document.querySelector("[data-vaul-overlay]")
const sheet = () => document.querySelector("[data-vaul-drawer]")

describe("a sheet that closes", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    closeAnimations()
    // Radix matches an animation's end by CSS.escape, which jsdom lacks.
    if (typeof CSS === "undefined") vi.stubGlobal("CSS", { escape: (s: string) => s })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.removeAttribute("style")
  })

  it("takes its scrim and itself out of the page when the close animation never reports its end", async () => {
    render(<DateSheet />)
    expect(scrim()).not.toBeNull()

    fireEvent.keyDown(document.body, { key: "Escape" })
    // Still there while it goes: the close animation is 300ms.
    expect(scrim()?.getAttribute("data-state")).toBe("closed")
    expect(scrim()).not.toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(scrim()).toBeNull()
    expect(sheet()).toBeNull()
  })

  it("keeps a sheet that opens again before its close has settled", async () => {
    const { getByRole } = render(<DateSheet />)
    fireEvent.keyDown(document.body, { key: "Escape" })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    fireEvent.click(getByRole("button", { name: "Open", hidden: true }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(scrim()?.getAttribute("data-state")).toBe("open")
    expect(sheet()?.getAttribute("data-state")).toBe("open")
  })
})

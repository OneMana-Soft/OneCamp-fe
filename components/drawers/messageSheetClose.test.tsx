import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"

// The long-press sheet drew vaul's scrim and sheet itself, so the shared
// drawer's fix for a close Chrome never reports (components/ui/drawer,
// drawerClose.test) passed it by: its scrim could stay over the page and take
// every tap after it (REVIEW-FE-SHELL db2 F2). It is the shared sheet now.
// jsdom runs no animations, so every close animation here is one that never
// reports its end, as an interrupted one in Chrome.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy: vi.fn() }) }))
vi.mock("@/hooks/useLater", () => ({ useSavedEntry: () => undefined, useLaterActions: () => ({ save: vi.fn(async () => {}), remove: vi.fn(async () => {}) }) }))
vi.mock("@/components/message/chatFace", () => ({ ChatFace: () => <span data-face="" /> }))

const { MessageActionSheet } = await import("./messageActionSheet")

/** As drawerClose.test: the computed animations of a sheet and its scrim, 300ms, one name open and another closed. */
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

function Sheet() {
  const [open, setOpen] = React.useState(true)
  return (
    <MessageActionSheet
      open={open}
      onOpenChange={setOpen}
      threadPath="/app/channel/c1/p1"
      onAddEmoji={() => {}}
      handleEmojiClick={() => {}}
      copyText={() => {}}
      editMessage={() => {}}
      deleteMessage={() => {}}
      messageText="Added them under Decisions."
    />
  )
}

const scrim = () => document.querySelector("[data-vaul-overlay]")

describe("the long-press sheet", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    closeAnimations()
    if (typeof CSS === "undefined") vi.stubGlobal("CSS", { escape: (s: string) => s })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.removeAttribute("style")
  })

  it("is the shared sheet, with its one scrim", () => {
    render(<Sheet />)
    const sheet = document.querySelector("[data-message-sheet]")!
    expect(sheet.hasAttribute("data-v3-sheet")).toBe(true)
    expect(scrim()?.hasAttribute("data-v3-scrim")).toBe(true)
  })

  it("takes its scrim out of the page when the close animation never reports its end", async () => {
    render(<Sheet />)
    expect(scrim()).not.toBeNull()
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(scrim()?.getAttribute("data-state")).toBe("closed")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(scrim()).toBeNull()
  })
})

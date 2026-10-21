import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const read = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8")

let api: typeof import("@/hooks/use-toast")
let Toaster: typeof import("@/components/ui/toaster").Toaster
let ToastAction: typeof import("@/components/ui/toast").ToastAction

const graph = () => Promise.all([import("@/hooks/use-toast"), import("@/components/ui/toaster"), import("@/components/ui/toast")])
// Compiled once while the file is collected, which no hook's time limit
// covers: under load the first compile took the first test's setup past the
// hook's ten seconds. Each test then imports them afresh, which is quick.
await graph()

beforeEach(async () => {
  vi.resetModules()
  const [toasts, toaster, toast] = await graph()
  api = toasts
  Toaster = toaster.Toaster
  ToastAction = toast.ToastAction
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("where toasts are drawn", () => {
  // The one Toaster lived in the signed-in app's providers, so a toast on a
  // guest page, the invoice page or any signed-out page drew nothing: a
  // guest's comment that failed to post failed in silence.
  it("is one Toaster at the root, under every page", () => {
    expect(read("components/providers/ClientProviders.tsx")).toMatch(/<Toaster\s*\/>/)
    expect(read("app/app/ClientProviders.tsx")).not.toMatch(/<Toaster\b/)
  })

  // Design v3, mobile C9 (which moved shell T1's phone toast): on a phone,
  // 12px above whatever owns the bottom of the screen, the tab bar or the
  // composer (--phone-floor, from --mobile-drawer-h), so it never covers the
  // box the person types in; centred, at most 360px. From sm, bottom right
  // 24px from the window, which is 16px inside the sheet, above the right
  // corner stack.
  it("sits above the tab bar or the composer on a phone, and bottom right, inside the sheet, from sm up", async () => {
    const { ToastProvider, ToastViewport } = await import("@/components/ui/toast")
    render(
      <ToastProvider>
        <ToastViewport data-testid="viewport" />
      </ToastProvider>,
    )
    const cls = screen.getByTestId("viewport").className.split(/\s+/)
    expect(cls).toContain("bottom-[max(calc(var(--phone-floor)+12px),var(--call-dock-floor,0px))]")
    expect(cls).toContain("w-[min(100%-32px,360px)]")
    expect(cls).toContain("left-1/2")
    expect(cls).not.toContain("top-[calc(env(safe-area-inset-top)+0.5rem)]")
    // 16px inside the sheet's right edge, the right panel's while it's open
    // (QA DSA-19: a failed comment's toast sat on the panel's composer).
    expect(cls).toContain("sm:right-[calc(var(--shell-right-inset,8px)+16px)]")
    expect(cls).toContain("sm:translate-x-0")
    expect(cls).toContain("sm:bottom-[max(calc(1.5rem+var(--corner-right-h,0px)),var(--call-dock-floor,0px))]")
    expect(cls).toContain("sm:w-[356px]")
  })

  // A call's notices ("Sam muted you") sat on its dock, over Leave at 1280 and
  // over the whole dock on a phone (DESIGN-BUILD-2, 17 Oct 2026): while a call
  // is on screen its dock sets --call-dock-floor, and the toasts stay above it.
  it("stays above a call's dock while one is on screen, and is as before without one", () => {
    const css = read("components/ui/toast.tsx")
    expect(css).toContain("var(--call-dock-floor,0px)")
    // The dock is the variable's only writer (VideoControls' useDockFloor).
    expect(read("components/livekit/VideoControls.tsx")).toContain('"--call-dock-floor"')
  })

  it("reads the phone's floor from the shell: the tab bar, or a page's composer", () => {
    const css = read("app/phone.css")
    expect(css).toMatch(/--phone-floor:\s*calc\(var\(--m-tab\) \+ env\(safe-area-inset-bottom\)\)/)
    const shell = read("components/navigationBar/mobile/mobileNavigationBar.tsx")
    expect(shell).toContain('"--phone-floor", "var(--mobile-drawer-h, env(safe-area-inset-bottom))"')
    // Swiped down to go, on a phone.
    expect(read("components/ui/toaster.tsx")).toContain('swipeDirection={phone ? "down" : "right"}')
  })
})

describe("the stack", () => {
  it("shows three toasts, newest in front", () => {
    render(<Toaster />)
    act(() => {
      for (const t of ["One", "Two", "Three", "Four"]) api.toast({ title: t })
    })
    const front = screen.getByText("Four").closest("li")!
    expect(front.getAttribute("data-index")).toBe("0")
    expect(screen.getByText("Two").closest("li")!.getAttribute("data-index")).toBe("2")
    // The oldest is on its way out: closed (it leaves with its exit), so it
    // is open no longer. (jsdom plays no exit, so it is gone at once here.)
    const one = screen.queryByText("One")?.closest("li")
    expect(one?.getAttribute("data-state") ?? "closed").toBe("closed")
    expect(api.useToast().toasts.filter((t) => t.open !== false).map((t) => t.title)).toEqual(["Four", "Three", "Two"])
  })

  // With one at a time, a second toast silently replaced the first, Undo and
  // all, while the person reached for it.
  it("never closes an Undo to make room", () => {
    render(<Toaster />)
    act(() => {
      api.toast({ title: "Moved to Done", action: <ToastAction altText="Undo">Undo</ToastAction> })
      for (const t of ["A", "B", "C"]) api.toast({ title: t })
    })
    expect(screen.getByText("Moved to Done").closest("li")!.getAttribute("data-state")).toBe("open")
    expect(api.useToast().toasts.filter((t) => t.open !== false).map((t) => t.title)).toEqual(["C", "B", "Moved to Done"])
  })

  it("opens out and pauses every timer while pointed at", () => {
    render(<Toaster />)
    act(() => {
      api.toast({ title: "Link copied" })
    })
    const viewport = document.querySelector(".toast-viewport") as HTMLElement
    expect(viewport.hasAttribute("data-expanded")).toBe(false)
    fireEvent.pointerEnter(viewport)
    expect(viewport.hasAttribute("data-expanded")).toBe(true)
    expect(viewport.hasAttribute("data-paused")).toBe(true)
    fireEvent.pointerLeave(viewport)
    expect(viewport.hasAttribute("data-expanded")).toBe(false)
  })

  it("draws a timer line on a toast with an action, and only there", () => {
    render(<Toaster />)
    act(() => {
      api.toast({ title: "Plain" })
      api.toast({ title: "Undoable", action: <ToastAction altText="Undo">Undo</ToastAction> })
    })
    expect(screen.getByText("Plain").closest("li")!.querySelector(".toast-timer")).toBeNull()
    expect(screen.getByText("Undoable").closest("li")!.querySelector(".toast-timer")).not.toBeNull()
  })

  it("leads with the tile its kind calls for", () => {
    render(<Toaster />)
    act(() => {
      api.toast({ title: "Saved" })
      api.toast({ title: "Couldn't save", variant: "destructive" })
      api.toast({ title: "Importing", tone: "loading" })
    })
    expect(screen.getByText("Saved").closest("li")!.querySelector("[data-tone=success]")).not.toBeNull()
    expect(screen.getByText("Couldn't save").closest("li")!.querySelector("[data-tone=error]")).not.toBeNull()
    expect(screen.getByText("Importing").closest("li")!.querySelector("[data-tone=loading]")).not.toBeNull()
  })
})

describe("how long a toast stays", () => {
  it("is 4s plain, 6s with an action, 8s for an error with Retry, and open-ended while loading", () => {
    const action = <ToastAction altText="Undo">Undo</ToastAction>
    expect(api.toastDuration({})).toBe(4000)
    expect(api.toastDuration({ action })).toBe(6000)
    expect(api.toastDuration({ action, variant: "destructive" })).toBe(8000)
    expect(api.toastDuration({ variant: "destructive" })).toBe(6000)
    expect(api.toastDuration({ tone: "error" })).toBe(6000)
    expect(api.toastDuration({ tone: "loading" })).toBe(Infinity)
    expect(api.toastDuration({ duration: 20000 })).toBe(20000)
  })

  it("keeps the 4s it was given without one asked for", () => {
    vi.useFakeTimers()
    render(<Toaster />)
    act(() => {
      api.toast({ title: "Saved" })
    })
    act(() => {
      vi.advanceTimersByTime(3500)
    })
    expect(screen.getByText("Saved").closest("li")!.getAttribute("data-state")).toBe("open")
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByText("Saved")?.closest("li")?.getAttribute("data-state") ?? "closed").toBe("closed")
  })
})

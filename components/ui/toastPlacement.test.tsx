import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import postcss from "postcss"

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
    // (QA DSA-19: a failed comment's toast sat on the panel's composer), and
    // over a call, 16px inside its stage, clear of the side column that the
    // stage's right edge marks (DESIGN-BUILD-18: a notice covered the call
    // chat's held line at 1280).
    expect(cls).toContain("sm:right-[calc(max(var(--shell-right-inset,8px),var(--call-stage-right,0px))+16px)]")
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
    // The dock is the variable's only writer (VideoControls, through useRootPlace).
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

  // B-2's sections sheet at 390: a toast came up over Add section, at the
  // sheet's foot (DESIGN-BUILD-5, 22 Oct 2026). While a sheet is open it owns
  // the bottom of the screen, as the keyboard does, so toasts come in under
  // the top bar then too. The sheet marks the page (components/ui/drawer).
  // A menu, popover or select is a phone's sheet too (app/overlay.css 8,
  // components/ui/floatMark): a call's notice came in over More's rows, on
  // Raise your hand (DESIGN-BUILD-20, 26 Oct).
  it("comes in under the top bar while a sheet is open, a drawer or a float, as while the keyboard is up", () => {
    const rules: { selector: string; decls: string }[] = []
    postcss.parse(read("app/phone.css")).walkRules((r) => {
      rules.push({ selector: r.selector, decls: r.nodes.map(String).join("; ") })
    })
    const html = document.documentElement
    const check = (cls: string, says: RegExp) => {
      const found = rules.filter((r) => r.selector.includes(`.${cls}`) && says.test(r.decls))
      expect(found, `${cls}: one rule that moves it to the top`).toHaveLength(1)
      const el = document.createElement("li")
      el.className = cls
      document.body.append(el)
      try {
        expect(el.matches(found[0].selector), `${cls} at rest`).toBe(false)
        html.setAttribute("data-keyboard", "open")
        expect(el.matches(found[0].selector), `${cls} over the keyboard`).toBe(true)
        html.removeAttribute("data-keyboard")
        html.setAttribute("data-sheet", "open")
        expect(el.matches(found[0].selector), `${cls} over a sheet`).toBe(true)
        html.removeAttribute("data-sheet")
        html.setAttribute("data-float", "")
        expect(el.matches(found[0].selector), `${cls} over a float's sheet`).toBe(true)
      } finally {
        html.removeAttribute("data-keyboard")
        html.removeAttribute("data-sheet")
        html.removeAttribute("data-float")
        el.remove()
      }
    }
    check("toast-viewport", /bottom: auto !important/)
    check("toast-root", /transform-origin: 50% 0%/)
  })

  // On a call's own page the call sits under the app bar and any banner, and
  // a notice under the bar covered its place pill while More's sheet was up
  // (DESIGN-BUILD-20, 26 Oct). While a call is on screen they come in 12px
  // under its top row, which the call keeps on the page's root (--call-top),
  // or under the bar when that is lower: a call that fills the screen, or one
  // whose top has scrolled away. "The bar" counts a row docked under it (a
  // doc's connection row, --docked-row-h, 0 when none: VERIFY V-21).
  it("comes in 12px under a call's top row instead, when that is lower than the bar", () => {
    const tops: string[] = []
    postcss.parse(read("app/phone.css")).walkRules((r) => {
      if (r.selector.includes(".toast-viewport") && r.nodes.some((d) => String(d) === "bottom: auto !important")) r.walkDecls("top", (d) => void tops.push(d.value))
    })
    expect(tops).toEqual([
      "max(calc(var(--app-vv-top, 0px) + env(safe-area-inset-top) + var(--m-bar) + var(--docked-row-h, 0px) + 12px), calc(var(--call-top, 0px) + 12px))",
    ])
    // The call's stage is the variable's only writer.
    expect(read("components/livekit/VideoConference.tsx")).toContain('useRootPlace("--call-top"')
  })

  // calls-7's room form at 390: no keyboard reported, so the Undo at the foot
  // sat over the Address field being typed in, and over its error.
  it("comes in under the top bar while the field in use meets its foot slot, on a phone", async () => {
    const { ToastProvider, ToastViewport } = await import("@/components/ui/toast")
    const { meetsFootSlot } = await import("@/components/ui/toastFootSlot")
    const box = (top: number, bottom: number) => ({ top, bottom, height: bottom - top, left: 0, right: 0, width: 0, x: 0, y: top, toJSON() {} }) as DOMRect
    const list = document.createElement("ol")
    list.getBoundingClientRect = () => box(788, 788)
    expect(meetsFootSlot(box(760, 790), list), "a field across the pill's 44px").toBe(true)
    expect(meetsFootSlot(box(700, 740), list), "a field above it").toBe(false)
    const card = list.appendChild(document.createElement("div"))
    card.className = "toast-card"
    card.getBoundingClientRect = () => box(708, 788)
    expect(meetsFootSlot(box(700, 740), list), "a field behind a two-line toast").toBe(true)

    let phone = true
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: phone && q.includes("max-width"), media: q, addEventListener() {}, removeEventListener() {} }))
    render(
      <ToastProvider>
        <ToastViewport data-testid="viewport" />
      </ToastProvider>,
    )
    const vp = screen.getByTestId("viewport")
    vp.getBoundingClientRect = () => box(788, 788)
    const field = document.body.appendChild(document.createElement("input"))
    field.getBoundingClientRect = () => box(752, 792)
    const button = document.body.appendChild(document.createElement("button"))
    button.getBoundingClientRect = () => box(752, 792)
    try {
      // The first field used on a phone fetches the slot's code (off first load).
      act(() => field.focus())
      await vi.waitFor(() => expect(vp.dataset.slot, "the field in the foot slot").toBe("top"))
      act(() => button.focus())
      expect(vp.dataset.slot, "a button: nothing is typed under the toast").toBeUndefined()
      field.getBoundingClientRect = () => box(300, 340)
      act(() => field.focus())
      expect(vp.dataset.slot, "a field well above the slot").toBeUndefined()
      field.getBoundingClientRect = () => box(752, 792)
      act(() => button.focus())
      act(() => field.focus())
      act(() => field.blur())
      expect(vp.dataset.slot, "nothing in use").toBeUndefined()
      phone = false
      act(() => field.focus())
      expect(vp.dataset.slot, "from sm up the toasts sit bottom right, off the form").toBeUndefined()
    } finally {
      field.remove()
      button.remove()
      vi.unstubAllGlobals()
    }

    const rules: string[] = []
    postcss.parse(read("app/phone.css")).walkRules((r) => {
      if (/bottom: auto !important|transform-origin: 50% 0%/.test(r.nodes.map(String).join("; "))) rules.push(r.selector)
    })
    const top = document.body.appendChild(document.createElement("ol"))
    top.className = "toast-viewport"
    top.dataset.slot = "top"
    const root = top.appendChild(document.createElement("li"))
    root.className = "toast-root"
    try {
      expect(rules.some((s) => top.matches(s)), "the list moves to the top").toBe(true)
      expect(rules.some((s) => root.matches(s)), "its toasts stack from the top").toBe(true)
    } finally {
      top.remove()
    }
  })

  // DESIGN-BUILD-13: Undo's hover was a shadow only, 1.07:1 in light.
  it("gives its action the layer's states: a hover anyone can see", async () => {
    const { ToastProvider, ToastViewport, Toast } = await import("@/components/ui/toast")
    render(
      <ToastProvider>
        <Toast open>
          <ToastAction altText="Undo">Undo</ToastAction>
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    )
    expect(screen.getByRole("button", { name: "Undo" })).toHaveAttribute("data-interactive", "button")
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

import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it } from "vitest"
import { bringsUpKeyboard, followKeyboard, keyboardFit, KEYBOARD_MIN_PX } from "./visualViewport"

// A phone's keyboard shrinks only the visual viewport, so a composer on the
// bottom edge of a 100dvh frame ends up behind it. While the keyboard is up
// the frame is fitted to what is left; otherwise nothing is written.

const sample = (height: number, extra: Partial<{ offsetTop: number; scale: number; editing: boolean }> = {}) => ({
  height,
  offsetTop: 0,
  scale: 1,
  editing: true,
  ...extra,
})

describe("keyboardFit", () => {
  it("is open when an editable field has focus and the visible height drops by a keyboard", () => {
    expect(keyboardFit(sample(380, { offsetTop: 284 }), 664)).toEqual({ open: true, height: 380, top: 284 })
  })

  it("ignores the address bar and toolbars, which move it by less than a keyboard", () => {
    expect(keyboardFit(sample(664 - (KEYBOARD_MIN_PX - 1)), 664).open).toBe(false)
    expect(keyboardFit(sample(610), 664).open).toBe(false)
  })

  it("is closed with nothing to type in, or while pinch-zoomed", () => {
    expect(keyboardFit(sample(380, { editing: false }), 664).open).toBe(false)
    expect(keyboardFit(sample(332, { scale: 2 }), 664).open).toBe(false)
  })
})

describe("bringsUpKeyboard", () => {
  it("is true for text fields and editable content, false for buttons and checkboxes", () => {
    const text = document.createElement("input")
    const check = document.createElement("input")
    check.type = "checkbox"
    const area = document.createElement("textarea")
    const button = document.createElement("button")
    const editable = document.createElement("div")
    editable.contentEditable = "true"
    // jsdom does not compute isContentEditable.
    Object.defineProperty(editable, "isContentEditable", { value: true })
    expect([text, area, editable].map(bringsUpKeyboard)).toEqual([true, true, true])
    expect([check, button, null].map(bringsUpKeyboard)).toEqual([false, false, false])
  })
})

/** A visual viewport that a test can move, as a keyboard would. */
function fakeWindow(height: number) {
  const listeners: Record<string, Array<() => void>> = {}
  const vv = {
    height,
    offsetTop: 0,
    scale: 1,
    addEventListener: (t: string, f: () => void) => (listeners[t] ??= []).push(f),
    removeEventListener: (t: string, f: () => void) => (listeners[t] = (listeners[t] ?? []).filter((g) => g !== f)),
  }
  // Frames run when the test says so, after the events, as in a browser.
  let frames: FrameRequestCallback[] = []
  const win = {
    visualViewport: vv as unknown as VisualViewport,
    innerWidth: 390,
    document,
    requestAnimationFrame: (cb: FrameRequestCallback) => frames.push(cb),
    cancelAnimationFrame: () => {},
  }
  const flush = () => {
    const due = frames
    frames = []
    due.forEach((cb) => cb(0))
  }
  const fire = (t: string) => {
    ;(listeners[t] ?? []).forEach((f) => f())
    flush()
  }
  return { win, vv, fire, listeners, flush }
}

const root = document.documentElement

afterEach(() => {
  document.body.innerHTML = ""
  root.removeAttribute("data-keyboard")
  root.style.removeProperty("--app-vvh")
  root.style.removeProperty("--app-vv-top")
})

describe("followKeyboard", () => {
  it("fits the frame while the keyboard is up, and writes nothing once it is down", () => {
    const { win, vv, fire, flush } = fakeWindow(664)
    const stop = followKeyboard(win)
    const input = document.createElement("input")
    document.body.appendChild(input)
    input.focus()
    flush()

    vv.height = 380
    vv.offsetTop = 284 // iOS pans the page up to show the caret
    fire("resize")
    expect(root.getAttribute("data-keyboard")).toBe("open")
    expect(root.style.getPropertyValue("--app-vvh")).toBe("380px")
    expect(root.style.getPropertyValue("--app-vv-top")).toBe("284px")

    // Following the pan as the person drags the page.
    vv.offsetTop = 200
    fire("scroll")
    expect(root.style.getPropertyValue("--app-vv-top")).toBe("200px")

    vv.height = 664
    vv.offsetTop = 0
    fire("resize")
    expect(root.hasAttribute("data-keyboard")).toBe(false)
    expect(root.style.getPropertyValue("--app-vvh")).toBe("")
    stop()
  })

  it("leaves the frame alone when the address bar hides or a window is resized", () => {
    const { win, vv, fire } = fakeWindow(664)
    const stop = followKeyboard(win)
    vv.height = 610
    fire("resize")
    expect(root.hasAttribute("data-keyboard")).toBe(false)
    // A desktop window made shorter with nothing focused.
    vv.height = 400
    fire("resize")
    expect(root.hasAttribute("data-keyboard")).toBe(false)
    stop()
  })

  it("lets go of everything when it stops", () => {
    const { win, vv, fire, listeners, flush } = fakeWindow(664)
    const stop = followKeyboard(win)
    const area = document.createElement("textarea")
    document.body.appendChild(area)
    area.focus()
    flush()
    vv.height = 380
    fire("resize")
    expect(root.getAttribute("data-keyboard")).toBe("open")
    stop()
    expect(root.hasAttribute("data-keyboard")).toBe(false)
    expect((listeners.resize ?? []).length + (listeners.scroll ?? []).length).toBe(0)
  })
})

describe("where it applies", () => {
  it("fits both shells' frames, over their own h-dvh, and hides the tab bar", () => {
    const css = readFileSync("app/globals.css", "utf8")
    const rule = css.match(/html\[data-keyboard="open"\] \[data-app-viewport\] \{([^}]*)\}/)?.[1] ?? ""
    expect(rule).toContain("height: var(--app-vvh)")
    expect(rule).toContain("transform: translateY(var(--app-vv-top))")
    expect(css).toMatch(/html\[data-keyboard="open"\] \[data-app-viewport\] nav\[aria-label="Primary"\] \{\s*visibility: hidden;/)
    // Unlayered: inside @layer the frame's own h-dvh utility would win.
    const before = css.slice(0, css.indexOf('html[data-keyboard="open"]'))
    const opened = (before.match(/@layer[^{;]*\{/g) ?? []).length
    const depth = [...before].reduce((d, ch) => d + (ch === "{" ? 1 : ch === "}" ? -1 : 0), 0)
    expect(depth, "the keyboard rule sits inside a block").toBe(0)
    expect(opened).toBeGreaterThan(0)

    for (const shell of ["components/navigationBar/mobile/mobileNavigationBar.tsx", "components/navigationBar/desktop/desktopNavigationBar.tsx"]) {
      expect(readFileSync(shell, "utf8"), shell).toMatch(/data-app-viewport="" className="flex flex-col h-dvh/)
    }
    expect(readFileSync("app/app/LayoutContent.tsx", "utf8")).toContain("useEffect(() => followKeyboard(), [])")
  })

  it("asks Android to resize the page for the keyboard again", () => {
    expect(readFileSync("app/layout.tsx", "utf8")).toMatch(/interactiveWidget: "resizes-content"/)
  })
})

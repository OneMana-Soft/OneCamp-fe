import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"

import { SettingRow, SwitchRow } from "@/components/ui/settingsSection"
import { settingIdOf } from "@/lib/settingsIds"
import { flashCard, useJumpFlash } from "./useJumpFlash"

// A jump from Search settings lands on the field itself (design-14): the row
// comes into view, its control takes the focus, and the row flashes. A jump to
// a card still flashes the card.

let scrolled: Element[] = []
beforeEach(() => {
  scrolled = []
  Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
    scrolled.push(this)
  })
})
afterEach(cleanup)

function Card() {
  return (
    <div id="ai-models-web-search" data-settings-card="" className="set-card">
      <SwitchRow label="Use web search" checked={false} onChange={() => {}} />
      <SettingRow label="Context window" controlId="ai-ctx">
        <input id="ai-ctx" defaultValue="8000" />
      </SettingRow>
    </div>
  )
}

describe("a jump to a field", () => {
  it("brings its row into view, focuses its switch, and flashes the row", () => {
    render(<Card />)
    act(() => void flashCard(settingIdOf("Use web search")))
    const row = document.querySelector('[data-setting-row="switch"]')!
    expect(document.activeElement).toBe(document.getElementById(settingIdOf("Use web search")))
    expect(scrolled).toEqual([row])
    expect(row.classList.contains("set-flash")).toBe(true)
    expect(document.querySelector("[data-settings-card]")!.classList.contains("set-flash"), "the card itself doesn't flash").toBe(false)
  })

  it("focuses a field's input the same way", () => {
    render(<Card />)
    act(() => void flashCard("ai-ctx"))
    expect(document.activeElement).toBe(document.getElementById("ai-ctx"))
    expect(document.getElementById("ai-ctx")!.closest("[data-setting-row]")!.classList.contains("set-flash")).toBe(true)
  })
})

describe("a jump to a card", () => {
  it("flashes the card and moves no focus", () => {
    render(<Card />)
    const before = document.activeElement
    act(() => void flashCard("ai-models-web-search"))
    expect(document.querySelector("[data-settings-card]")!.classList.contains("set-flash")).toBe(true)
    expect(document.activeElement).toBe(before)
  })
})

// DESIGN-BUILD-6's re-shoot (22 Oct): a field near the end of a page that was
// still filling in could only scroll as far as the page then went, and was
// left at the foot of the screen, out of sight, while the cards below it came.
describe("a jump while the page is still filling in", () => {
  // The page as a column: its frame at the top, cards above the row (`above`)
  // and below it (`below`) that fill in late. The row sits `above` px further
  // down the frame, however far the page is scrolled.
  let above = 0
  let below = 0
  let scrolledBy = 0
  let grow = () => {}
  beforeEach(() => {
    vi.useFakeTimers()
    above = 0
    below = 0
    scrolledBy = 0
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private readonly changed: () => void) {}
        observe() {
          grow = () => this.changed()
        }
        disconnect() {
          grow = () => {}
        }
      },
    )
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function page() {
    render(
      <div data-page-frame="narrow">
        <Card />
      </div>,
    )
    const frame = document.querySelector<HTMLElement>("[data-page-frame]")!
    const row = document.querySelector<HTMLElement>('[data-setting-row="switch"]')!
    Object.defineProperty(frame, "clientHeight", { get: () => 600 + above + below })
    Object.defineProperty(frame, "getBoundingClientRect", { value: () => new DOMRect(0, -scrolledBy, 720, 600 + above + below) })
    Object.defineProperty(row, "getBoundingClientRect", { value: () => new DOMRect(0, 200 + above - scrolledBy, 720, 56) })
    return row
  }
  function fill(px: { above?: number; below?: number }) {
    above += px.above ?? 0
    below += px.below ?? 0
    grow()
  }

  it("brings the row back to its place as a card above it fills in", async () => {
    const row = page()
    act(() => void flashCard(settingIdOf("Use web search")))
    await act(() => vi.dynamicImportSettled())
    fill({ above: 800 })
    expect(scrolled).toEqual([row, row])
  })

  // V-1117: on a busy day the keywords' read answered after the flash had
  // faded (1.3 s), and the field it pushed off the screen stayed off.
  it("keeps holding after the flash has faded, while the page may still fill in", async () => {
    const row = page()
    act(() => void flashCard(settingIdOf("Use web search")))
    await act(() => vi.dynamicImportSettled())
    act(() => void vi.advanceTimersByTime(2500))
    expect(row.classList.contains("set-flash")).toBe(false)
    fill({ above: 120 })
    expect(scrolled).toEqual([row, row])
    act(() => void vi.advanceTimersByTime(30_000))
    fill({ above: 120 })
    expect(scrolled).toEqual([row, row])
  })

  // V-1117: the hold's code loads on its own. A card that filled in before it
  // arrived was taken for the page as it was, so the row was never brought back.
  it("holds the place the jump landed on, even when the page grows before the hold's code arrives", async () => {
    const row = page()
    act(() => void flashCard(settingIdOf("Use web search")))
    above = 300
    await act(() => vi.dynamicImportSettled())
    expect(scrolled).toEqual([row, row])
  })

  // Only what moves the row brings it back: a page that grows below it, or
  // is scrolled, leaves it where it is.
  it("doesn't move the page when it grows below the row", async () => {
    const row = page()
    act(() => void flashCard(settingIdOf("Use web search")))
    await act(() => vi.dynamicImportSettled())
    scrolledBy = 400
    fill({ below: 900 })
    expect(scrolled).toEqual([row])
  })

  it("lets go once the person scrolls", async () => {
    const row = page()
    act(() => void flashCard(settingIdOf("Use web search")))
    await act(() => vi.dynamicImportSettled())
    window.dispatchEvent(new WheelEvent("wheel"))
    fill({ above: 800 })
    expect(scrolled).toEqual([row])
  })

  // Dragging the scrollbar fires no wheel, touch or key event, so the hold
  // pulled the page back under the person's pointer mid-drag.
  it("lets go once the person takes the scrollbar", async () => {
    const row = page()
    act(() => void flashCard(settingIdOf("Use web search")))
    await act(() => vi.dynamicImportSettled())
    window.dispatchEvent(new Event("pointerdown"))
    fill({ above: 800 })
    expect(scrolled).toEqual([row])
  })

  it("lets go of the first landing when the person jumps again", async () => {
    const row = page()
    const ctx = document.querySelector<HTMLElement>('[data-setting-row=""]')!
    Object.defineProperty(ctx, "getBoundingClientRect", { value: () => new DOMRect(0, 260 + above - scrolledBy, 720, 56) })
    act(() => void flashCard(settingIdOf("Use web search")))
    await act(() => vi.dynamicImportSettled())
    act(() => void flashCard("ai-ctx"))
    await act(() => vi.dynamicImportSettled())
    expect(scrolled).toEqual([row, ctx])
    fill({ above: 800 })
    expect(scrolled).toEqual([row, ctx, ctx])
  })
})

// A link to a card that draws late: the admins' notice links to the earlier
// imports' section, which draws only once its own read answers, sometimes
// after the page's first looks (CR-52, 26 Oct). The page's jump lands it once,
// whenever it draws, unless the person has taken the page over by then.
describe("a jump to a card that draws late", () => {
  function Page({ drawn, card = "late-card" }: { drawn: boolean; card?: string }) {
    useJumpFlash("import")
    return <main>{drawn ? <section id={card} data-settings-card="" /> : null}</main>
  }
  const card = (id = "late-card") => document.getElementById(id)!
  // Time passes, and the jump's code, fetched as it starts, has arrived.
  async function wait(ms: number) {
    await act(async () => {
      await vi.dynamicImportSettled()
      vi.advanceTimersByTime(ms)
    })
  }
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    window.history.replaceState(null, "", "#late-card")
  })
  afterEach(() => {
    vi.useRealTimers()
    window.history.replaceState(null, "", window.location.pathname)
  })

  it("lands it once when it draws long after the page opened", async () => {
    const page = render(<Page drawn={false} />)
    await wait(20_000)
    page.rerender(<Page drawn />)
    await wait(300)
    expect(scrolled).toEqual([card()])
    // Its read answers again and it draws again: no second jump.
    page.rerender(<Page drawn={false} />)
    page.rerender(<Page drawn />)
    await wait(2_000)
    expect(scrolled).toHaveLength(1)
  })

  it("doesn't land again when a card that was there at once draws again", async () => {
    const page = render(<Page drawn />)
    expect(scrolled).toEqual([card()])
    page.rerender(<Page drawn={false} />)
    await wait(1_000)
    page.rerender(<Page drawn />)
    await wait(2_000)
    expect(scrolled).toHaveLength(1)
  })

  // A read answering late can't yank the page from under someone reading it.
  it.each(["wheel", "touchstart", "keydown", "pointerdown"])("lets go once the person takes the page over (%s)", async (type) => {
    const page = render(<Page drawn={false} />)
    await wait(500)
    window.dispatchEvent(new Event(type))
    await wait(500)
    page.rerender(<Page drawn />)
    await wait(2_000)
    expect(scrolled).toEqual([])
  })

  it("follows the link when it changes", async () => {
    const page = render(<Page drawn={false} card="other-card" />)
    await wait(1_000)
    window.history.replaceState(null, "", "#other-card")
    act(() => void window.dispatchEvent(new HashChangeEvent("hashchange")))
    // The card the link named before draws: it isn't looked for any more.
    render(<section id="late-card" data-settings-card="" />)
    await wait(5_000)
    expect(scrolled).toEqual([])
    page.rerender(<Page drawn card="other-card" />)
    await wait(300)
    expect(scrolled).toEqual([card("other-card")])
  })

  // The link moves to a card that is already drawn: it lands at once and no
  // new watch starts, so the old watch must end itself (CR-53's SF1).
  it("drops the card it awaited when the link moves to one already drawn", async () => {
    render(<section id="other-card" data-settings-card="" />)
    const page = render(<Page drawn={false} />)
    await wait(1_000)
    window.history.replaceState(null, "", "#other-card")
    act(() => void window.dispatchEvent(new HashChangeEvent("hashchange")))
    expect(scrolled).toEqual([card("other-card")])
    // The card the link named before draws: it isn't landed.
    page.rerender(<Page drawn />)
    await wait(2_000)
    expect(scrolled).toEqual([card("other-card")])
  })

  it("stops looking when the page goes", async () => {
    const page = render(<Page drawn={false} />)
    await wait(1_000)
    page.unmount()
    render(<section id="late-card" data-settings-card="" />)
    await wait(2_000)
    expect(scrolled).toEqual([])
  })

  it("stops looking after half a minute", async () => {
    const page = render(<Page drawn={false} />)
    await wait(31_000)
    page.rerender(<Page drawn />)
    await wait(2_000)
    expect(scrolled).toEqual([])
  })

  // A link whose #fragment can't be read (a stray % in a pasted link) names no
  // card: the page still draws, and nothing is jumped to (CR-52's SF1).
  it("draws the page and jumps nowhere when the link can't be read", async () => {
    window.history.replaceState(null, "", "#%E0")
    render(<Page drawn />)
    await wait(2_000)
    expect(document.querySelector("main")).not.toBeNull()
    expect(scrolled).toEqual([])
  })
})

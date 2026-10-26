import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"

import { useJumpFlash } from "./useJumpFlash"

// A link to a card (a settings search hit, a deep link with a #fragment, the
// admins' notice): the card may draw after the page does, since its code and
// its read load on their own. It is landed once, whenever it draws, unless the
// person has taken the page over first.

let scrolled: Element[] = []
beforeEach(() => {
  scrolled = []
  Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
    scrolled.push(this)
  })
})
afterEach(cleanup)

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

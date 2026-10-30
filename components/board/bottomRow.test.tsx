import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { useBottomRow } from "./bottomRow"

// The bottom row's measure on a board page (DB-34's H8 M1): it finds the
// islands, writes their places on the page as CSS variables, keeps them as it
// measures again, and takes them away when it stops. The rules are
// lib/board/bottomRow's; here, jsdom's boxes play the browser's layout and
// read the variables back, as the page's CSS would.

let measures: (() => void)[] = []
vi.stubGlobal(
  "ResizeObserver",
  class {
    constructor(cb: () => void) {
      measures.push(cb)
    }
    observe() {}
    disconnect() {}
  },
)
afterEach(() => {
  cleanup()
  measures = []
  document.body.innerHTML = ""
})

const box = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect
const sized = (el: Element, width: number, height: number) => {
  Object.defineProperty(el, "offsetWidth", { value: width })
  Object.defineProperty(el, "offsetHeight", { value: height })
}

/**
 * A board page `width` wide at x 248 (the sidebar open): Excalidraw's tool row and cluster, the pill and the bar.
 * `entering`: the bar is mid-entry (content-float), drawn 4.4 px low at 98%, its layout box where it rests.
 */
function boardPage(width: number, o: { entering?: boolean } = {}) {
  const page = document.createElement("div")
  page.innerHTML =
    '<div class="App-menu_top"><div class="shapes-section"><div class="App-toolbar"></div></div></div>' +
    '<div class="layer-ui__wrapper__footer-left"><div class="Stack"><section></section></div></div>' +
    '<div data-board-create=""></div><div data-facilitation=""></div>'
  document.body.append(page)
  const px = (name: string) => parseFloat(page.style.getPropertyValue(name) || "0")
  page.getBoundingClientRect = () => box(248, 0, width, 852)
  page.querySelector(".App-toolbar")!.getBoundingClientRect = () => box(248 + width / 2 + px("--board-row-shift") - 275, 792, 550, 44)
  page.querySelector("section")!.getBoundingClientRect = () => box(248 + width - 16 - 225, 798 - px("--board-cluster-lift"), 225, 36)
  sized(page.querySelector("[data-board-create]")!, 103, 40)
  const bar = page.querySelector("[data-facilitation]")!
  sized(bar, 251, 44)
  bar.getBoundingClientRect = () =>
    o.entering ? box(248 + width / 2 + px("--board-facilitation-x") - 123, 740.4, 246, 43.1) : box(248 + width / 2 + px("--board-facilitation-x") - 125.5, 736, 251, 44)
  // Its layout box: 736 down the page, which holds it.
  Object.defineProperty(bar, "offsetTop", { value: 736 })
  Object.defineProperty(bar, "offsetParent", { value: page })
  return page
}

/**
 * A board page `width` wide where Excalidraw draws its MobileMenu (its box under 730 px): its tool row at the
 * board's top, `left` in from the board's, and no zoom cluster.
 */
function mobileMenuPage(width: number, left: number, o: { band?: number } = {}) {
  const page = document.createElement("div")
  // The canvas's own box, under the board's band when the clusters dock above it (V-75): the pill sits in it.
  page.innerHTML =
    '<div data-canvas=""><div class="App-top-bar"><div class="App-toolbar App-toolbar--mobile"></div></div>' +
    '<div class="App-bottom-bar"><div class="Island"></div></div><div data-board-create=""></div><div data-facilitation=""></div></div>'
  document.body.append(page)
  const band = o.band ?? 0
  const canvas = page.querySelector<HTMLElement>("[data-canvas]")!
  canvas.getBoundingClientRect = () => box(248, band, width, 852 - band)
  Object.defineProperty(page.querySelector("[data-board-create]")!, "offsetParent", { value: canvas })
  page.querySelector(".App-bottom-bar > .Island")!.getBoundingClientRect = () => box(262, 778, width - 28, 60)
  page.getBoundingClientRect = () => box(248, 0, width, 852)
  page.querySelector(".App-toolbar")!.getBoundingClientRect = () => box(248 + left, band + 64, 360, 44)
  sized(page.querySelector("[data-board-create]")!, 103, 40)
  const bar = page.querySelector("[data-facilitation]")!
  sized(bar, 251, 44)
  bar.getBoundingClientRect = () => box(248 + width / 2 - 125.5, 736, 251, 44)
  Object.defineProperty(bar, "offsetTop", { value: 736 })
  Object.defineProperty(bar, "offsetParent", { value: page })
  return page
}

function Row({ page, on }: { page: HTMLElement; on: boolean }) {
  useBottomRow(page, on)
  return null
}

const vars = (page: HTMLElement) =>
  Object.fromEntries(
    ["--board-row-shift", "--board-cluster-lift", "--board-pill-x", "--board-pill-y", "--board-facilitation-x", "--board-facilitation-max"].map((n) => [n, page.style.getPropertyValue(n)]),
  )

describe("useBottomRow", () => {
  it("at 1024 with the sidebar open writes the two-row places, and the same ones when it measures again", () => {
    const page = boardPage(768)
    const view = render(<Row page={page} on />)
    const placed = {
      // The row's middle moves from 384 to 398, so the pill fits at the edge beside it.
      "--board-row-shift": "14px",
      // The cluster rises to the upper tier's one bottom line, the bar's (798 + 36 - 780; DB-35).
      "--board-cluster-lift": "54px",
      "--board-pill-x": "12px",
      "--board-pill-y": "794px",
      // The bar ends 8 px or more before the risen cluster (at 527): its middle 393, 9 right of the board's.
      "--board-facilitation-x": "9px",
      "--board-facilitation-max": "507px",
    }
    expect(vars(page)).toEqual(placed)
    expect(page.getAttribute("data-board-row")).toBe("two")
    // A resize measures again what the variables already moved: nothing moves twice.
    act(() => measures.forEach((m) => m()))
    expect(vars(page)).toEqual(placed)
    view.unmount()
    expect(page.hasAttribute("data-board-row")).toBe(false)
    expect(Object.values(vars(page)).every((v) => v === "")).toBe(true)
  })

  it("reads the bar's layout box, not its drawn one: mid-entry it is drawn 4.4 px low, and the places are the same", () => {
    const resting = boardPage(768)
    render(<Row page={resting} on />)
    const entering = boardPage(768, { entering: true })
    render(<Row page={entering} on />)
    expect(vars(entering)).toEqual(vars(resting))
  })

  it("with no zoom cluster (Excalidraw's MobileMenu) places the pill beside the top row's start, and shows it", () => {
    const page = mobileMenuPage(704, 172)
    render(<Row page={page} on />)
    expect(page.getAttribute("data-board-row")).toBe("one")
    expect(page.style.getPropertyValue("--board-pill-x")).toBe("61px")
    expect(page.style.getPropertyValue("--board-pill-y")).toBe("66px")
    expect(page.style.getPropertyValue("--board-cluster-lift")).toBe("0px")
  })

  it("with Excalidraw's phone footer, raises the bar to stand 8 px over it", () => {
    const page = mobileMenuPage(704, 172)
    render(<Row page={page} on />)
    // The bar rests at 736-780, the footer's island starts at 778: up 10, to end 8 px over it.
    expect(page.style.getPropertyValue("--board-facilitation-lift")).toBe("10px")
  })

  it("under the board's band (its clusters docked above the canvas), places the pill in the canvas's own box", () => {
    const page = mobileMenuPage(704, 172, { band: 64 })
    render(<Row page={page} on />)
    // Beside the row's start, as without the band: the row is 64 px lower on the page, and so is the canvas.
    expect(page.style.getPropertyValue("--board-pill-x")).toBe("61px")
    expect(page.style.getPropertyValue("--board-pill-y")).toBe("66px")
  })

  it("at 1280 with the sidebar open keeps one row, the tool row 12 px off the middle", () => {
    const page = boardPage(1024)
    render(<Row page={page} on />)
    expect(page.getAttribute("data-board-row")).toBe("one")
    expect(page.style.getPropertyValue("--board-row-shift")).toBe("-12px")
    expect(page.style.getPropertyValue("--board-cluster-lift")).toBe("0px")
  })

  it("does nothing on a phone", () => {
    const page = boardPage(390)
    render(<Row page={page} on={false} />)
    expect(page.hasAttribute("data-board-row")).toBe(false)
    expect(page.style.length).toBe(0)
  })
})

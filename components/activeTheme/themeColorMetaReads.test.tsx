import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"

import { ThemeColorMeta } from "./ThemeColorMeta"

// 22 Oct (FLUIDITY's whiteboard profile, a teammate's move at 5k): 28 to 93 ms
// went to getComputedStyle(body) from ThemeColorMeta. A surface that writes an
// attribute on <html> or <body> every frame forced a style recalc every frame,
// though nothing the browser bar's colour depends on had changed.

const { documentElement: html, body } = document
const meta = () => document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content

/** The window's width, and whether the stylesheet has styled the tokens yet. */
let width = 1280
let styled = true
/** The tokens as the stylesheet resolves them, light and dark. */
const TOKENS: Record<string, [string, string]> = { "--sheet": ["#ffffff", "#202020"], "--canvas": ["#101010", "#303030"] }
const spyReads = () =>
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    () =>
      ({
        getPropertyValue: (token: string) => (styled ? TOKENS[token][html.classList.contains("dark") ? 1 : 0] : ""),
        backgroundColor: "#fafafa",
      }) as unknown as CSSStyleDeclaration,
  )
let reads: ReturnType<typeof spyReads>
/** Reads of window.innerWidth: a phone's Chrome lays the page out to answer one. */
let layouts = 0
const innerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth")!
const resized = new Set<() => void>()

beforeEach(() => {
  width = 1280
  styled = true
  layouts = 0
  // jsdom has no matchMedia and no canvas: light, a max-width query answered
  // from `width`, and a canvas that keeps the colour it is given.
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      const max = /max-width: ([\d.]+)px/.exec(query)
      return !!max && width <= Number(max[1])
    },
    addEventListener: (_: string, changed: () => void) => resized.add(changed),
    removeEventListener: (_: string, changed: () => void) => resized.delete(changed),
  }))
  Object.defineProperty(window, "innerWidth", { configurable: true, get: () => (layouts++, width) })
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ fillStyle: "" } as unknown as CanvasRenderingContext2D)
  reads = spyReads()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Object.defineProperty(window, "innerWidth", innerWidth)
  resized.clear()
  for (const el of [html, body]) {
    el.removeAttribute("class")
    el.removeAttribute("style")
  }
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
})

/** Lets the frame the observer asked for run, and the one after. */
const frames = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))

/** Mounts it, waits for its first colour, and gives the reads so far. */
async function shown(hex = "#101010") {
  render(<ThemeColorMeta />)
  await waitFor(() => expect(meta()).toBe(hex))
  return reads.mock.calls.length
}

it("reads nothing again for writes that change nothing it depends on", async () => {
  const first = await shown()
  for (let i = 0; i < 5; i++) {
    body.setAttribute("class", body.className)
    await frames()
  }
  expect(reads.mock.calls.length).toBe(first)
  expect(layouts, "nothing laid out to answer innerWidth").toBe(0)
})

it("reads nothing again for what a surface writes on <html> and <body> every frame", async () => {
  const first = await shown()
  for (let i = 0; i < 5; i++) {
    // A sheet's drag, a board's overscroll, a modal's pointer lock.
    html.style.setProperty("--mobile-drawer-h", `${300 + i}px`)
    html.style.overscrollBehaviorX = i % 2 ? "none" : "auto"
    body.style.pointerEvents = i % 2 ? "none" : "auto"
    await frames()
  }
  expect(reads.mock.calls.length).toBe(first)
  expect(layouts, "nothing laid out to answer innerWidth").toBe(0)
})

it("reads each look once when a surface flips between two", async () => {
  const first = await shown()
  for (let i = 0; i < 5; i++) {
    body.classList.toggle("dragging")
    await frames()
  }
  expect(reads.mock.calls.length).toBe(first + 1)
})

it("follows a theme change, a sheet that pushes the page back, and the phone shell up to 639px", async () => {
  await shown()
  html.classList.add("dark")
  await waitFor(() => expect(meta()).toBe("#303030"))
  body.style.background = "black"
  await waitFor(() => expect(meta()).toBe("#000000"))
  body.style.background = ""
  await waitFor(() => expect(meta()).toBe("#303030"))
  for (const [w, hex] of [
    [639, "#202020"],
    [640, "#303030"],
  ] as const) {
    width = w
    resized.forEach((changed) => changed())
    await waitFor(() => expect(meta()).toBe(hex))
  }
})

it("asks again while the tokens aren't styled yet", async () => {
  styled = false
  await shown("#fafafa")
  styled = true
  body.setAttribute("class", "")
  await waitFor(() => expect(meta()).toBe("#101010"))
})

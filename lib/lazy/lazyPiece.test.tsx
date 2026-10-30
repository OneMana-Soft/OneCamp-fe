import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"

import { lazyPiece } from "@/lib/lazy/lazyPiece"

// React.lazy's place for every piece of the app whose code comes when it's
// first drawn (lib/lazy/lazyPiece, V-64b): drawn in its Suspense boundary as
// React.lazy's would be, but a fetch that fails is said in the piece's own
// place, and asked again on 'online', on its next draw or through retry. It
// never reaches the page's error boundary, which in an editor took the doc.

type Props = { label: string }

const Real = ({ label }: Props) => <p data-real="">{label}</p>
const Failed = ({ label, retry }: Props & { retry: () => void }) => (
  <button type="button" onClick={retry}>
    Couldn&apos;t load {label}
  </button>
)

/** A loader the test settles by hand. */
function deferredLoads() {
  const calls: Array<{ resolve: () => void; reject: (e: unknown) => void }> = []
  const load = vi.fn(
    () =>
      new Promise<{ default: React.ComponentType<Props> }>((resolve, reject) => {
        calls.push({ resolve: () => resolve({ default: Real }), reject })
      }),
  )
  return { load, calls }
}

const offline = () => new TypeError("Failed to fetch dynamically imported module")
const settle = () => act(async () => {})

/** The page's error boundary: what it would catch, and its crash page. */
class PageBoundary extends React.Component<{ caught: (e: unknown) => void; children: React.ReactNode }, { broke: boolean }> {
  state = { broke: false }
  static getDerivedStateFromError() {
    return { broke: true }
  }
  componentDidCatch(e: unknown) {
    this.props.caught(e)
  }
  render() {
    return this.state.broke ? <p>Something broke on this page</p> : this.props.children
  }
}

/** The piece in its own Suspense boundary, beside what the page already holds, under the page's error boundary. */
function page(Piece: React.ComponentType<Props>, copies = 1) {
  const caught = vi.fn()
  const tree = (n: number) => (
    <PageBoundary caught={caught}>
      <p data-held="">Typed so far</p>
      {Array.from({ length: n }, (_, i) => (
        <React.Suspense key={i} fallback={<span data-coming="" />}>
          <Piece label="the list" />
        </React.Suspense>
      ))}
    </PageBoundary>
  )
  const { rerender } = render(tree(copies))
  return { caught, drawMore: (n: number) => rerender(tree(n)) }
}

/** What the page holds is there and shown. */
function heldStays() {
  const held = document.querySelector<HTMLElement>("[data-held]")
  expect(held?.isConnected).toBe(true)
  expect(held?.style.display).not.toBe("none")
  expect(screen.queryByText("Something broke on this page")).toBeNull()
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete window.__ocChunk
})

describe("a lazy piece", () => {
  it("draws its boundary's fallback while its code comes, then the piece, with what the page holds shown throughout", async () => {
    const { load, calls } = deferredLoads()
    page(lazyPiece(load))
    await settle()
    expect(document.querySelector("[data-coming]")).not.toBeNull()
    // It waits in its own Suspense boundary: the page's lines beside it (an editor's) stay drawn and shown.
    heldStays()
    calls[0].resolve()
    await settle()
    expect(document.querySelector("[data-real]")?.textContent).toBe("the list")
    heldStays()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("says its code couldn't come in its own place, asks once, and never reaches the page's error boundary", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { load, calls } = deferredLoads()
    const { caught } = page(lazyPiece(load, { failed: Failed }))
    await settle()
    calls[0].reject(offline())
    await settle()
    expect(screen.getByRole("button", { name: "Couldn't load the list" })).toBeTruthy()
    expect(caught).not.toHaveBeenCalled()
    heldStays()
    // One ask for one first draw: React drawing the piece again once the try settled is not a next use.
    expect(load).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it("draws nothing in its place by default when its code can't come", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { load, calls } = deferredLoads()
    const { caught } = page(lazyPiece(load))
    await settle()
    calls[0].reject(offline())
    await settle()
    expect(document.querySelector("[data-coming]")).toBeNull()
    expect(document.querySelector("[data-real]")).toBeNull()
    expect(caught).not.toHaveBeenCalled()
    heldStays()
  })

  it("asks again through retry, and draws the piece once its code comes", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { load, calls } = deferredLoads()
    page(lazyPiece(load, { failed: Failed }))
    await settle()
    calls[0].reject(offline())
    await settle()
    fireEvent.click(screen.getByRole("button", { name: "Couldn't load the list" }))
    await settle()
    expect(load).toHaveBeenCalledTimes(2)
    heldStays()
    calls[1].resolve()
    await settle()
    expect(document.querySelector("[data-real]")?.textContent).toBe("the list")
  })

  it("asks again by itself when the browser is back online", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { load, calls } = deferredLoads()
    page(lazyPiece(load, { failed: Failed }))
    await settle()
    calls[0].reject(offline())
    await settle()
    await act(async () => {
      window.dispatchEvent(new Event("online"))
    })
    expect(load).toHaveBeenCalledTimes(2)
    calls[1].resolve()
    await settle()
    expect(document.querySelector("[data-real]")?.textContent).toBe("the list")
    expect(screen.queryByRole("button", { name: "Couldn't load the list" })).toBeNull()
  })

  it("asks again when another copy is drawn after a failure, and every copy draws once its code comes", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { load, calls } = deferredLoads()
    const { caught, drawMore } = page(lazyPiece(load, { failed: Failed }))
    await settle()
    calls[0].reject(offline())
    await settle()
    expect(load).toHaveBeenCalledTimes(1)
    drawMore(2)
    await settle()
    expect(load).toHaveBeenCalledTimes(2)
    calls[1].resolve()
    await settle()
    expect(document.querySelectorAll("[data-real]")).toHaveLength(2)
    expect(caught).not.toHaveBeenCalled()
    heldStays()
  })

  it("stays as it is while the page reloads into a new build: no failure said", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    window.__ocChunk = { reloadIfGone: async () => true, urlOf: () => "/_next/static/chunks/gone.js", held: [] }
    const { load, calls } = deferredLoads()
    page(lazyPiece(load, { failed: Failed }))
    await settle()
    calls[0].reject(new Error("Loading chunk 7 failed. (missing: /_next/static/chunks/gone.js)"))
    await settle()
    expect(document.querySelector("[data-coming]")).not.toBeNull()
    expect(screen.queryByRole("button", { name: "Couldn't load the list" })).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })
})

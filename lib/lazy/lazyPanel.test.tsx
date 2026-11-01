import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type React from "react"

import { lazyPanel, PanelFrame, type PanelFrameProps } from "@/lib/lazy/lazyPanel"

// A panel of the shell whose code is a chunk of its own (the right panel's bodies, a thread). V-180: the event panel,
// opened cold on a slow line, stayed a blank frame for 30 s. Now its shape holds the room while its code comes, and
// after 10 s it says so, with Try again; the panel still comes in by itself once its code lands.

type Props = { id: string }

const Body = ({ id }: Props) => <h3>Event {id}</h3>
const Shape = () => <div role="status" aria-label="Loading the event" />

function deferred() {
  const calls: Array<{ resolve: () => void; reject: (e: unknown) => void }> = []
  const load = vi.fn(
    () =>
      new Promise<React.ComponentType<Props>>((resolve, reject) => {
        calls.push({ resolve: () => resolve(Body), reject })
      }),
  )
  return { load, calls }
}

const settle = () => act(async () => {})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("a lazy panel on a slow line", () => {
  it("keeps its shape while its code comes, says it is slow at 10 s with Try again, and comes in by itself", async () => {
    vi.useFakeTimers()
    const { load, calls } = deferred()
    const Panel = lazyPanel(load, "the event", Shape)
    render(<Panel id="e1" />)
    expect(screen.getByRole("status", { name: "Loading the event" })).toBeTruthy()
    act(() => vi.advanceTimersByTime(9_999))
    expect(screen.queryByRole("alert")).toBeNull()
    act(() => vi.advanceTimersByTime(1))
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toContain("Couldn't load the event")
    expect(alert.textContent).toContain("taking longer than it should")
    // Try again waits once more, on its shape.
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(screen.getByRole("status", { name: "Loading the event" })).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
    calls[0].resolve()
    await settle()
    expect(screen.getByRole("heading", { name: "Event e1" })).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("counts afresh after Try again: no slow words again for another 10 s, and still one fetch", async () => {
    vi.useFakeTimers()
    const { load, calls } = deferred()
    const Panel = lazyPanel(load, "the event", Shape)
    render(<Panel id="e1" />)
    act(() => vi.advanceTimersByTime(10_000))
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    act(() => vi.advanceTimersByTime(9_999))
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByRole("status", { name: "Loading the event" })).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole("alert").textContent).toContain("taking longer than it should")
    expect(load).toHaveBeenCalledTimes(1)
    calls[0].resolve()
    await settle()
    expect(screen.getByRole("heading", { name: "Event e1" })).toBeTruthy()
  })

  it("says it is slow with no placeholder too: a blank room never outlasts the limit", () => {
    vi.useFakeTimers()
    const { load } = deferred()
    const Panel = lazyPanel(load, "the comments")
    const { container } = render(<Panel id="c1" />)
    expect(container.textContent).toBe("")
    act(() => vi.advanceTimersByTime(10_000))
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load the comments")
  })

  it("says plainly that its code couldn't come, without the slow words", async () => {
    const { load, calls } = deferred()
    const Panel = lazyPanel(load, "the thread")
    render(<Panel id="t1" />)
    calls[0].reject(new Error("offline"))
    await settle()
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toContain("Couldn't load the thread")
    expect(alert.textContent).not.toContain("taking longer than it should")
  })
})

// DB-71's MUST 1 on V-180: a panel that wasn't in yet could be closed only by Escape (its head's Close was a grey block
// over the shape, and the slow line had no head). Its host's frame now draws around every state but the panel itself.
const Frame = ({ busy, children }: PanelFrameProps) => (
  <section aria-label="The host's frame" data-busy={String(busy)}>
    <button type="button">Close panel</button>
    {children}
  </section>
)
const frame = () => screen.getByRole("region", { name: "The host's frame" })

describe("a lazy panel in its host's frame", () => {
  it("draws its shape (busy) and then the slow line in the frame, and the panel alone once its code lands", async () => {
    vi.useFakeTimers()
    const { load, calls } = deferred()
    const Panel = lazyPanel(load, "the event", Shape)
    render(<PanelFrame.Provider value={Frame}><Panel id="e1" /></PanelFrame.Provider>)
    expect(frame().getAttribute("data-busy")).toBe("true")
    expect(within(frame()).getByRole("status", { name: "Loading the event" })).toBeTruthy()
    act(() => vi.advanceTimersByTime(10_000))
    expect(frame().getAttribute("data-busy")).toBe("false")
    expect(within(frame()).getByRole("alert").textContent).toContain("taking longer than it should")
    calls[0].resolve()
    await settle()
    expect(screen.getByRole("heading", { name: "Event e1" })).toBeTruthy()
    expect(screen.queryByRole("region", { name: "The host's frame" })).toBeNull()
  })

  it("draws the frame with no placeholder too, and says a failure in it", async () => {
    const { load, calls } = deferred()
    const Panel = lazyPanel(load, "the thread")
    render(<PanelFrame.Provider value={Frame}><Panel id="t1" /></PanelFrame.Provider>)
    expect(frame().getAttribute("data-busy")).toBe("true")
    expect(within(frame()).getByRole("button", { name: "Close panel" })).toBeTruthy()
    calls[0].reject(new Error("offline"))
    await settle()
    expect(frame().getAttribute("data-busy")).toBe("false")
    expect(within(frame()).getByRole("alert").textContent).toContain("Couldn't load the thread")
  })
})

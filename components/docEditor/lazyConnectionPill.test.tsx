import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { SAY_PROBLEM_AFTER_MS } from "@/components/docEditor/connectionTiming"

// The doc's connection notice is a chunk of its own (LazyConnectionPill): its
// code comes when the page is idle, or at once on a problem that comes first,
// and once drawn it stays, so that "Back online" can follow the problem.
// The notice itself (its wait, its words) is connectionPill.test.tsx's.

const idle = vi.hoisted(() => [] as Array<() => void>)
vi.mock("@/lib/whenIdle", () => ({
  whenIdle: (run: () => void) => {
    idle.push(run)
    return () => {}
  },
}))

const Notice = ({ problem, docked }: { problem: string | null; docked?: boolean }) => (
  <p data-testid="notice" data-docked={docked ? "" : undefined}>
    {problem ?? "none"}
  </p>
)

/** A fresh copy whose code isn't fetched yet, and how many times it has been. */
async function fresh() {
  vi.resetModules()
  idle.length = 0
  const loads = { count: 0 }
  vi.doMock("@/components/docEditor/ConnectionPill", () => {
    loads.count++
    return { ConnectionPill: Notice }
  })
  const { LazyConnectionPill } = await import("@/components/docEditor/LazyConnectionPill")
  return { LazyConnectionPill, loads }
}

afterEach(cleanup)

describe("the doc's connection notice", () => {
  it("costs a well doc nothing to draw, and its code comes once the page is idle", async () => {
    const { LazyConnectionPill, loads } = await fresh()
    const { container } = render(<LazyConnectionPill problem={null} />)
    expect(container.innerHTML).toBe("")
    expect(loads.count).toBe(0)
    for (const run of idle) run()
    await vi.waitFor(() => expect(loads.count).toBe(1))
    expect(container.innerHTML).toBe("")
  })

  it("comes at once for a problem before the page is idle, and stays once the problem clears", async () => {
    const { LazyConnectionPill, loads } = await fresh()
    const { rerender } = render(<LazyConnectionPill problem={null} docked />)
    rerender(<LazyConnectionPill problem="stalled" docked />)
    expect((await screen.findByTestId("notice")).textContent).toBe("stalled")
    expect(screen.getByTestId("notice").hasAttribute("data-docked")).toBe(true)
    rerender(<LazyConnectionPill problem={null} docked />)
    expect(screen.getByTestId("notice").textContent).toBe("none")
    for (const run of idle) run()
    expect(loads.count).toBe(1)
  })
})

// Offline before its code is in (or a deploy renamed its chunk), the doc still
// says so (V-667): a stand-in says the problems that need no code of the pill's
// (offline, unavailable) in its words, frame and wait, and once the code comes
// the pill takes over where the stand-in left off.

/** A fresh copy whose code is refused, as offline; or, given a gate, whose real code comes when the gate opens. */
async function codeHeld(gate?: Promise<void>) {
  vi.resetModules()
  idle.length = 0
  vi.doMock("@/components/docEditor/ConnectionPill", async () => {
    if (!gate) throw new TypeError("Failed to fetch dynamically imported module")
    await gate
    return vi.importActual("@/components/docEditor/ConnectionPill")
  })
  const { LazyConnectionPill } = await import("@/components/docEditor/LazyConnectionPill")
  return LazyConnectionPill
}

const settle = () => act(async () => void (await vi.dynamicImportSettled()))
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

describe("the doc's connection notice before its code is in", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  for (const [form, docked, besideNotice, words] of [
    ["a computer's", false, false, "Offline. Changes are kept and will sync"],
    ["a phone's", true, true, "Offline"],
  ] as const) {
    it(`says offline after the pill's wait, in ${form} pill's words, with its code refused`, async () => {
      const LazyConnectionPill = await codeHeld()
      vi.spyOn(console, "warn").mockImplementation(() => {})
      vi.useFakeTimers()
      render(<LazyConnectionPill problem="offline" docked={docked} besideNotice={besideNotice} />)
      await settle()
      await wait(SAY_PROBLEM_AFTER_MS - 1)
      expect(screen.queryByRole("status")).toBeNull()
      await wait(1)
      const pill = screen.getByRole("status")
      expect(pill.getAttribute("data-connection-pill")).toBe("offline")
      expect(pill.textContent).toBe(words)
    })
  }

  it("says it couldn't open the doc, with Retry, with its code refused", async () => {
    const LazyConnectionPill = await codeHeld()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.useFakeTimers()
    const onRetry = vi.fn()
    render(<LazyConnectionPill problem="unavailable" onRetry={onRetry} />)
    await settle()
    await wait(SAY_PROBLEM_AFTER_MS)
    const pill = screen.getByRole("status")
    expect(pill.getAttribute("data-connection-pill")).toBe("unavailable")
    expect(pill.textContent).toBe("Couldn't open this doc.Retry")
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("hands over to the pill when its code comes, which goes on at once, then says Back online", async () => {
    let open = () => {}
    const LazyConnectionPill = await codeHeld(new Promise<void>((r) => (open = r)))
    vi.useFakeTimers()
    const { rerender } = render(<LazyConnectionPill problem="offline" />)
    await wait(SAY_PROBLEM_AFTER_MS)
    expect(screen.getByRole("status").getAttribute("data-connection-pill")).toBe("offline")
    open()
    await settle()
    expect(screen.getByRole("status").textContent).toBe("Offline. Changes are kept and will sync")
    rerender(<LazyConnectionPill problem="reconnecting" />)
    await wait(0)
    expect(screen.getByRole("status").textContent).toBe("Reconnecting…")
    rerender(<LazyConnectionPill problem={null} />)
    await wait(0)
    expect(screen.getByRole("status").textContent).toBe("Back online")
  })
})

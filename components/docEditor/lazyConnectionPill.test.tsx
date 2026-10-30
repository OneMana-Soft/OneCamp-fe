import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// An import finishing is one of the playful layer's two moments worth a
// celebration: the run's status turning Finished while the admin watches it.
// A finished import that simply loads that way (a reload, another visit) is
// news already told, and stays quiet.

const fx = vi.hoisted(() => ({ celebrate: vi.fn(() => 8), springPop: vi.fn(() => null) }))
vi.mock("@/lib/celebrate", () => ({ celebrate: fx.celebrate, springPop: fx.springPop, prefersReducedMotion: () => false }))

import { ImportStatusChip } from "./ImportJobRow"

beforeEach(() => {
  fx.celebrate.mockClear()
  fx.springPop.mockClear()
})
afterEach(cleanup)

describe("an import finishing", () => {
  it("bursts once from its status when a run turns Finished on screen", () => {
    const { rerender } = render(<ImportStatusChip status="running" />)
    expect(fx.celebrate).not.toHaveBeenCalled()
    rerender(<ImportStatusChip status="completed" />)
    expect(screen.getByText("Finished")).toBeInTheDocument()
    expect(fx.celebrate).toHaveBeenCalledTimes(1)
    expect(fx.springPop).toHaveBeenCalledTimes(1)
    // Staying finished is not finishing again.
    rerender(<ImportStatusChip status="completed" />)
    expect(fx.celebrate).toHaveBeenCalledTimes(1)
  })

  it("stays quiet for an import that was already finished when it loaded", () => {
    render(<ImportStatusChip status="completed" />)
    expect(fx.celebrate).not.toHaveBeenCalled()
  })

  it("doesn't celebrate a run that stopped", () => {
    const { rerender } = render(<ImportStatusChip status="running" />)
    rerender(<ImportStatusChip status="failed" />)
    expect(fx.celebrate).not.toHaveBeenCalled()
  })
})

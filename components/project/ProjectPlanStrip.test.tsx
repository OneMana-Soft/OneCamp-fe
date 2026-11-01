import { afterEach, describe, expect, it, vi } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// The plan's row on a project's home (linear-15), before its plan is read:
// quiet and holding its height while the read is on its way, and saying a
// failed read in its place with Try again, never a blank row for good.

const read = vi.hoisted(() => ({ failed: false, retry: vi.fn() }))
vi.mock("@/hooks/useProjectPlan", () => ({
  useProjectPlan: () => ({ plan: undefined, canEdit: false, canLead: false, failed: read.failed, retry: read.retry, save: vi.fn() }),
  usePlanRegistry: () => ({ registry: undefined, failed: false, retry: vi.fn() }),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("next/dynamic", () => ({ default: () => () => null }))

import { ProjectPlanStrip } from "@/components/project/ProjectPlanStrip"

pinTestClock()

afterEach(() => {
  cleanup()
  read.failed = false
  read.retry.mockClear()
})

describe("a project's plan row before its plan is read (linear-15)", () => {
  it("holds its height, quiet, while the plan is on its way", () => {
    const { container } = render(<ProjectPlanStrip projectId="p1" members={[]} />)
    const row = container.querySelector("[data-project-plan]")
    expect(row).toHaveAttribute("aria-hidden", "true")
    expect(row).toHaveClass("h-7")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("says a failed read in its place, at a row's height, and Try again reads it again", () => {
    read.failed = true
    const { container } = render(<ProjectPlanStrip projectId="p1" members={[]} />)
    // The house's part retry, one line at the row's own height (DB-71), never the page-sized ErrorState.
    const retry = screen.getByRole("button", { name: "Couldn't load the project's plan. Try again" })
    expect(retry).toHaveAttribute("data-part-failed")
    expect(container.querySelector("[data-project-plan] [role=alert]")).toBeNull()
    fireEvent.click(retry)
    expect(read.retry).toHaveBeenCalledTimes(1)
  })
})

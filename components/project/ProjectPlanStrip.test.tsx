import { afterEach, describe, expect, it, vi } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

// The plan's row on a project's home (linear-15), before its plan is read:
// quiet and holding its height while the read is on its way, and saying a
// failed read in its place with Try again, never a blank row for good.

const read = vi.hoisted(() => ({ failed: false, retry: vi.fn(), plan: undefined as unknown }))
vi.mock("@/hooks/useProjectPlan", () => ({
  useProjectPlan: () => ({ plan: read.plan, canEdit: true, canLead: true, failed: read.failed, retry: read.retry, save: vi.fn() }),
  usePlanRegistry: () => ({ registry: undefined, failed: false, retry: vi.fn() }),
}))
// The one read of a project's members: every ask of it from the row (its lead's picker reads them, not the row).
const people = vi.hoisted(() => ({ asked: [] as (string | undefined)[] }))
vi.mock("@/hooks/useProjectMembers", () => ({
  useProjectMembers: (projectId?: string) => {
    people.asked.push(projectId)
    return { members: undefined, failed: false, retry: vi.fn() }
  },
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
// The chips' chunk: what the row hands it, kept.
const chips = vi.hoisted(() => ({ props: undefined as Record<string, unknown> | undefined }))
vi.mock("next/dynamic", () => ({
  default: () => (props: Record<string, unknown>) => {
    chips.props = props
    return null
  },
}))

import { ProjectPlanStrip } from "@/components/project/ProjectPlanStrip"

pinTestClock()

afterEach(() => {
  cleanup()
  read.failed = false
  read.plan = undefined
  read.retry.mockClear()
  people.asked = []
  chips.props = undefined
})

describe("a project's plan row before its plan is read (linear-15)", () => {
  it("holds its height, quiet, while the plan is on its way", () => {
    const { container } = render(<ProjectPlanStrip projectId="p1" />)
    const row = container.querySelector("[data-project-plan]")
    expect(row).toHaveAttribute("aria-hidden", "true")
    expect(row).toHaveClass("h-7")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("says a failed read in its place, at a row's height, and Try again reads it again", () => {
    read.failed = true
    const { container } = render(<ProjectPlanStrip projectId="p1" />)
    // The house's part retry, one line at the row's own height (DB-71), never the page-sized ErrorState.
    const retry = screen.getByRole("button", { name: "Couldn't load the project's plan. Try again" })
    expect(retry).toHaveAttribute("data-part-failed")
    expect(container.querySelector("[data-project-plan] [role=alert]")).toBeNull()
    fireEvent.click(retry)
    expect(read.retry).toHaveBeenCalledTimes(1)
  })
})

describe("the lead's picker on a project's plan row (linear-15)", () => {
  // DB-93 (2 Nov): a phone's row was handed /project/info's members, which a live server sends as null, so its lead
  // sheet listed only "No lead"; a laptop's read /project/membersInfo. Now the lead's picker reads them itself, at
  // any width, once it opens (planLeadPicker.test.tsx), and the row's first load carries no members read (main 21:2x).
  it("reads no members itself, and hands the picker the project and the shell's error state for a failed read", () => {
    read.plan = { lead: null, start: null, target: null, priority: "", status: { category: "planned", name: "Planned", color: "" }, labels: null }
    render(<ProjectPlanStrip projectId="p1" />)
    act(() => (chips.props!.onOpen as (field: string) => void)("lead"))
    expect(people.asked).toEqual([])
    expect(chips.props?.projectId).toBe("p1")
    expect(chips.props).not.toHaveProperty("members")
    const again = vi.fn()
    cleanup()
    render(<>{(chips.props!.membersError as (retry: () => void) => ReactNode)(again)}</>)
    expect(screen.getByRole("alert")).toHaveTextContent("the project's members")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(again).toHaveBeenCalledTimes(1)
  })
})

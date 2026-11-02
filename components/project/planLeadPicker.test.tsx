import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// The lead's picker on a project's plan (linear-15; main, 2 Nov 21:2x). It reads the project's members itself,
// through the one members read, and only once it opens: the project page's first load carries no members read.
// While the read is on its way it says so, and a failed read shows the shell's error state with Try again.

const people = vi.hoisted(() => ({
  asked: [] as (string | undefined)[],
  members: undefined as unknown[] | undefined,
  failed: false,
  retry: vi.fn(),
}))
vi.mock("@/hooks/useProjectMembers", () => ({
  useProjectMembers: (projectId?: string) => {
    people.asked.push(projectId)
    return projectId ? { members: people.members, failed: people.failed, retry: people.retry } : { members: undefined, failed: false, retry: people.retry }
  },
}))
// The priority and dates pickers' chunk, which these cases never open.
vi.mock("next/dynamic", () => ({ default: () => () => null }))

import { PlanChips, type PlanChipsProps } from "@/components/project/ProjectPlanChips"

// Members as /project/membersInfo lists them: user_name is the name a person goes by (lib/personName).
const ADA = { user_uuid: "u-ada", user_name: "Ada Admin", user_project_role: "admin" }
const OZ = { user_uuid: "u-oz", user_name: "Oz Ito", user_project_role: "member" }
const VI = { user_uuid: "u-vi", user_name: "Vi Viewer", user_project_role: "viewer" }
const GUS = { user_uuid: "u-gus", user_name: "Gus Guest", user_project_role: "member", is_external: true }
const BOT = { user_uuid: "u-bot", user_name: "Build Bot", user_project_role: "member", is_bot: true }

function chipsProps(open: PlanChipsProps["open"]) {
  return {
    plan: { lead: null, start: null, target: null, priority: "", status: { category: "planned", name: "Planned", color: "" }, labels: null },
    canEdit: true,
    canLead: true,
    projectId: "p1",
    // The shell's error state, as the plan's row hands it in (ErrorState stays out of the chips' chunk).
    membersError: (retry: () => void) => (
      <button type="button" onClick={retry}>
        Couldn&apos;t load the project&apos;s members. Try again
      </button>
    ),
    registry: undefined,
    registryError: null,
    open,
    onOpen: vi.fn(),
    onPick: vi.fn(),
  } as unknown as PlanChipsProps
}

function chips(open: PlanChipsProps["open"]) {
  return render(<PlanChips {...chipsProps(open)} />)
}

afterEach(() => {
  cleanup()
  people.asked = []
  people.members = undefined
  people.failed = false
  people.retry.mockClear()
})

describe("the lead's picker reads the project's members as it opens (linear-15)", () => {
  it("reads nothing while it's closed", () => {
    chips(null)
    expect(screen.getByRole("button", { name: "Choose a lead" })).toBeInTheDocument()
    expect(people.asked).not.toContain("p1")
  })

  it("reads them once it opens, and says so while the read is on its way", () => {
    chips("lead")
    expect(people.asked.at(-1)).toBe("p1")
    expect(screen.getByText("Reading the members…")).toHaveAttribute("role", "status")
  })

  it("lists the project's admins and members by name, never a viewer, a guest or a bot", () => {
    people.members = [VI, OZ, BOT, ADA, GUS]
    chips("lead")
    // Each person's row reads their avatar's initial, then their name.
    const names = screen.getAllByRole("option").map((o) => o.textContent)
    expect(names).toEqual(["No lead", expect.stringContaining("Ada Admin"), expect.stringContaining("Oz Ito")])
    expect(screen.queryByText("Reading the members…")).toBeNull()
  })

  it("keeps its read as it closes, so the list never blanks or flashes the reading line mid-close", () => {
    people.members = [OZ, ADA]
    const { rerender } = chips("lead")
    expect(screen.getAllByRole("option")).toHaveLength(3)
    // A pick, Escape or a tap outside closes it, and its fade (1280) or the sheet's slide (390) still draws the list.
    rerender(<PlanChips {...chipsProps(null)} />)
    expect(people.asked.at(-1)).toBe("p1")
    expect(screen.queryByText("Reading the members…")).toBeNull()
  })

  it("shows the shell's error state when the read failed, and Try again reads them again", () => {
    people.failed = true
    chips("lead")
    expect(screen.queryByText("Reading the members…")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Couldn't load the project's members. Try again" }))
    expect(people.retry).toHaveBeenCalledTimes(1)
  })
})

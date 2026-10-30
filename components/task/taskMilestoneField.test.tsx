import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

// A milestone's target day reads against today.
pinTestClock()

type Row = { current: { id: string; label: string } | null; options: { id: string; label: string }[]; onPick: (id: string) => Promise<void>; disabled: boolean; property?: string }

const s = vi.hoisted(() => ({
  milestones: undefined as unknown,
  current: undefined as unknown,
  mutate: vi.fn(),
  listMutate: vi.fn(),
  set: vi.fn(),
  toast: vi.fn(),
  row: undefined as unknown,
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: s.current, mutate: s.mutate }) }))
vi.mock("@/hooks/useProjectMilestones", () => ({ useProjectMilestones: () => ({ read: { mutate: s.listMutate }, milestones: s.milestones }) }))
vi.mock("@/hooks/use-toast", () => ({ toast: s.toast }))
vi.mock("@/lib/work/milestones", async (original) => ({ ...(await original<typeof import("@/lib/work/milestones")>()), setTaskMilestone: s.set }))
vi.mock("@/components/task/taskPickRow", () => ({
  TaskPickRow: (props: unknown) => {
    s.row = props
    return <div data-row="" />
  },
}))

import { TaskMilestoneField } from "./taskMilestoneField"

const milestone = (id: string, name: string, target_date: string | null) => ({
  id,
  project_uuid: "p-1",
  name,
  description: "",
  target_date,
  progress: { total: 2, started: 0, done: 0 },
  home: true,
  projects: [],
  hidden_projects: 0,
  next: false,
  can_edit: true,
})
const row = () => s.row as Row

afterEach(() => {
  cleanup()
  s.milestones = undefined
  s.current = undefined
  s.row = undefined
  vi.clearAllMocks()
})

// linear-16: the task panel's Milestone row, on the pick row it shares with the Cycle row.
describe("a task's milestone", () => {
  it("isn't there in a project with no milestones, nor before they're read", () => {
    render(<TaskMilestoneField taskUUID="t-1" projectId="p-1" canEdit />)
    expect(s.row).toBeUndefined()
    s.milestones = []
    s.current = { data: null }
    render(<TaskMilestoneField taskUUID="t-1" projectId="p-1" canEdit />)
    expect(s.row).toBeUndefined()
  })

  it("offers the project's milestones, each with its target day, and names the task's", () => {
    s.milestones = [milestone("m-1", "Beta", "2026-11-30"), milestone("m-2", "Docs", null)]
    s.current = { data: { id: "m-2", project_uuid: "p-1", name: "Docs", description: "", target_date: null } }
    render(<TaskMilestoneField taskUUID="t-1" projectId="p-1" canEdit />)
    expect(row().current).toEqual({ id: "m-2", label: "Docs" })
    expect(row().options.map((o) => o.id)).toEqual(["m-1", "m-2"])
    expect(row().options[0].label).toMatch(/^Beta · .*30/)
    expect(row().options[1].label).toBe("Docs")
    expect(row().property).toBe("milestone")
    expect(row().disabled).toBe(false)
  })

  it("names a milestone the project no longer shows, which the task is still in", () => {
    s.milestones = [milestone("m-1", "Beta", null)]
    s.current = { data: { id: "m-9", project_uuid: "p-2", name: "Launch", description: "", target_date: null } }
    render(<TaskMilestoneField taskUUID="t-1" projectId="p-1" canEdit />)
    expect(row().options[0]).toEqual({ id: "m-9", label: "Launch" })
  })

  it("puts the task in the one picked, or none, then reads the project's progress again", async () => {
    s.milestones = [milestone("m-1", "Beta", null)]
    s.current = { data: null }
    const now = { id: "m-1", project_uuid: "p-1", name: "Beta", description: "", target_date: null }
    s.set.mockResolvedValueOnce(now).mockResolvedValueOnce(null)
    render(<TaskMilestoneField taskUUID="t-1" projectId="p-1" canEdit />)
    await row().onPick("m-1")
    expect(s.set).toHaveBeenCalledWith("t-1", "m-1")
    expect(s.mutate).toHaveBeenCalledWith({ data: now }, { revalidate: false })
    expect(s.listMutate).toHaveBeenCalled()
    await row().onPick("")
    expect(s.set).toHaveBeenLastCalledWith("t-1", "")
    expect(s.mutate).toHaveBeenLastCalledWith({ data: null }, { revalidate: false })
  })

  it("is read-only for whoever may not change the task", () => {
    s.milestones = [milestone("m-1", "Beta", null)]
    render(<TaskMilestoneField taskUUID="t-1" projectId="p-1" canEdit={false} />)
    expect(row().disabled).toBe(true)
  })

  it("says so when the change is refused, and changes nothing", async () => {
    s.milestones = [milestone("m-1", "Beta", null)]
    s.current = { data: null }
    s.set.mockRejectedValueOnce(new Error("refused"))
    render(<TaskMilestoneField taskUUID="t-1" projectId="p-1" canEdit />)
    await row().onPick("m-1")
    await waitFor(() => expect(s.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "The milestone didn't change", tone: "error" })))
    expect(s.mutate).not.toHaveBeenCalled()
  })
})

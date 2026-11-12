import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, waitFor } from "@testing-library/react"

// jira-01 J-H web: the panel's Epic row, on the pick row the Cycle and
// Milestone rows share. It offers the epics of the task's own project.

type Row = { label: string; current: { id: string } | null; options: { id: string; disabled?: boolean }[]; onPick: (id: string) => void; onOpenChange?: (open: boolean) => void; disabled: boolean }
const s = vi.hoisted(() => ({
  reads: {} as Record<string, unknown>,
  asked: [] as string[],
  mutate: vi.fn(),
  post: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ data: { msg: "Saved." } })),
  toast: vi.fn(),
  appMutate: vi.fn(),
  revalidate: vi.fn(),
  row: undefined as unknown,
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url) s.asked.push(url)
    return { data: s.reads[url], isLoading: false, isError: undefined, mutate: s.mutate }
  },
}))
vi.mock("@/hooks/useTaskUpdate", () => ({ useTaskUpdate: () => ({ revalidateTaskKeys: s.revalidate }) }))
vi.mock("@/hooks/use-toast", () => ({ toast: s.toast }))
vi.mock("@/lib/swrMutate", () => ({ appMutate: s.appMutate }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: s.post } }))
vi.mock("@/components/task/taskPickRow", () => ({
  TaskPickRow: (props: unknown) => {
    s.row = props
    return <div data-row="" />
  },
}))

const { TaskEpicField } = await import("@/components/task/taskEpicField")

const EPIC = { id: "", builtin: "epic", name: "Epic", icon: "epic" }
const BUG = { id: "", builtin: "bug", name: "Bug", icon: "bug" }
const row = () => s.row as Row
const timeline = (tasks: unknown[]) => ({ data: { tasks, total: tasks.length, can_edit: true, project_access: {} } })

afterEach(() => {
  cleanup()
  s.reads = {}
  s.asked = []
  s.row = undefined
  vi.clearAllMocks()
})

describe("a task's epic (J-H web)", () => {
  it("F7 shows the epic it is in, and None when it is in none", () => {
    const { rerender } = render(<TaskEpicField taskUUID="t" projectUUID="p" epic={{ task_uuid: "e1", task_name: "Launch", task_key: "SF-9" }} canEdit />)
    expect(row().label).toBe("Epic")
    expect(row().current?.id).toBe("e1")
    rerender(<TaskEpicField taskUUID="t" projectUUID="p" epic={null} canEdit />)
    expect(row().current).toBeNull()
  })

  it("F8 offers only its own project's epics, read once the row opens, never itself or another type", () => {
    s.reads["/project/p/timeline"] = timeline([
      { task_uuid: "e1", task_name: "Launch", task_status: "todo", task_work_type: EPIC },
      { task_uuid: "e2", task_name: "Rebrand", task_status: "todo", task_work_type: EPIC },
      { task_uuid: "b1", task_name: "Fix the form", task_status: "todo", task_work_type: BUG },
      { task_uuid: "t", task_name: "Itself", task_status: "todo", task_work_type: EPIC },
      { task_uuid: "temp-1", task_name: "Just made", task_status: "todo", task_work_type: EPIC },
    ])
    render(<TaskEpicField taskUUID="t" projectUUID="p" epic={null} canEdit />)
    expect(s.asked).toEqual([])
    act(() => row().onOpenChange?.(true))
    expect(s.asked).toContain("/project/p/timeline")
    expect(s.asked.every((u) => u === "/project/p/timeline")).toBe(true)
    expect(row().options.map((o) => o.id)).toEqual(["e1", "e2"])
  })

  it("F9 a project with no epic yet says how to make one", () => {
    s.reads["/project/p/timeline"] = timeline([{ task_uuid: "b1", task_name: "Fix the form", task_status: "todo", task_work_type: BUG }])
    render(<TaskEpicField taskUUID="t" projectUUID="p" epic={null} canEdit />)
    act(() => row().onOpenChange?.(true))
    expect(row().options).toHaveLength(1)
    expect(row().options[0].disabled).toBe(true)
  })

  it("F10 a pick puts the task in that epic, None takes it out, and both epics and the lists are read again", async () => {
    render(<TaskEpicField taskUUID="t" projectUUID="p" epic={{ task_uuid: "e1", task_name: "Launch" }} canEdit />)
    act(() => row().onPick("e2"))
    await waitFor(() => expect(s.post).toHaveBeenCalledWith("/task/parent", { task_uuid: "t", parent_task_uuid: "e2" }, expect.anything()))
    await waitFor(() => expect(s.revalidate).toHaveBeenCalledWith("p"))
    const read = s.appMutate.mock.calls.map((c) => c[0])
    expect(read).toEqual(expect.arrayContaining([expect.stringMatching(/\/t$/), expect.stringMatching(/\/e1$/), expect.stringMatching(/\/e2$/)]))
    act(() => row().onPick(""))
    await waitFor(() => expect(s.post).toHaveBeenCalledWith("/task/parent", { task_uuid: "t", parent_task_uuid: "" }, expect.anything()))
  })

  it("F11 a refusal says the server's words, and one who may not change the task can't pick", async () => {
    const words = "A task with dependencies can't be a subtask: take them off first."
    s.post.mockRejectedValueOnce(Object.assign(new Error("Request failed with status code 400"), { isAxiosError: true, response: { status: 400, data: { msg: words } } }))
    render(<TaskEpicField taskUUID="t" projectUUID="p" epic={null} canEdit />)
    act(() => row().onPick("e2"))
    await waitFor(() => expect(s.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "The epic didn't change", description: words })))
    cleanup()
    render(<TaskEpicField taskUUID="t" projectUUID="p" epic={null} canEdit={false} />)
    expect(row().disabled).toBe(true)
  })
})

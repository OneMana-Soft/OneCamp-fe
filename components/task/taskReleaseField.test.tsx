import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"
import type { Release, ReleaseHttp } from "@/lib/work/releases"

pinTestClock()

// The task panel's Release row (jira-04 Head B): the releases of its project
// a task is in, set as a whole (POST /task/release). Whoever may edit the task
// sets it (can_edit); a release that's out changes only for the project's
// admins (can_change_released); a refusal is said in the server's own words
// and the row stays as it was; a task in no project has no row. It reads and
// writes through the panel's client and says a refusal with the panel's toast
// (a lazy part that reaches none of the shared core: app/releasesLazy.test).

type Row = {
  chosen: { id: string; label: string }[]
  options: { id: string; label: string; disabled?: boolean }[]
  onPick: (ids: string[]) => void
  disabled: boolean
  property?: string
}

const s = vi.hoisted(() => ({
  answer: undefined as unknown,
  get: vi.fn(),
  post: vi.fn(),
  toast: vi.fn(),
  row: undefined as unknown,
}))
vi.mock("@/components/task/taskPicksRow", () => ({
  TaskPicksRow: (props: unknown) => {
    s.row = props
    return <div data-row="" />
  },
}))

const { TaskReleaseField } = await import("./taskReleaseField")

const http = { get: s.get, post: s.post } as unknown as ReleaseHttp
// What the row read is kept by path while the page lives: each test reads a task of its own.
let n = 0
const draw = (projectId?: string) => {
  const task = `t${++n}`
  return { task, ...render(<TaskReleaseField taskUUID={task} projectId={projectId} http={http} toast={s.toast} />) }
}

const rel = (id: string, name: string, state: Release["state"] = "planned"): Release => ({
  id,
  project_id: "p1",
  name,
  state,
  target_date: null,
  released_at: state === "released" ? "2026-11-01T00:00:00Z" : null,
  repo: "",
  tag: "",
  notes: "",
  progress: { total: 0, started: 0, done: 0 },
  stages: [],
  can_edit: false,
})
const answer = (over: Partial<{ releases: Release[]; options: Release[]; can_edit: boolean; can_change_released: boolean }> = {}) => ({
  data: { releases: [rel("r1", "v2.4")], options: [rel("r2", "v2.5"), rel("r1", "v2.4"), rel("r0", "v2.3", "released")], can_edit: true, can_change_released: false, ...over },
})
const row = () => s.row as Row
const drawn = async (projectId = "p1") => {
  const d = draw(projectId)
  await waitFor(() => expect(s.row).toBeTruthy())
  return d
}

afterEach(() => {
  cleanup()
  s.answer = undefined
  s.row = undefined
  s.get.mockReset()
  s.post.mockReset()
  s.toast.mockReset()
})

const serve = (a: unknown) => {
  s.answer = a
  s.get.mockImplementation(async () => ({ data: s.answer }))
}

describe("TaskReleaseField", () => {
  it("has no row, and reads nothing, for a task in no project", async () => {
    serve(answer())
    const { container } = draw()
    await act(async () => {})
    expect(container.innerHTML).toBe("")
    expect(s.get).not.toHaveBeenCalled()
  })

  it("has no row when its project has no releases and it is in none", async () => {
    serve(answer({ releases: [], options: [] }))
    const { container } = draw("p1")
    await waitFor(() => expect(s.get).toHaveBeenCalled())
    await act(async () => {})
    expect(container.innerHTML).toBe("")
  })

  it("has no row when its read fails, and says nothing", async () => {
    s.get.mockRejectedValue({ response: { status: 503 } })
    const { container } = draw("p1")
    await waitFor(() => expect(s.get).toHaveBeenCalled())
    await act(async () => {})
    expect(container.innerHTML).toBe("")
    expect(s.toast).not.toHaveBeenCalled()
  })

  it("shows the releases it is in through the panel's client, and offers its project's, a release that's out closed to a non-admin", async () => {
    serve(answer())
    const { task } = await drawn()
    expect(s.get).toHaveBeenCalledWith(`/task/release/${task}`, expect.anything())
    expect(row().chosen).toEqual([{ id: "r1", label: "v2.4" }])
    expect(row().options.map((o) => [o.id, !!o.disabled])).toEqual([
      ["r2", false],
      ["r1", false],
      ["r0", true],
    ])
    expect(row().disabled).toBe(false)
    expect(row().property).toBe("release")
  })

  it("opens a release that's out to the project's admins", async () => {
    serve(answer({ can_change_released: true }))
    await drawn()
    expect(row().options.find((o) => o.id === "r0")!.disabled).toBeFalsy()
  })

  it("names a release that's out as released in its option, closed or open, and only there", async () => {
    serve(answer({ releases: [rel("r0", "v2.3", "released")] }))
    await drawn()
    expect(row().options.map((o) => o.label)).toEqual(["v2.5", "v2.4", "v2.3 · released"])
    expect(row().chosen).toEqual([{ id: "r0", label: "v2.3" }])
    cleanup()
    s.row = undefined
    serve(answer({ can_change_released: true }))
    await drawn()
    expect(row().options.find((o) => o.id === "r0")!.label).toBe("v2.3 · released")
  })

  it("is read-only to a reader who may not edit the task", async () => {
    serve(answer({ can_edit: false }))
    await drawn()
    expect(row().disabled).toBe(true)
  })

  it("is closed while a change is under way, and open again once the server answers", async () => {
    serve(answer())
    let answerNow: (v: unknown) => void = () => {}
    s.post.mockReturnValue(new Promise((r) => (answerNow = r)))
    await drawn()
    act(() => row().onPick(["r1", "r2"]))
    await waitFor(() => expect(row().disabled).toBe(true))
    await act(async () => answerNow({ data: answer() }))
    await waitFor(() => expect(row().disabled).toBe(false))
  })

  it("sets the whole set through POST /task/release and keeps the server's answer", async () => {
    serve(answer())
    const now = answer({ releases: [rel("r1", "v2.4"), rel("r2", "v2.5")] })
    s.post.mockResolvedValue({ data: now })
    const { task } = await drawn()
    act(() => row().onPick(["r1", "r2"]))
    await waitFor(() => expect(row().chosen).toEqual([{ id: "r1", label: "v2.4" }, { id: "r2", label: "v2.5" }]))
    expect(s.post).toHaveBeenCalledWith("/task/release", { task_uuid: task, release_ids: ["r1", "r2"] }, expect.anything())
  })

  it("says a refusal in the server's own words with the panel's toast, and changes nothing", async () => {
    serve(answer())
    s.post.mockRejectedValue({ response: { status: 403, data: { msg: "Only the project's admins change the tasks of a release that's out." } } })
    await drawn()
    act(() => row().onPick([]))
    await waitFor(() => expect(s.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Only the project's admins change the tasks of a release that's out." })))
    expect(row().chosen).toEqual([{ id: "r1", label: "v2.4" }])
    await waitFor(() => expect(row().disabled).toBe(false))
  })
})

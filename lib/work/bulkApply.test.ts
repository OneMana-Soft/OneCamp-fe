import { beforeEach, describe, expect, it, vi } from "vitest"
import type { BacklogAnswer, PlanCycle } from "@/lib/work/backlog"
import type { TaskInfoInterface } from "@/types/task"
import { OWN_ERRORS } from "@/lib/http/ownErrors"

const post = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a) } }))
// The app's cache, as far as the backlog's one key goes.
let cached: BacklogAnswer | undefined
const appMutate = vi.fn(async (key: unknown, update?: unknown) => {
  if (key === "/project/p/backlog" && typeof update === "function") cached = update(cached)
})
vi.mock("@/lib/swrMutate", () => ({ appMutate: (...a: unknown[]) => appMutate(...(a as [unknown, unknown])) }))

const { applyBulk } = await import("./bulkApply")

const t = (id: string) => ({ task_uuid: id, task_name: id, task_status: "todo" }) as TaskInfoInterface
const cycle = (id: string, tasks: TaskInfoInterface[]) =>
  ({ id, project_uuid: "p", number: 1, name: "", starts_at: "", ends_at: "", state: "upcoming", progress: { total: tasks.length, started: 0, done: 0 }, tasks, estimate_minutes: 0 }) as PlanCycle
const deps = () => ({ optimisticUpdateTask: vi.fn(), optimisticDeleteTask: vi.fn(), revalidateTaskKeys: vi.fn() })

beforeEach(() => {
  post.mockReset()
  appMutate.mockClear()
  cached = { data: { backlog: { cycles: [cycle("c3", [t("a")]), cycle("c4", [])], tasks: [t("x")], count: 1, estimate_minutes: 0 }, can_edit: true, can_plan: true } }
})

describe("moving tasks between cycles at once", () => {
  it("draws the move on the backlog before the server answers, then reads the backlog and the lists again", async () => {
    let drawn: string[] = []
    post.mockImplementation(async () => {
      drawn = cached!.data.backlog.cycles[1].tasks.map((x) => x.task_uuid)
      return { data: { data: { refused: [] } } }
    })
    const d = deps()
    const r = await applyBulk(d, "p", [t("a"), t("x")], { field: "cycle", value: "c4" })
    expect(post).toHaveBeenCalledWith("/task/bulk", { task_uuids: ["a", "x"], op: "cycle", value: "c4" }, OWN_ERRORS)
    expect(drawn).toEqual(["a", "x"])
    expect(r).toMatchObject({ changed: 2, failed: 0 })
    // A list filtered by cycle gains or drops them; the backlog says what the server kept.
    expect(d.revalidateTaskKeys).toHaveBeenCalledWith("p")
    expect(appMutate.mock.calls.filter((c) => c[0] === "/project/p/backlog" && c.length === 1)).toHaveLength(1)
  })

  it("puts what the server refused back by reading the backlog again", async () => {
    post.mockResolvedValue({ data: { data: { refused: [{ task_uuid: "x", msg: "You can't plan that task." }] } } })
    const r = await applyBulk(deps(), "p", [t("a"), t("x")], { field: "cycle", value: "" })
    expect(r).toMatchObject({ changed: 1, failed: 1 })
    expect(appMutate.mock.calls.filter((c) => c[0] === "/project/p/backlog" && c.length === 1)).toHaveLength(1)
  })

  it("leaves the backlog alone for any other change", async () => {
    post.mockResolvedValue({ data: {} })
    await applyBulk(deps(), "p", [t("a")], { field: "priority", value: "high" })
    expect(appMutate.mock.calls.some((c) => c[0] === "/project/p/backlog")).toBe(false)
  })
})

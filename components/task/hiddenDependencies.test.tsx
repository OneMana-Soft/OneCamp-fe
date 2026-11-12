import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import type { DependencyTask } from "@/types/task"

vi.mock("@/hooks/useTaskDependencies", () => ({ useTaskDependencies: () => vi.fn(async () => true) }))
vi.mock("@/hooks/useProjectStatuses", () => ({ useProjectStatuses: () => ({ options: [] }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() }) }))

const { TaskDependencies } = await import("@/components/task/TaskDependencies")
const { HIDDEN_TASK_NAME } = await import("@/lib/work/hiddenTask")

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// The ends of a dependency the reader may not see come as stubs (V-678): the
// link's kind and task_hidden, no name and no id. The rows were keyed by the
// id, so two such ends were two rows with no key, and React warned of it (its
// own way of saying it may mix the rows up when the list changes).
describe("two dependencies the reader can't see", () => {
  it("are two rows, each with a key of its own", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    // The stubs exactly as the server sends them: no task_uuid.
    const fs = { task_hidden: true, "task_blocked_by|kind": "fs" } as unknown as DependencyTask
    const ss = { task_hidden: true, "task_blocked_by|kind": "ss" } as unknown as DependencyTask
    const after = { task_hidden: true, "task_blocks|kind": "fs" } as unknown as DependencyTask
    const design: DependencyTask = { task_uuid: "design", task_name: "Design", task_status: "todo" }
    render(<TaskDependencies taskUUID="build" taskName="Build" projectUUID="p" canEdit waitingOn={[fs, design, ss]} blocking={[after]} onOpen={vi.fn()} />)
    expect(screen.getAllByText(HIDDEN_TASK_NAME)).toHaveLength(3)
    expect(document.querySelectorAll("[data-dependency][data-hidden-task]")).toHaveLength(3)
    expect(screen.getByText("Waiting on (1 still open)")).toBeTruthy()
    const keyWarnings = error.mock.calls.filter((args) => args.some((a) => typeof a === "string" && /\bkey\b/.test(a)))
    expect(keyWarnings).toEqual([])
  })
})

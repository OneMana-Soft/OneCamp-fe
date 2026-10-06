import { describe, expect, it } from "vitest"
import { NO_ASSIGNEE, groupByAssignee } from "@/lib/board/groupBy"
import type { TaskInfoInterface } from "@/types/task"

const t = (id: string, who?: { user_uuid: string; user_name: string }) =>
  ({ task_uuid: id, task_name: id, task_assignee: who }) as unknown as TaskInfoInterface
const maya = { user_uuid: "m", user_name: "Maya Chen" }
const sam = { user_uuid: "s", user_name: "Sam Rivera" }
const left = { user_uuid: "x", user_name: "Alex Former" }

describe("a board grouped by assignee", () => {
  it("has No assignee first, then people by name, each with their tasks from every status", () => {
    const { columns, options } = groupByAssignee({ todo: [t("a", sam), t("b")], done: [t("c", maya), t("d", sam)] }, [sam, maya])
    expect(options.map((o) => o.label)).toEqual(["No assignee", "Maya Chen", "Sam Rivera"])
    expect(columns[NO_ASSIGNEE].map((x) => x.task_uuid)).toEqual(["b"])
    expect(columns.s.map((x) => x.task_uuid)).toEqual(["a", "d"])
  })

  it("gives a member with no tasks an empty column to drop into", () => {
    const { columns } = groupByAssignee({ todo: [] }, [maya])
    expect(columns.m).toEqual([])
  })

  it("keeps someone who left the project but still has tasks", () => {
    const { options, columns } = groupByAssignee({ todo: [t("a", left)] }, [sam])
    expect(options.map((o) => o.label)).toContain("Alex Former")
    expect(columns.x).toHaveLength(1)
  })
})

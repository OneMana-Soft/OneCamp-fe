import { describe, expect, it } from "vitest"
import { createTaskFormSchema } from "./task"

const named = (task_name: string) => createTaskFormSchema.safeParse({ task_name, task_project_uuid: "p1" })
const problem = (task_name: string) => {
  const r = named(task_name)
  return r.success ? "" : r.error.issues.find((i) => i.path[0] === "task_name")?.message ?? ""
}

/**
 * A task's name follows the title rule (lib/validation/names), as a doc's
 * does. The dialog refused "Bug" and "SEO" at under four characters while
 * quick add took them, and cut names at 100 (PTC-11).
 */
describe("a new task's name", () => {
  it("takes short names", () => {
    expect(named("Bug").success).toBe(true)
    expect(named("SEO").success).toBe(true)
    expect(named("QA").success).toBe(true)
  })
  it("takes anything you can type, trimmed", () => {
    const r = named("  Fix the login on Safari (iOS 17) — “urgent”?  ")
    expect(r.success && r.data.task_name).toBe("Fix the login on Safari (iOS 17) — “urgent”?")
  })
  it("refuses a name with nothing in it, and one past the title's length", () => {
    expect(problem("   ")).toBe("Task name can't be empty")
    expect(named("x".repeat(120)).success).toBe(true)
    expect(problem("x".repeat(121))).toBe("Task name can be at most 120 characters")
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { Rule, RulesPayload, RuleRun } from "@/lib/rules/types"

const save = vi.fn(async (d: unknown) => d)
const setActive = vi.fn(async () => {})
const remove = vi.fn(async () => {})
const undo = vi.fn(async () => ({}))
const rule = (over: Partial<Rule> = {}): Rule => ({
  id: "r1", name: "Share new work out", is_active: true, created_by: "u", trigger_type: "task_created", trigger_config: {},
  conditions: { match: "all", items: [{ field: "assignee", op: "is_empty" }] }, actions: [{ type: "assign", assign: "round_robin" }],
  else_actions: [], run_count: 1204, last_run_at: new Date().toISOString(), updated_at: "", ...over,
})
let payload: RulesPayload
let runs: RuleRun[] = []
vi.mock("@/hooks/useProjectRules", () => ({
  useProjectRules: () => ({ payload, isLoading: false, error: undefined, save, setActive, remove, refresh: vi.fn() }),
  useRuleRuns: () => ({ runs, isLoading: false, error: undefined, undo, refresh: vi.fn() }),
}))
vi.mock("@/hooks/useProjectStatuses", async () => {
  const { BUILT_IN_STATUSES } = await import("@/lib/taskStatus")
  return { useProjectStatuses: () => ({ options: BUILT_IN_STATUSES }) }
})
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: { data: { project_members: [{ user_uuid: "ana", user_name: "ana", user_full_name: "Ana Ruiz" }, { user_uuid: "bot", is_bot: true, user_name: "bot" }] } }, isLoading: false, mutate: vi.fn() }),
}))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
const confirm = vi.fn((o: { onConfirm: () => unknown }) => o.onConfirm())
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))

/** A sentence's words with the spaces its chips sit between. */
const words = (el: Element) => Array.from(el.querySelectorAll("[data-workflow-sentence] > *")).map((c) => c.textContent).join(" ")

const { ProjectRulesDialog } = await import("@/components/work/rules/ProjectRulesDialog")
const { runSummary, undoable } = await import("@/components/work/rules/RuleRuns")

const template = { key: "due-when-started", name: "A due date when work starts", description: "Three days.", hue: "sun", trigger_type: "task_status_changed" as const,
  trigger_config: { to_status: "inProgress" }, conditions: { items: [{ field: "due" as const, op: "is_empty" as const }] }, actions: [{ type: "set_due" as const, due_in_days: 3 }] }

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  runs = []
})

describe("a project's rules", () => {
  it("reads each rule as a sentence with its runs, and lets an admin switch it", async () => {
    payload = { rules: [rule()], can_manage: true, templates: [template], max: 50 }
    render(<ProjectRulesDialog projectId="p" onClose={() => {}} />)
    const row = screen.getByText("Share new work out").closest("li")!
    expect(words(row)).toBe("When a task is made if nobody has it →thenshare it out by turns")
    expect(row.textContent).toContain("1,204 runs")
    await act(async () => fireEvent.click(within(row).getByRole("switch", { name: "Turn off Share new work out" })))
    expect(setActive).toHaveBeenCalledWith("r1", false)
  })

  it("shows a member the rules and their history, never the controls that change them", () => {
    payload = { rules: [rule()], can_manage: false, templates: [], max: 50 }
    render(<ProjectRulesDialog projectId="p" onClose={() => {}} />)
    expect(screen.queryByRole("switch")).toBeNull()
    expect(screen.queryByRole("button", { name: /New rule/ })).toBeNull()
    expect(screen.getByText("Share new work out")).toBeTruthy()
  })

  it("starts from a ready-made rule, says it back, and saves it as the admin made it", async () => {
    payload = { rules: [], can_manage: true, templates: [template], max: 50 }
    render(<ProjectRulesDialog projectId="p" onClose={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /Ready-made/ }))
    fireEvent.click(screen.getByText("A due date when work starts"))
    const preview = document.querySelector("[data-rule-builder]")!
    expect(words(preview)).toBe("When a task moves to In progress if it has no due date →thenmake it due in 3 days")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Make rule" })))
    expect(save).toHaveBeenCalledTimes(1)
    const [draft, id] = save.mock.calls[0] as unknown as [{ name: string; actions: unknown[] }, string | undefined]
    expect(draft.name).toBe("A due date when work starts")
    expect(draft.actions).toEqual([{ type: "set_due", due_in_days: 3 }])
    expect(id).toBeUndefined()
  })

  it("says what's missing instead of sending a rule the server would refuse", async () => {
    payload = { rules: [], can_manage: true, templates: [], max: 50 }
    render(<ProjectRulesDialog projectId="p" onClose={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /New rule/ }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Make rule" })))
    expect(save).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toBe("Name the rule.")
  })

  it("stops making rules at the project's cap", () => {
    payload = { rules: Array.from({ length: 50 }, (_, i) => rule({ id: `r${i}`, name: `Rule ${i}` })), can_manage: true, templates: [], max: 50 }
    render(<ProjectRulesDialog projectId="p" onClose={() => {}} />)
    expect((screen.getByRole("button", { name: /New rule/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe("the history", () => {
  const run = (over: Partial<RuleRun>): RuleRun => ({
    id: "x", workflow_id: "r1", trigger: "task_created", subject_id: "t1", subject: "Fix SSO", status: "ok", branch: "then",
    steps: [{ type: "set_priority", status: "ok", field: "priority", detail: "priority high", before: "low", after: "high" }], started_at: new Date().toISOString(), ...over,
  })

  it("says what each run did and offers Undo only where it changed something", async () => {
    payload = { rules: [rule()], can_manage: true, templates: [], max: 50 }
    runs = [run({}), run({ id: "y", status: "skipped", error: "Skipped: the rule's owner can't see this task", steps: [] })]
    render(<ProjectRulesDialog projectId="p" onClose={() => {}} />)
    fireEvent.click(screen.getByRole("radio", { name: /History/ }))
    const list = screen.getByRole("list", { name: "Runs" })
    expect(list.textContent).toContain("priority high")
    expect(list.textContent).toContain("can't see this task")
    const undos = within(list).getAllByRole("button", { name: /Undo/ })
    expect(undos).toHaveLength(1)
    await act(async () => fireEvent.click(undos[0]))
    expect(undo).toHaveBeenCalledWith("x")
  })

  it("never offers Undo for a comment alone, or a run already undone", () => {
    expect(undoable(run({ steps: [{ type: "add_comment", status: "ok", detail: "commented" }] }))).toBe(false)
    expect(undoable(run({ status: "undone" }))).toBe(false)
    expect(runSummary(run({ status: "failed", steps: [{ type: "set_status", status: "failed", detail: "not allowed" }] }))).toBe("couldn't set status: not allowed")
  })
})

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
// The project's forms, which a rule can run on.
const projectForms = [
  { id: "f1", token: "t", title: "Launch requests", description: "", active: true, priority: "medium", title_field: "what", fields: [
    { id: "what", label: "What do you need?", type: "short_text", required: true },
    { id: "about", label: "About you", type: "section", required: false },
    { id: "email", label: "Your email", type: "email", required: true },
  ] },
  { id: "f2", token: "u", title: "Bug reports", description: "", active: true, priority: "medium", title_field: "q1", fields: [{ id: "q1", label: "What broke?", type: "short_text", required: true }] },
  // One that adds table rows: no task for a rule to run on (package 9 R4b).
  { id: "f3", token: "v", title: "Vendor sign-up", description: "", active: true, priority: "medium", title_field: "", target_table: "t1", fields: [{ id: "q1", label: "Company", type: "short_text", required: true, maps_to: "column:c1" }] },
]
vi.mock("@/hooks/useProjectRules", () => ({
  useProjectRules: () => ({ payload, isLoading: false, error: undefined, save, setActive, remove, refresh: vi.fn() }),
  useRuleRuns: () => ({ runs, isLoading: false, error: undefined, undo, refresh: vi.fn() }),
}))
vi.mock("@/hooks/useProjectStatuses", async () => {
  const { BUILT_IN_STATUSES } = await import("@/lib/taskStatus")
  return { useProjectStatuses: () => ({ options: BUILT_IN_STATUSES }) }
})
// The project's people, and the workspace's AI teammates a rule may ask.
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) =>
    !url
      ? { data: undefined, isLoading: false, mutate: vi.fn() }
      : url === "/user/dm-ai-targets"
      ? { data: { data: [{ user_uuid: "t1", user_name: "Triage Bot", is_bot: true }] }, isLoading: false, mutate: vi.fn() }
      : url.endsWith("/forms")
      ? { data: { data: { forms: projectForms, can_edit: true } }, isLoading: false, mutate: vi.fn() }
      : { data: { data: { project_members: [{ user_uuid: "ana", user_name: "ana", user_full_name: "Ana Ruiz" }, { user_uuid: "bot", is_bot: true, user_name: "bot" }] } }, isLoading: false, mutate: vi.fn() },
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
    fireEvent.click(screen.getByRole("button", { name: /Add an action/ }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Make rule" })))
    expect(save).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toBe("Write the comment.")
  })

  it("names a new rule from what it does until someone types a name, and again once it's cleared", async () => {
    payload = { rules: [], can_manage: true, templates: [], max: 50 }
    render(<ProjectRulesDialog projectId="p" onClose={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /New rule/ }))
    const name = screen.getByLabelText("Name") as HTMLInputElement
    expect(name.value).toBe("A task is made: share it out by turns")
    fireEvent.change(name, { target: { value: "Spread new work" } })
    fireEvent.click(screen.getByRole("button", { name: /Add a condition/ }))
    expect(name.value).toBe("Spread new work")
    fireEvent.change(name, { target: { value: "" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Make rule" })))
    expect((save.mock.calls[0] as unknown as [{ name: string }])[0].name).toBe("A task is made: share it out by turns")
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

  it("says how many tasks a schedule found and reached, never its two hundred steps", () => {
    const steps = ["a", "a", "b", "c"].map((t, i) => ({ type: "notify", status: i === 3 ? ("failed" as const) : ("ok" as const), task_id: t, detail: "told 1" }))
    expect(runSummary(run({ matched: 5, steps }))).toBe("Matched 5 · acted on 3 · 1 couldn't")
    expect(runSummary(run({ matched: 0, steps: [] }))).toBe("Matched 0 · acted on 0")
  })

  it("shows a schedule's next run and the ready-made rules that run on time", async () => {
    const next = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
    payload = {
      rules: [rule({ trigger_type: "schedule", trigger_config: { repeat: "FREQ=WEEKLY;BYDAY=MO", at: "09:00" }, actions: [{ type: "create_task", task_name: "Review" }], next_run_at: next })],
      can_manage: true, max: 50, agents: true,
      templates: [{ key: "agent", name: "An agent reads every new bug", description: "", hue: "agent", trigger_type: "task_created", conditions: {}, actions: [{ type: "ask_agent", text: "?" }], needs_ai: true }],
    }
    render(<ProjectRulesDialog projectId="p" onClose={() => {}} />)
    expect(document.querySelector("[data-rule-next]")?.textContent).toMatch(/^next /)
    expect(screen.getByText(/every Monday/i)).toBeTruthy()
  })
})

describe("a rule on a form (package 9 R4)", () => {
  it("reads as the form's name, and runs on the form an admin picks, with its answers as words to use", async () => {
    payload = { rules: [rule({ id: "r2", name: "Requests come in", trigger_type: "form_submitted", trigger_config: { form_id: "f1" }, conditions: {} })], can_manage: true, templates: [], max: 50 }
    render(<ProjectRulesDialog projectId="p" onClose={() => {}} />)
    expect(words(screen.getByText("Requests come in").closest("li")!)).toMatch(/^When ‘Launch requests’ is sent/)
    fireEvent.click(screen.getByRole("button", { name: /New rule/ }))
    const builder = document.querySelector("[data-rule-builder]") as HTMLElement
    const trigger = within(builder).getByRole("combobox", { name: "Trigger" })
    await act(async () => {
      trigger.focus()
      fireEvent.keyDown(trigger, { key: "Enter" })
    })
    await act(async () => fireEvent.keyDown(await screen.findByRole("option", { name: "A form is sent" }), { key: "Enter" }))
    // The first of the project's forms, to start from.
    expect(within(builder).getByRole("combobox", { name: "Form" }).textContent).toBe("Launch requests")
    const said = builder.querySelector("[data-rule-variables]")!.textContent
    expect(said).toContain("{form}")
    expect(said).toContain("{project}")
    expect(said).toContain("{answer:what}")
    expect(said).toContain("What do you need?")
    expect(said).toContain("{answer:email}")
    expect(said).not.toContain("{status}")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Make rule" })))
    const [sent] = save.mock.calls[0] as unknown as [{ trigger_type: string; trigger_config: { form_id?: string } }]
    expect(sent.trigger_type).toBe("form_submitted")
    expect(sent.trigger_config.form_id).toBe("f1")
  })
})

describe("a rule on a form that adds table rows (package 9 R4b)", () => {
  it("isn't offered: only the forms that make tasks are", async () => {
    payload = { rules: [], can_manage: true, templates: [], max: 50 }
    render(<ProjectRulesDialog projectId="p" onClose={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /New rule/ }))
    const builder = document.querySelector("[data-rule-builder]") as HTMLElement
    const trigger = within(builder).getByRole("combobox", { name: "Trigger" })
    await act(async () => {
      trigger.focus()
      fireEvent.keyDown(trigger, { key: "Enter" })
    })
    await act(async () => fireEvent.keyDown(await screen.findByRole("option", { name: "A form is sent" }), { key: "Enter" }))
    const form = within(builder).getByRole("combobox", { name: "Form" })
    await act(async () => {
      form.focus()
      fireEvent.keyDown(form, { key: "Enter" })
    })
    expect(screen.getByRole("option", { name: "Bug reports" })).toBeTruthy()
    expect(screen.queryByRole("option", { name: "Vendor sign-up" })).toBeNull()
  })
})

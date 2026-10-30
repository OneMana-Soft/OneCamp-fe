import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { StatusRule, StatusRulesPayload } from "@/lib/rules/approvals"
import type { StatusOption } from "@/lib/taskStatus"

let payload: StatusRulesPayload
const save = vi.fn(async () => null)
vi.mock("@/hooks/useTaskApprovals", () => ({
  useStatusRules: () => ({ payload, error: false, isLoading: false, save, remove: vi.fn(), refresh: vi.fn() }),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
const { StatusRulesPanel } = await import("@/components/work/approvals/StatusRulesPanel")

const statuses: StatusOption[] = [
  { value: "review", label: "In review", category: "inReview", custom: false, color: "" },
  { value: "done", label: "Done", category: "done", custom: false, color: "" },
]
const people = [{ id: "ana", name: "Ana Ruiz" }, { id: "ben", name: "Ben Ito" }]
const rule = (over: Partial<StatusRule> = {}): StatusRule => ({
  project_id: "p", status: "done", who: "anyone", people: [], required: [], approvers: [], approvals_needed: 1, client: true,
  updated_by: "ana", updated_at: "", ...over,
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("a project's status rules and its client", () => {
  it("saves a move that only the client approves, and says so on its row", async () => {
    payload = { rules: [rule()], can_manage: true, max: 50 }
    render(<StatusRulesPanel projectId="p" statuses={statuses} people={people} />)
    const done = document.querySelector('[data-status-rule="done"]')!
    expect(done.textContent).toContain("The client's approval")

    fireEvent.click(screen.getAllByRole("button", { name: /Add a rule/ })[0])
    const client = screen.getByRole("button", { name: /The client approves too/ })
    expect(client.getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(client)
    expect(client.getAttribute("aria-pressed")).toBe("true")
    // Nobody named, only the client: still a rule worth saving.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ status: "review", approvers: [], client: true }))
  })

  it("opens a rule with its client as it was saved", () => {
    payload = { rules: [rule({ approvers: ["ana"] })], can_manage: true, max: 50 }
    render(<StatusRulesPanel projectId="p" statuses={statuses} people={people} />)
    fireEvent.click(screen.getByRole("button", { name: /Change/ }))
    expect(screen.getByRole("button", { name: /The client approves too/ }).getAttribute("aria-pressed")).toBe("true")
  })
})

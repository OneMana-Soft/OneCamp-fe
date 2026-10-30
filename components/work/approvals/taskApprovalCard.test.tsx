import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ApprovalState, TaskApproval } from "@/lib/rules/approvals"

let approval: TaskApproval | null
const decide = vi.fn(async (_id: string, verdict: string) => ({ ...approval!, state: verdict === "approve" ? "pending" : "changes" }))
const withdraw = vi.fn(async () => {})
const refresh = vi.fn()
vi.mock("@/hooks/useTaskApprovals", () => ({ useTaskApproval: () => ({ approval, decide, withdraw, refresh }) }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
const { default: TaskApprovalCard } = await import("@/components/work/approvals/TaskApprovalCard")
const { approvalWords, ruleSummary } = await import("@/lib/rules/approvals")
const { dueLabel } = await import("@/lib/utils/dueLabel")

const NIL = "00000000-0000-0000-0000-000000000000"

const members = [{ user_uuid: "ana", user_name: "Ana Ruiz" }, { user_uuid: "ben", user_name: "Ben Ito" }, { user_uuid: "cy", user_name: "Cy Park" }]
const make = (over: Partial<TaskApproval> = {}): TaskApproval => ({
  id: "a1", resource_kind: "task", resource_id: "t", project_id: "p", task_id: "t", to_status: "done", to_name: "Done", requested_by: "cy",
  approvers: ["ana", "ben"], needed: 2, client: false, state: "pending", created_at: new Date().toISOString(), decisions: [{ user_id: "ana", verdict: "approve", comment: "", decided_at: "" }],
  can_decide: true, can_withdraw: false, ...over,
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("a task's approval", () => {
  it("says where it waits to go, who asked, how many have said yes, and who has answered", () => {
    approval = make()
    render(<TaskApprovalCard taskUUID="t" members={members} />)
    const card = screen.getByRole("region", { name: "Approval" })
    expect(card.textContent).toContain("Waiting for approval · 1 of 2")
    expect(card.textContent).toContain("Cy Park asked to move it to Done")
    expect(screen.getByRole("progressbar", { name: "Approvals" }).getAttribute("aria-valuenow")).toBe("1")
    expect(screen.getByText("Ana Ruiz approved")).toBeTruthy()
    expect(screen.getByText("Ben Ito hasn't answered")).toBeTruthy()
  })

  it("asks what needs to change before sending changes, and approves at once", async () => {
    approval = make()
    render(<TaskApprovalCard taskUUID="t" members={members} />)
    fireEvent.click(screen.getByRole("button", { name: "Ask for changes" }))
    expect(decide).not.toHaveBeenCalled()
    const send = screen.getByRole("button", { name: "Send" }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.change(screen.getByRole("textbox", { name: "What needs to change" }), { target: { value: "Use the new price" } })
    // While writing, the row is Send and Cancel: Approve and Reject wait.
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })))
    expect(decide).toHaveBeenCalledWith("a1", "changes", "Use the new price")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Approve/ })))
    expect(decide).toHaveBeenLastCalledWith("a1", "approve", "")
  })

  it("offers the asker Withdraw, never the answers, and shows nothing without a request", () => {
    approval = make({ can_decide: false, can_withdraw: true })
    render(<TaskApprovalCard taskUUID="t" members={members} />)
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull()
    expect(screen.getByRole("button", { name: "Withdraw the request" })).toBeTruthy()
    cleanup()
    approval = null
    const { container } = render(<TaskApprovalCard taskUUID="t" members={members} />)
    expect(container.innerHTML).toBe("")
  })

  it("reads a status rule and an ended request in words", () => {
    expect(ruleSummary({ who: "admins", required: ["due", "assignee"], approvers: ["a", "b"], approvals_needed: 2, client: false })).toBe("Admins only · needs an assignee, a due date · 2 approvals")
    expect(ruleSummary({ who: "anyone", required: ["assignee"], approvers: [], approvals_needed: 1, client: false })).toBe("Needs an assignee")
    expect(ruleSummary({ who: "anyone", required: [], approvers: [], approvals_needed: 1, client: false })).toBe("Anyone, any time")
    expect(approvalWords(make({ state: "rejected" }))).toBe("Rejected")
  })

  it("has words for every state the server keeps (models/postgres/Approvals, the approvals.state check)", () => {
    // A state without words drew the card blank, in a rejection's colour.
    const states: Record<ApprovalState, true> = { pending: true, approved: true, changes: true, rejected: true, withdrawn: true, moved_on: true }
    for (const state of Object.keys(states) as ApprovalState[]) expect(approvalWords(make({ state })), state).toMatch(/\w/)
  })

  it("says a held move closed when the task went on without it, and where the task is now", () => {
    approval = make({ state: "moved_on", to_status: "inReview", to_name: "In review" })
    const { rerender } = render(<TaskApprovalCard taskUUID="t" members={members} status={{ value: "inProgress", label: "In progress" }} />)
    const card = screen.getByRole("region", { name: "Approval" })
    expect(card.textContent).toContain("Closed: the task moved to In progress")
    expect(card.textContent).toContain("Cy Park asked to move it to In review")
    expect(screen.queryByRole("button")).toBeNull()
    // Back where the move would have taken it, or nowhere known: closed, plainly.
    rerender(<TaskApprovalCard taskUUID="t" members={members} status={{ value: "inReview", label: "In review" }} />)
    expect(card.textContent).toContain("Closed: the task moved on")
    rerender(<TaskApprovalCard taskUUID="t" members={members} />)
    expect(card.textContent).toContain("Closed: the task moved on")
  })

  it("draws a request that closed without a no on a neutral tile, and a no in berry", () => {
    const tile = (state: ApprovalState) => {
      approval = make({ state })
      const { container } = render(<TaskApprovalCard taskUUID="t" members={members} />)
      const hue = container.querySelector(".hue-ink") ? "ink" : container.querySelector(".hue-berry") ? "berry" : "other"
      cleanup()
      return hue
    }
    expect(tile("withdrawn")).toBe("ink")
    expect(tile("moved_on")).toBe("ink")
    expect(tile("rejected")).toBe("berry")
    expect(tile("changes")).toBe("berry")
  })

  it("reads its request again when the task moves, here or by someone else, and not on its first draw", () => {
    approval = make()
    const { rerender } = render(<TaskApprovalCard taskUUID="t" members={members} status={{ value: "todo", label: "To do" }} />)
    expect(refresh).not.toHaveBeenCalled()
    rerender(<TaskApprovalCard taskUUID="t" members={members} status={{ value: "inProgress", label: "In progress" }} />)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("names the client in a rule and waits for them once the approvers are done", () => {
    expect(ruleSummary({ who: "anyone", required: [], approvers: [], approvals_needed: 1, client: true })).toBe("The client's approval")
    expect(ruleSummary({ who: "admins", required: [], approvers: ["a", "b"], approvals_needed: 2, client: true })).toBe("Admins only · 2 approvals and the client's")
    expect(approvalWords(make({ client: true, approvers: [], needed: 0, decisions: [] }))).toBe("Waiting for the client")
    expect(approvalWords(make({ client: true, needed: 1 }))).toBe("Waiting for the client")
    // The client's yes counts apart: it never stands in for an approver's.
    const clients = [{ user_id: NIL, client: true, name: "Dana", verdict: "approve" as const, comment: "", decided_at: "" }]
    expect(approvalWords(make({ client: true, decisions: clients }))).toBe("Waiting for approval · 0 of 2")
  })

  it("an ask says what is asked and by when, and waits for the client by name", () => {
    const due = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
    approval = make({ to_status: "", to_name: "", ask: "Is the launch copy final?", due_at: due, client: true, approvers: ["ana"], needed: 1 })
    render(<TaskApprovalCard taskUUID="t" members={members} />)
    const card = screen.getByRole("region", { name: "Approval" })
    expect(card.textContent).toContain("Waiting for the client")
    expect(card.textContent).toContain("Cy Park asked for approval")
    expect(card.textContent).not.toContain("move it to")
    expect(card.textContent).toContain("Is the launch copy final?")
    expect(card.textContent).toContain(dueLabel(due, new Date()))
    expect(screen.getByText("Ana Ruiz approved")).toBeTruthy()
    expect(screen.getByText("The client hasn't answered")).toBeTruthy()
  })

  it("says the client's answer in their name, beside what they said", () => {
    approval = make({
      state: "changes", client: true, approvers: ["ana"], needed: 1, can_decide: false,
      decisions: [{ user_id: NIL, client: true, name: "Dana", verdict: "changes", comment: "Use the new logo", decided_at: "" }],
    })
    render(<TaskApprovalCard taskUUID="t" members={members} />)
    expect(screen.getByText("Dana (client) asked for changes")).toBeTruthy()
    const said = screen.getByText("Use the new logo").closest("p")!
    expect(said.textContent).toContain("Dana (client)")
    expect(said.textContent).not.toContain("former member")
  })

  it("approving an ask says it's approved, never where it moves", async () => {
    approval = make({ to_status: "", to_name: "", needed: 1, approvers: ["ana"], decisions: [] })
    decide.mockResolvedValueOnce({ ...approval, state: "approved" })
    render(<TaskApprovalCard taskUUID="t" members={members} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Approve/ })))
    expect(toast).toHaveBeenCalledWith({ title: "Approved" })
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import type { TaskApproval } from "@/lib/rules/approvals"
import { GetEndpointUrl } from "@/services/endPoints"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// Members as the app names them: by their display name (lib/personName).
const members = [
  { user_uuid: "u-sam", user_name: "Sam Rivera" },
  { user_uuid: "u-ana", user_name: "Ana Ruiz" },
  { user_uuid: "u-ben", user_name: "Ben Ito" },
  { user_uuid: "u-bot", user_name: "Triage", is_bot: true },
]
let peopleFail = false
const retry = vi.fn()
const reads: { url: string; requestConfig?: object }[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (...[url, , , requestConfig]: [string, unknown?, unknown?, object?]) => {
    reads.push({ url, requestConfig })
    return peopleFail
      ? { data: undefined, isError: new Error("Request failed"), mutate: retry }
      : { data: { data: { task_project: { project_members: members } } }, isError: false, mutate: vi.fn() }
  },
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u-sam" } } }),
}))
let approval: TaskApproval | null = null
const ask = vi.fn()
vi.mock("@/hooks/useTaskApprovals", () => ({ useTaskApproval: () => ({ approval, ask }) }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
// The shared overlay and pickers have browser tests of their own: here, plain stand-ins.
vi.mock("@/components/ui/responsive-dialog", () => ({
  ResponsiveDialog: ({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) => (
    <div role="dialog" aria-label={title}>{children}<footer>{footer}</footer></div>
  ),
}))
vi.mock("@/components/ui/date-field", () => {
  const field = (p: { value: string; onChange: (v: string) => void; "aria-label"?: string }) => (
    <input aria-label={p["aria-label"]} value={p.value} onChange={(e) => p.onChange(e.target.value)} />
  )
  return { DateField: field, TimeField: field }
})

const { default: AskApprovalSheet, dueAtOf } = await import("@/components/work/approvals/AskApprovalSheet")

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  approval = null
  peopleFail = false
  reads.length = 0
})

const button = (name: string | RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement

describe("asking for a task's approval", () => {
  it("offers the project's people, never the asker or an agent, and asks once someone is picked", () => {
    render(<AskApprovalSheet taskUUID="t1" onClose={vi.fn()} />)
    const picks = screen.getByRole("group", { name: "Approvers" })
    expect(picks.textContent).toContain("Ana Ruiz")
    expect(picks.textContent).toContain("Ben Ito")
    expect(picks.textContent).not.toContain("Sam Rivera")
    expect(picks.textContent).not.toContain("Triage")
    expect(button("Ask").disabled).toBe(true)
    fireEvent.click(button(/The client approves too/))
    expect(button("Ask").disabled).toBe(false)
  })

  it("sends who, how many, the client, the due moment and the words, then closes", async () => {
    ask.mockResolvedValue({})
    const onClose = vi.fn()
    render(<AskApprovalSheet taskUUID="t1" onClose={onClose} />)
    fireEvent.click(button(/Ana Ruiz/))
    fireEvent.click(button(/Ben Ito/))
    expect(screen.getByText("1 of 2")).toBeTruthy()
    fireEvent.click(button("More"))
    fireEvent.click(button(/The client approves too/))
    fireEvent.change(screen.getByRole("textbox", { name: "Due date" }), { target: { value: "2026-10-30" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Due time" }), { target: { value: "11:30" } })
    fireEvent.change(screen.getByRole("textbox", { name: /What you ask/ }), { target: { value: "  Is the copy final?  " } })
    await act(async () => fireEvent.click(button("Ask")))
    expect(ask).toHaveBeenCalledWith({
      approvers: ["u-ana", "u-ben"], needed: 2, client: true, due_at: new Date("2026-10-30T11:30").toISOString(), ask: "Is the copy final?",
    })
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Asked for approval" }))
    expect(onClose).toHaveBeenCalled()
  })

  it("says the server's reason in place and stays open", async () => {
    ask.mockRejectedValue(Object.assign(new Error("Request failed"), {
      isAxiosError: true, response: { status: 400, data: { msg: "share a client link that can comment first, so the client can answer" } },
    }))
    const onClose = vi.fn()
    render(<AskApprovalSheet taskUUID="t1" onClose={onClose} />)
    fireEvent.click(button(/The client approves too/))
    await act(async () => fireEvent.click(button("Ask")))
    expect(screen.getByRole("alert").textContent).toMatch(/share a client link that can comment first/i)
    expect(onClose).not.toHaveBeenCalled()
  })

  it("says a request is waiting already, and offers no second one", () => {
    approval = { state: "pending" } as TaskApproval
    render(<AskApprovalSheet taskUUID="t1" onClose={vi.fn()} />)
    expect(screen.getByRole("status").textContent).toContain("waiting for approval already")
    fireEvent.click(button(/Ana Ruiz/))
    expect(button("Ask").disabled).toBe(true)
  })

  it("says a failed read of the project's people once, in place, with Try again", () => {
    peopleFail = true
    render(<AskApprovalSheet taskUUID="t1" onClose={vi.fn()} />)
    expect(screen.getByText("Couldn't load this project's people")).toBeTruthy()
    fireEvent.click(button("Try again"))
    expect(retry).toHaveBeenCalled()
    // Its own error state says it, so the read raises no toast as well (hooks/useFetch).
    expect(reads.find((r) => r.url === `${GetEndpointUrl.GetTaskInfo}/t1`)?.requestConfig).toMatchObject({ suppressErrorToast: true })
  })

  it("takes a day without a time as due at the end of its working day, and no day as no due", () => {
    expect(dueAtOf("2026-10-30", "")).toBe(new Date("2026-10-30T17:00").toISOString())
    expect(dueAtOf("", "09:00")).toBeNull()
  })
})

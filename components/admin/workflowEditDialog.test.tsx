import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const toastSpy = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() }) }))
vi.mock("@/components/task/TaskMoveFilterFields", () => ({ TaskMoveFilterFields: () => null, ANY_MOVE: {} }))
vi.mock("@/services/workflowService", async (orig) => ({
  ...(await orig<typeof import("@/services/workflowService")>()),
  createWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
}))

import { WorkflowEditDialog } from "@/components/admin/WorkflowEditDialog"
import { createWorkflow } from "@/services/workflowService"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("the workflow editor", () => {
  // "Can't save yet" was a toast in the corner, tied to no field.
  it("says a missing name under the name, puts the cursor there, and shows no toast", async () => {
    render(<WorkflowEditDialog open workflow={null} onClose={() => {}} onSaved={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Create workflow" }))
    const name = screen.getByLabelText("Name")
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"))
    expect(document.activeElement).toBe(name)
    expect(toastSpy).not.toHaveBeenCalled()
    expect(createWorkflow).not.toHaveBeenCalled()
  })

  // A new workflow starts with one reply whose message is empty.
  it("says what an action is missing in the Then section, not in a toast", async () => {
    render(<WorkflowEditDialog open workflow={null} onClose={() => {}} onSaved={() => {}} />)
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bug triage" } })
    fireEvent.click(screen.getByRole("button", { name: "Create workflow" }))
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toMatch(/Write the message for each reply/)
    expect(alert.closest("div")?.querySelector("h3")?.textContent).toBe("Then")
    expect(toastSpy).not.toHaveBeenCalled()
  })

  it("ties its fields to their labels, with no uppercase headings", () => {
    render(<WorkflowEditDialog open workflow={null} onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByLabelText(/Sender name/)).toBeTruthy()
    expect(screen.getByRole("switch", { name: /Turned on/ })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "When" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Then" })).toBeTruthy()
    expect(document.body.innerHTML).not.toMatch(/\buppercase\b/)
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ImportJob } from "@/services/importService"

let answers: unknown[] = []
vi.mock("@/services/importService", async (orig) => ({
  ...(await orig<typeof import("@/services/importService")>()),
  planImportJob: vi.fn(async () => {
    const next = answers.shift()
    if (next instanceof Error || (next && typeof next === "object" && "response" in next)) throw next
    return next
  }),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

const { ImportPlanDialog } = await import("./ImportPlanDialog")

afterEach(() => {
  cleanup()
  answers = []
})

const job = { id: "j1", provider: "jira", source_workspace_name: "Acme", status: "failed" } as ImportJob

describe("planning an import", () => {
  // A failed plan used to leave the dialog spinning behind a toast.
  it("says why a plan failed, offers to reconnect a refused token, and can try again", async () => {
    answers = [
      { response: { status: 400, data: { code: "token_rejected", error: "Jira didn't accept that email and API token." } } },
      { user_count: 3, user_new: 0, user_merge: 0, team_count: 0, project_count: 1, task_count: 9, subtask_count: 0, comment_count: 0, file_count: 0, file_bytes: 0 },
    ]
    const onReconnect = vi.fn()
    render(<ImportPlanDialog job={job} providerInfo={null} open onOpenChange={() => {}} onStarted={() => {}} onReconnect={onReconnect} />)
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Jira didn't accept that email and API token\./))
    expect((screen.getByRole("button", { name: "Start import" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }))
    expect(onReconnect).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(screen.getByText("Tasks")).toBeTruthy())
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("offers no reconnect for a problem reconnecting can't fix", async () => {
    answers = [{ response: { status: 409, data: { code: "active_job", error: "Another import of this workspace is waiting or running." } } }]
    render(<ImportPlanDialog job={job} providerInfo={null} open onOpenChange={() => {}} onStarted={() => {}} onReconnect={() => {}} />)
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
    expect(screen.queryByRole("button", { name: "Reconnect" })).toBeNull()
  })
})

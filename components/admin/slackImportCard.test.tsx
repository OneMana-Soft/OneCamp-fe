import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

let jobs: unknown[] = []
const refetch = vi.fn()
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { jobs }, isLoading: false, isError: undefined, mutate: refetch }) }))
vi.mock("@/hooks/useResilientPolling", () => ({ useResilientPolling: () => {} }))
vi.mock("@/components/mqtt/mqttProvider", () => ({ useMqtt: () => ({ connectionState: { isConnected: true } }) }))
const confirm = vi.fn()
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast: (...a: unknown[]) => toast(...a) }))
const rollbackSlackImport = vi.fn(async () => {})
vi.mock("@/services/slackImportService", async (orig) => ({
  ...(await orig<typeof import("@/services/slackImportService")>()),
  rollbackSlackImport: (...a: unknown[]) => rollbackSlackImport(...(a as [])),
}))
// The upload dialog, standing in for an upload the server says it has seen before.
vi.mock("@/components/admin/SlackImportUploadDialog", () => ({
  SlackImportUploadDialog: ({ open, onShowExisting }: { open: boolean; onShowExisting?: (id: string) => void }) =>
    open ? (
      <>
        <button onClick={() => onShowExisting?.("old-1")}>duplicate of a finished import</button>
        <button onClick={() => onShowExisting?.("old-2")}>duplicate of one waiting to be planned</button>
      </>
    ) : null,
}))
vi.mock("@/components/admin/SlackImportPlanDialog", () => ({
  SlackImportPlanDialog: ({ jobId }: { jobId: string }) => <p>plan dialog for {jobId}</p>,
}))

const SlackImportCard = (await import("./SlackImportCard")).default

const job = (id: string, status: string, over: Record<string, unknown> = {}) => ({
  id,
  slack_workspace_name: "acme",
  source: "export_zip",
  status,
  options: {},
  created_at: "2026-10-09T09:00:00Z",
  updated_at: "2026-10-09T09:00:00Z",
  started_at: "2026-10-09T09:01:00Z",
  chunks_total: 10,
  chunks_done: 10,
  chunks_failed: 0,
  items_imported: 12400,
  errors_total: 0,
  ...over,
})

afterEach(() => {
  cleanup()
  jobs = []
  confirm.mockReset()
  toast.mockReset()
  rollbackSlackImport.mockClear()
  vi.restoreAllMocks()
})

describe("the Slack import card", () => {
  // Rolling back asked through the browser's own prompt to type ROLLBACK:
  // unstyled, blocking, and suppressed in some installed-app windows.
  it("asks for the workspace's name before rolling back, in its own dialog", async () => {
    jobs = [job("j1", "completed")]
    const prompt = vi.spyOn(window, "prompt")
    render(<SlackImportCard />)
    fireEvent.click(screen.getByRole("button", { name: /Roll back/ }))
    expect(await screen.findByRole("alertdialog", { name: "Roll back the import of acme?" })).toBeTruthy()
    const go = screen.getByRole("button", { name: "Roll back import" }) as HTMLButtonElement
    expect(go.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Type acme to confirm/), { target: { value: "acme" } })
    expect(go.disabled).toBe(false)
    fireEvent.click(go)
    await waitFor(() => expect(rollbackSlackImport).toHaveBeenCalledWith("j1"))
    expect(prompt).not.toHaveBeenCalled()
  })

  // "Cancel" stood beside "Cancel import", and the import stopped on a word
  // about "in-flight chunks".
  it("asks before cancelling a running import, and names the safe button", () => {
    jobs = [job("j1", "running", { chunks_done: 4 })]
    render(<SlackImportCard />)
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ confirmText: "Cancel import", cancelText: "Keep importing", destructive: true }))
    expect(confirm.mock.calls[0][0].description).not.toMatch(/chunk/i)
  })

  // An export uploaded twice opened the plan of an import that had finished.
  it("shows a finished import an export already made, rather than planning it", async () => {
    jobs = [job("old-1", "completed"), job("new-9", "running", { slack_workspace_name: "beta" })]
    render(<SlackImportCard />)
    fireEvent.click(screen.getByRole("button", { name: /New import/ }))
    fireEvent.click(await screen.findByRole("button", { name: "duplicate of a finished import" }))
    await waitFor(() => expect(document.querySelector('[data-highlighted="true"]')?.getAttribute("data-job-id")).toBe("old-1"))
    expect(screen.queryByText(/plan dialog for/)).toBeNull()
  })

  it("plans an import an export already made, when it is still waiting to be planned", async () => {
    jobs = [job("old-2", "validating", { started_at: undefined })]
    render(<SlackImportCard />)
    fireEvent.click(screen.getByRole("button", { name: /New import/ }))
    fireEvent.click(await screen.findByRole("button", { name: "duplicate of one waiting to be planned" }))
    expect(await screen.findByText("plan dialog for old-2")).toBeTruthy()
  })
})

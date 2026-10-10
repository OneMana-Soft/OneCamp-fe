import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

let jobs: unknown[] = []
let loading = false
const refetch = vi.fn()
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => (loading ? { data: undefined, isLoading: true, isError: undefined, mutate: refetch } : { data: { jobs }, isLoading: false, isError: undefined, mutate: refetch }),
}))
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
  loading = false
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

// One frame for every admin tab: the Slack import was a bordered Card, each
// import a box inside it, and "WHAT CAME ACROSS" a third box inside that.
describe("the Slack import section's frame", () => {
  it("is a section with New import on its title's row, and its imports as list rows", () => {
    jobs = [job("j1", "completed", { digest: "23 channels and 48,211 messages came across." })]
    const { container } = render(<SlackImportCard />)
    const region = screen.getByRole("region", { name: "Import from Slack" })
    expect(screen.getByRole("heading", { level: 2, name: "Import from Slack" })).toBeTruthy()
    const action = region.querySelector("[data-section-action]") as HTMLElement
    expect(within(action).getByRole("button", { name: /New import/ }).className).toContain("bg-primary")
    expect(container.querySelector(".rounded-xl")).toBeNull()
    const row = within(screen.getByRole("list", { name: "Slack imports" })).getAllByRole("listitem")[0]
    const inner = row.firstElementChild as HTMLElement
    expect(inner.className).toContain("px-4 py-3")
    expect(inner.className).not.toMatch(/rounded-lg|p-3(\s|$)/)
  })

  it("says what came across under the import, in sentence case and in no box of its own", () => {
    jobs = [job("j1", "completed", { digest: "23 channels and 48,211 messages came across." })]
    render(<SlackImportCard />)
    const label = screen.getByText("What came across")
    expect(label.className).not.toMatch(/uppercase|tracking-/)
    const digest = document.querySelector("[data-import-digest]") as HTMLElement
    expect(digest.className).not.toMatch(/border|bg-muted/)
    expect(within(digest).getByText("23 channels and 48,211 messages came across.")).toBeTruthy()
  })

  it("greets a first run with the imported spot, at the quiet size", () => {
    render(<SlackImportCard />)
    expect(screen.getByText("No imports from Slack yet")).toBeTruthy()
    const spot = document.querySelector("[data-empty-illustration]") as HTMLElement
    expect(spot.className).toContain("[&>svg]:size-16")
  })

  it("loads in its rows' own shape, inside the list's frame", () => {
    loading = true
    render(<SlackImportCard />)
    const list = screen.getByRole("status", { name: "Loading imports" })
    expect(list.className).toContain("rounded-lg")
    expect(list.querySelectorAll("li").length).toBe(2)
    expect((list.querySelector("li") as HTMLElement).className).toContain("px-4 py-3")
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

// The card's data: one provider (Jira), connected, and its jobs.
let jobs: unknown[] = []
let jobsState: { isLoading?: boolean; isError?: unknown } = {}
let connectionsState: { isError?: unknown } = {}
let providersState: { isLoading?: boolean } = {}
const refetchJobs = vi.fn()
const asked: string[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    asked.push(url)
    if (url === "/admin/import/providers" && providersState.isLoading) return { data: undefined, isLoading: true, mutate: vi.fn() }
    if (url === "/admin/import/providers") return { data: { providers: [{ name: "jira", sources: ["api"], capabilities: [], default_status_map: {}, default_priority_map: {} }, { name: "asana", sources: ["api"], capabilities: [], default_status_map: {}, default_priority_map: {} }] }, mutate: vi.fn() }
    if (url === "/admin/import/connections")
      return connectionsState.isError
        ? { data: undefined, isError: connectionsState.isError, mutate: vi.fn() }
        : { data: { connections: [{ provider: "jira", created_at: "", updated_at: "1" }] }, mutate: vi.fn() }
    if (url.startsWith("/admin/import/jobs")) {
      if (jobsState.isLoading || jobsState.isError) return { data: undefined, ...jobsState, mutate: refetchJobs }
      return { data: { jobs }, mutate: refetchJobs }
    }
    return { data: undefined, mutate: vi.fn() }
  },
}))
vi.mock("@/hooks/useResilientPolling", () => ({ useResilientPolling: () => {} }))
vi.mock("@/components/mqtt/mqttProvider", () => ({ useMqtt: () => ({ connectionState: { isConnected: true } }) }))
const confirm = vi.fn()
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
let discover: () => Promise<unknown> = async () => []
const cancelImportJob = vi.fn(async () => {})
const createImportJob = vi.fn(async () => ({ job_id: "new" }))
vi.mock("@/services/importService", async (orig) => ({
  ...(await orig<typeof import("@/services/importService")>()),
  discoverImportResources: vi.fn(() => discover()),
  cancelImportJob: (...a: unknown[]) => cancelImportJob(...(a as [])),
  createImportJob: (...a: unknown[]) => createImportJob(...(a as [])),
}))
const fx = vi.hoisted(() => ({ celebrate: vi.fn(() => 8), springPop: vi.fn(() => null) }))
vi.mock("@/lib/celebrate", () => ({ celebrate: fx.celebrate, springPop: fx.springPop, prefersReducedMotion: () => false }))
vi.mock("@/components/admin/ImportConnectDialog", () => ({
  ImportConnectDialog: ({ open }: { open: boolean }) => (open ? <p>connect dialog open</p> : null),
}))

const ImportCard = (await import("./ImportCard")).default
const { ImportJobRow } = await import("./ImportJobRow")
const { ImportStepper, SLACK_STEPS } = await import("./importParts")
const { importProviderLabel } = await import("@/services/importService")

afterEach(() => {
  cleanup()
  asked.length = 0
  jobs = []
  jobsState = {}
  connectionsState = {}
  providersState = {}
  confirm.mockReset()
  toast.mockReset()
  refetchJobs.mockReset()
  cancelImportJob.mockClear()
  createImportJob.mockClear()
})

const running = { id: "a", provider: "jira", source_workspace_name: "Acme", source: "api", status: "running", stage: "tasks", options: {}, created_at: new Date().toISOString(), updated_at: "", chunks_total: 2, chunks_done: 1, chunks_failed: 0, items_imported: 40, errors_total: 0 }

describe("the import card", () => {
  // The workspace list used to swallow its failure, so a refused token
  // looked like an account with nothing to import.
  it("says why the list couldn't load, and offers to reconnect", async () => {
    discover = async () => {
      throw { response: { status: 400, data: { code: "token_rejected", error: "Jira didn't accept that email and API token." } } }
    }
    render(<ImportCard />)
    fireEvent.click(screen.getByRole("radio", { name: "Jira" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Jira didn't accept that email and API token\./))
    fireEvent.click(screen.getByRole("button", { name: /Reconnect/ }))
    await waitFor(() => expect(screen.getByText("connect dialog open")).toBeTruthy())
  })

  it("can try the list again after a failure it can't fix itself", async () => {
    let calls = 0
    discover = async () => {
      calls++
      if (calls === 1) throw { response: { status: 503, data: { code: "unreachable", error: "Couldn't reach https://acme.atlassian.net." } } }
      return [{ id: "ENG", name: "Engineering", kind: "project" }]
    }
    render(<ImportCard />)
    fireEvent.click(screen.getByRole("radio", { name: "Jira" }))
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
    expect(screen.queryByRole("button", { name: /Reconnect/ })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(screen.getByRole("option", { name: "Engineering" })).toBeTruthy())
    expect(screen.queryByRole("alert")).toBeNull()
  })

  // Picking a tool was a filled orange button that narrowed the history to it,
  // and the tool's Connection and New import were inserted above the history:
  // picking Jira pushed the list down by a form's height, and "All" pulled it
  // back up. The history is every tool's now, above the picker, and stays put.
  it("picks the tool as a choice of one, and the history neither moves nor narrows", () => {
    discover = async () => []
    jobs = [running]
    render(<ImportCard />)
    const picker = screen.getByRole("radiogroup", { name: "Tool to import from" })
    expect(within(picker).queryByRole("radio", { name: "All" })).toBeNull()
    const history = screen.getByRole("region", { name: "Recent imports" })
    expect(history.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(within(picker).getByRole("radio", { name: "Jira" }))
    expect(within(picker).getByRole("radio", { name: "Jira" }).getAttribute("aria-checked")).toBe("true")
    expect(asked.filter((u) => u.startsWith("/admin/import/jobs")).every((u) => u === "/admin/import/jobs")).toBe(true)
    expect(screen.getByRole("region", { name: "Recent imports" })).toBe(history)
    expect(within(history).getByText("Acme")).toBeTruthy()
    // The panel the tool opens sits under the picker, never above the history.
    const panel = document.querySelector("[data-provider-panel]") as HTMLElement
    expect(picker.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("is one flat section, its history and its new import sections inside it", () => {
    discover = async () => []
    const { container } = render(<ImportCard />)
    expect(screen.getByRole("heading", { level: 2, name: "Import from other tools" })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 3, name: "Recent imports" })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 3, name: "Start an import" })).toBeTruthy()
    expect(container.querySelector(".rounded-xl")).toBeNull()
  })

  // The picker's loading state was six bare h-8 bars without its well, 32px
  // against the real 40px, so the row grew when the tools arrived.
  it("draws the tools' loading state inside the picker's well", () => {
    providersState = { isLoading: true }
    render(<ImportCard />)
    const loading = screen.getByRole("status", { name: "Loading the tools" })
    expect(loading.className).toContain("bg-press")
    expect(loading.className).toContain("p-0.5")
    expect(loading.querySelectorAll("[class*='h-8']").length).toBe(6)
  })

  it("writes ClickUp as ClickUp", () => {
    expect(importProviderLabel("clickup")).toBe("ClickUp")
    expect(importProviderLabel("monday")).toBe("monday.com")
  })

  // "Source workspace name required" was a toast, away from the field.
  it("says what's missing under the field, and focuses it", async () => {
    discover = async () => []
    render(<ImportCard />)
    fireEvent.click(screen.getByRole("radio", { name: "Jira" }))
    fireEvent.click(await screen.findByRole("button", { name: "Start import" }))
    const field = screen.getByLabelText("Workspace name")
    expect(field.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByText("Name this import, so you can tell it apart in the history.")).toBeTruthy()
    expect(document.activeElement).toBe(field)
    expect(toast).not.toHaveBeenCalled()
    expect(createImportJob).not.toHaveBeenCalled()
  })

  // Cancel stopped a running import on one click.
  it("asks before cancelling a running import", () => {
    jobs = [running]
    render(<ImportCard />)
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(cancelImportJob).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ confirmText: "Cancel import", cancelText: "Keep importing", destructive: true }))
  })

  // A failed read of the connections showed "Connect Jira", offering to start
  // a connection that may already exist.
  it("says it couldn't check the connection rather than offering to connect", () => {
    discover = async () => []
    connectionsState = { isError: new Error("Network Error") }
    render(<ImportCard />)
    fireEvent.click(screen.getByRole("radio", { name: "Jira" }))
    expect(screen.queryByRole("button", { name: /Connect Jira/ })).toBeNull()
    expect(screen.getByText(/Couldn't check the connection/)).toBeTruthy()
  })
})

describe("the import history", () => {
  // "No imports yet." showed while the list was still loading, and when it
  // had failed: both times a claim about the workspace.
  it("is loading rows while it loads, not 'No imports yet'", () => {
    jobsState = { isLoading: true }
    render(<ImportCard />)
    expect(screen.getByRole("status", { name: "Loading the import history" })).toBeTruthy()
    expect(screen.queryByText("No imports yet.")).toBeNull()
  })

  it("says it couldn't load, and tries again", () => {
    jobsState = { isError: new Error("Network Error") }
    render(<ImportCard />)
    expect(screen.queryByText("No imports yet.")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(refetchJobs).toHaveBeenCalled()
  })
})

describe("the import card before a provider is picked", () => {
  // Jobs were listed only once a provider was picked, so an admin coming
  // back couldn't see how their imports were doing.
  it("lists every provider's imports, Slack's left to their own card", () => {
    discover = async () => []
    jobs = [
      running,
      { id: "b", provider: "slack", source_workspace_name: "Acme Slack", source: "export_zip", status: "completed", options: {}, created_at: new Date().toISOString(), updated_at: "", chunks_total: 1, chunks_done: 1, chunks_failed: 0, items_imported: 9, errors_total: 0 },
    ]
    render(<ImportCard />)
    expect(asked).toContain("/admin/import/jobs")
    expect(screen.getByText(/Jira ·/)).toBeTruthy()
    expect(screen.getByText("Acme")).toBeTruthy()
    expect(screen.queryByText("Acme Slack")).toBeNull()
  })
})

// Design v3, admin §A14 (mock M5). Importing is the moment a buyer decides, so
// it reads as a product, not a form:
// - the tools are source cards (a neutral mark and the name), not a strip of
//   eight words; Slack is first and hands off to its own section's upload;
// - a finished import keeps what's left (Roll back among it) behind one ⋯,
//   where three outline buttons per row used to sit;
// - finishing is one of the area's four celebrations, once per import: the
//   ids already celebrated are kept in this browser, so a retried run that
//   finishes again, or the same import seen in a second tab, stays quiet.
describe("the import screen, v3", () => {
  it("offers each tool as a source card with a mark and a name, Slack first and wide", () => {
    discover = async () => []
    render(<ImportCard />)
    const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-source-card]"))
    expect(cards.map((c) => c.getAttribute("data-source-card"))).toEqual(["slack", "jira", "asana"])
    expect(cards[0].getAttribute("data-wide")).toBe("true")
    expect(cards[0].textContent).toMatch(/Channels, threads, files/)
    for (const c of cards) {
      const mark = c.querySelector("[data-source-mark]") as HTMLElement
      expect(mark, "a mark").toBeTruthy()
      // Neutral: a source is a category, never a hue (§1.5).
      expect(mark.className).not.toMatch(/camp|hue/)
      expect(c.textContent).toMatch(/Slack|Jira|Asana/)
    }
    expect(screen.getByRole("radio", { name: "Asana" }).textContent).toMatch(/Projects, tasks, comments/)
  })

  it("hands Slack's card to the Slack section, which owns the upload", () => {
    discover = async () => []
    const heard = vi.fn()
    window.addEventListener("onecamp:slack-import-new", heard)
    render(<ImportCard />)
    fireEvent.click(document.querySelector('[data-source-card="slack"]') as HTMLElement)
    expect(heard).toHaveBeenCalledOnce()
    window.removeEventListener("onecamp:slack-import-new", heard)
  })

  it("keeps a finished import's Roll back behind its ⋯", () => {
    discover = async () => []
    jobs = [{ ...running, id: "f1", status: "completed", chunks_done: 2, errors_total: 3 }]
    render(<ImportCard />)
    expect(screen.queryByRole("button", { name: /Roll back/ })).toBeNull()
    fireEvent.keyDown(screen.getByRole("button", { name: "More for Acme" }), { key: "Enter" })
    expect(screen.getByRole("menuitem", { name: "Roll back" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "See 3 errors" })).toBeTruthy()
    fireEvent.click(screen.getByRole("menuitem", { name: "Roll back" }))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ confirmText: "Roll back import", destructive: true }))
  })

  it("celebrates an import finishing once per job id, even across remounts", () => {
    window.localStorage.removeItem("onecamp:import-celebrated")
    fx.celebrate.mockClear()
    const h = { onPlan: vi.fn(), onDiscard: vi.fn(), onCancel: vi.fn(), onRollback: vi.fn(), onRetryFailed: vi.fn(), onInvite: vi.fn(), onShowErrors: vi.fn() }
    const j = (status: string) => ({ ...running, id: "once-1", status }) as never
    const first = render(<ImportJobRow job={j("running")} {...h} />)
    first.rerender(<ImportJobRow job={j("completed")} {...h} />)
    expect(fx.celebrate).toHaveBeenCalledTimes(1)
    // Celebrated from the status dot.
    expect((fx.celebrate.mock.calls[0] as unknown[])[0]).toHaveProperty("className", "cx-dot")
    first.unmount()
    // The same import, seen running and finishing again (a retried run, a
    // second tab): no second burst.
    const again = render(<ImportJobRow job={j("running")} {...h} />)
    again.rerender(<ImportJobRow job={j("completed")} {...h} />)
    expect(fx.celebrate).toHaveBeenCalledTimes(1)
    again.unmount()
    // Another import finishing is its own moment.
    const other = render(<ImportJobRow job={{ ...(j("running") as object), id: "once-2" } as never} {...h} />)
    other.rerender(<ImportJobRow job={{ ...(j("completed") as object), id: "once-2" } as never} {...h} />)
    expect(fx.celebrate).toHaveBeenCalledTimes(2)
  })

  // The plan dialogs say where they sit in the flow: only the steps the flow
  // really has (upload, check the plan, bring it in). There is no people
  // mapping or channel choice to show as a step.
  it("draws the flow's real steps, the done ones done and the current one marked", () => {
    render(<ImportStepper steps={SLACK_STEPS} current={1} />)
    const steps = screen.getAllByRole("listitem")
    expect(steps.map((s) => s.getAttribute("data-state"))).toEqual(["done", "current", "next"])
    expect(steps[1].getAttribute("aria-current")).toBe("step")
    expect(steps[0].textContent).toMatch(/Upload the export \(done\)/)
  })
})

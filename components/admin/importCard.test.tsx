import { readFileSync } from "fs"
import { join } from "path"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { warmBursts } from "@/lib/celebrateSoon"
import { browserTZ } from "@/lib/utils/timeZone"

// The celebrations' bursts are a chunk fetched when the page is idle
// (lib/celebrateSoon): here they are in before anything finishes.
beforeAll(async () => {
  await warmBursts()
})

// The card's data: one provider (Jira), connected, and its jobs.
let jobs: unknown[] = []
let jobsState: { isLoading?: boolean; isError?: unknown } = {}
let connectionsState: { isError?: unknown } = {}
let providersState: { isLoading?: boolean } = {}
// Notion, which brings pages, connected beside Jira.
let withNotion = false
// The tools that bring tables alone: Airtable, and Google Sheets, which signs
// in and is connected.
let withTables = false
// The CSV file, a tool with a file to upload and no account.
let withCsv = false
// When Jira was last connected: connecting again changes it.
let jiraConnectedAt = "1"
const refetchJobs = vi.fn()
const asked: string[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    asked.push(url)
    if (url === "/admin/import/providers" && providersState.isLoading) return { data: undefined, isLoading: true, mutate: vi.fn() }
    if (url === "/admin/import/providers") {
      const providers: Array<Record<string, unknown>> = [{ name: "jira", sources: ["api"], capabilities: [], default_status_map: {}, default_priority_map: {} }, { name: "asana", sources: ["api"], capabilities: [], default_status_map: {}, default_priority_map: {} }]
      if (withNotion) providers.push({ name: "notion", sources: ["api"], capabilities: ["projects", "tasks", "pages"], default_status_map: {}, default_priority_map: {} })
      if (withTables)
        providers.push(
          { name: "airtable", sources: ["api"], capabilities: ["tables"], default_status_map: {}, default_priority_map: {} },
          { name: "gsheets", sources: ["api"], capabilities: ["tables"], default_status_map: {}, default_priority_map: {}, sign_in: { configured: true } },
        )
      if (withCsv) providers.push({ name: "csv", sources: ["backup_csv"], capabilities: ["teams", "projects", "tasks", "subtasks"], default_status_map: {}, default_priority_map: {} })
      return { data: { providers }, mutate: vi.fn() }
    }
    if (url === "/admin/import/connections")
      return connectionsState.isError
        ? { data: undefined, isError: connectionsState.isError, mutate: vi.fn() }
        : { data: { connections: [{ provider: "jira", created_at: "", updated_at: jiraConnectedAt }, ...(withNotion ? [{ provider: "notion", created_at: "", updated_at: "1" }] : []), ...(withTables ? [{ provider: "gsheets", created_at: "", updated_at: "1" }] : [])] }, mutate: vi.fn() }
    if (url.startsWith("/admin/import/jobs")) {
      if (jobsState.isLoading || jobsState.isError) return { data: undefined, ...jobsState, mutate: refetchJobs }
      return { data: { jobs }, mutate: refetchJobs }
    }
    return { data: undefined, mutate: vi.fn() }
  },
}))
vi.mock("@/hooks/useResilientPolling", () => ({ useResilientPolling: () => {} }))
// Live updates are on unless a test says they are off.
let mqttConnected = true
vi.mock("@/components/mqtt/mqttContext", async (orig) => ({ ...(await orig<object>()), useMqtt: () => ({ connectionState: { isConnected: mqttConnected } }) }))
const confirm = vi.fn()
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
let discover: () => Promise<unknown> = async () => []
const cancelImportJob = vi.fn(async () => {})
const createImportJob = vi.fn(async () => ({ job_id: "new" }))
const uploadImportFile = vi.fn()
vi.mock("@/services/importUploadService", () => ({ uploadImportFile: (...a: unknown[]) => uploadImportFile(...a) }))
vi.mock("@/services/importService", async (orig) => ({
  ...(await orig<typeof import("@/services/importService")>()),
  discoverImportResources: vi.fn(() => discover()),
  cancelImportJob: (...a: unknown[]) => cancelImportJob(...(a as [])),
  createImportJob: (...a: unknown[]) => createImportJob(...(a as [])),
}))
const fx = vi.hoisted(() => ({ celebrate: vi.fn(() => 8), springPop: vi.fn(() => null) }))
vi.mock("@/lib/celebrate", () => ({ celebrate: fx.celebrate, springPop: fx.springPop, prefersReducedMotion: () => false }))
vi.mock("@/lib/spring", () => ({ springPop: fx.springPop }))
vi.mock("@/lib/reducedMotion", () => ({ prefersReducedMotion: () => false }))
vi.mock("@/components/admin/ImportConnectDialog", () => ({
  ImportConnectDialog: ({ open }: { open: boolean }) => (open ? <p>connect dialog open</p> : null),
}))

const ImportCard = (await import("./ImportCard")).default
const { rollbackWords } = await import("./ImportCard")
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
  withNotion = false
  withTables = false
  withCsv = false
  jiraConnectedAt = "1"
  mqttConnected = true
  confirm.mockReset()
  toast.mockReset()
  refetchJobs.mockReset()
  cancelImportJob.mockClear()
  createImportJob.mockClear()
  uploadImportFile.mockReset()
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
    fireEvent.keyDown(await screen.findByRole("combobox"), { key: "ArrowDown" })
    expect(await screen.findByRole("option", { name: "Engineering" })).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  // Every read of the connections hands back new objects, as a refetch does
  // for a connection that hasn't changed. The list follows the connection, not
  // the object: asked once however often it is read, and again after Jira is
  // connected anew.
  it("asks for the tool's list once per connection, and again after reconnecting", async () => {
    let calls = 0
    discover = async () => {
      calls++
      return [{ id: "ENG", name: "Engineering", kind: "project" }]
    }
    const { rerender } = render(<ImportCard />)
    fireEvent.click(screen.getByRole("radio", { name: "Jira" }))
    await screen.findByRole("combobox")
    rerender(<ImportCard />)
    rerender(<ImportCard />)
    await new Promise((r) => setTimeout(r, 20))
    expect(calls).toBe(1)
    jiraConnectedAt = "2"
    rerender(<ImportCard />)
    await waitFor(() => expect(calls).toBe(2))
  })

  // Picking a tool was a filled orange button that narrowed the history to it.
  // The tools come first (DESIGN-BUILD-2, 20 Oct): a tool's panel opens under
  // the picker, and the history under them is every tool's, whatever is picked.
  it("picks the tool as a choice of one, its panel under the picker and the history under both, never narrowed", () => {
    discover = async () => []
    jobs = [running]
    render(<ImportCard />)
    const picker = screen.getByRole("radiogroup", { name: "Tool to import from" })
    expect(within(picker).queryByRole("radio", { name: "All" })).toBeNull()
    const history = screen.getByRole("region", { name: "Recent imports" })
    expect(picker.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(within(picker).getByRole("radio", { name: "Jira" }))
    expect(within(picker).getByRole("radio", { name: "Jira" }).getAttribute("aria-checked")).toBe("true")
    expect(asked.filter((u) => u.startsWith("/admin/import/jobs")).every((u) => u === "/admin/import/jobs")).toBe(true)
    expect(screen.getByRole("region", { name: "Recent imports" })).toBe(history)
    expect(within(history).getByText("Acme")).toBeTruthy()
    // The panel the tool opens sits under the picker, above the history.
    const panel = document.querySelector("[data-provider-panel]") as HTMLElement
    expect(picker.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(panel.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("is one flat section, its history and its new import sections inside it", () => {
    discover = async () => []
    jobs = [running]
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

  // "Start import" is the one thing to do here (DESIGN-BUILD-2, 20 Oct): filled,
  // and ready only once the start has what it needs, by the same check it
  // makes. Picking a project names the import after it.
  it("waits to start until a project is picked and the import is named", async () => {
    discover = async () => [{ id: "ENG", name: "Engineering", kind: "project" }]
    render(<ImportCard />)
    fireEvent.click(screen.getByRole("radio", { name: "Jira" }))
    const start = (await screen.findByRole("button", { name: "Start import" })) as HTMLButtonElement
    expect(start.disabled).toBe(true)
    fireEvent.keyDown(await screen.findByRole("combobox"), { key: "ArrowDown" })
    fireEvent.click(await screen.findByRole("option", { name: "Engineering" }))
    const name = screen.getByLabelText("Workspace name") as HTMLInputElement
    expect(name.value).toBe("Engineering")
    expect(start.disabled).toBe(false)
    fireEvent.change(name, { target: { value: "  " } })
    expect(start.disabled).toBe(true)
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

// In the guided first run (components/onboarding/OnboardingRun) the job is to
// pick a tool: the run opened on the card's long description and an empty
// history with its illustration, with the tools below the fold (DESIGN-BUILD-2,
// 20 Oct). The same card, in its first-run mode, not a second copy.
describe("the import card in the guided first run", () => {
  // The tiles name the tools themselves: the run's own line is the one line
  // (DESIGN-BUILD-3, 20 Oct). Five blocks of words sat around three tiles.
  it("is the tiles alone: no title, words, heading or helper line, no empty history, no notice", () => {
    discover = async () => []
    mqttConnected = false
    render(<ImportCard firstRun />)
    expect(document.querySelector("[data-source-picker]")).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Import from other tools" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Start an import" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Recent imports" })).toBeNull()
    expect(screen.queryByText(/Asana, Basecamp, ClickUp/)).toBeNull()
    expect(screen.queryByText("Pick a tool to connect it or start an import from it.")).toBeNull()
    expect(screen.queryByText(/Live updates are off/)).toBeNull()
    expect(screen.queryByText("No imports from other tools yet")).toBeNull()
  })

  it("lists its imports under the tiles once there are some", () => {
    discover = async () => []
    jobs = [running]
    render(<ImportCard firstRun />)
    const tiles = document.querySelector("[data-source-picker]") as HTMLElement
    const history = screen.getByRole("heading", { name: "Recent imports" })
    expect(tiles.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText("Acme")).toBeTruthy()
  })

  it("says when an import has started, so the run can move on", async () => {
    discover = async () => []
    const onStarted = vi.fn()
    render(<ImportCard firstRun onStarted={onStarted} />)
    fireEvent.click(screen.getByRole("radio", { name: "Jira" }))
    await screen.findByRole("button", { name: "Start import" })
    fireEvent.change(screen.getByLabelText("Workspace name"), { target: { value: "Acme" } })
    fireEvent.click(screen.getByRole("button", { name: "Start import" }))
    await waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1))
  })

  // Slack's upload is Admin › Import's own section, which the run doesn't
  // hold: its tile did nothing there. It opens that section, upload open.
  it("takes Slack to Admin › Import with its upload open", () => {
    discover = async () => []
    render(<ImportCard firstRun />)
    const slack = document.querySelector('[data-source-card="slack"]') as HTMLElement
    expect(slack.tagName).toBe("A")
    expect(slack.getAttribute("href")).toBe("/app/admin?tab=import&slack=new")
  })

  // Admin › Import leads with the tools too (DESIGN-BUILD-2, B-1): the empty
  // history and its illustration sat above them, the tools below the fold.
  it("is in the same order on Admin › Import, with the long words, the notice and Slack's own section", () => {
    discover = async () => []
    mqttConnected = false
    const order = () =>
      screen
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent)
        .filter((t) => t === "Recent imports" || t === "Start an import")
    const { unmount } = render(<ImportCard />)
    expect(order()).toEqual(["Start an import"])
    expect(screen.getByText(/Live updates are off/)).toBeTruthy()
    expect(screen.queryByText("No imports from other tools yet")).toBeNull()
    expect((document.querySelector('[data-source-card="slack"]') as HTMLElement).tagName).toBe("BUTTON")
    unmount()
    jobs = [running]
    render(<ImportCard />)
    expect(order()).toEqual(["Start an import", "Recent imports"])
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

// Docs programme C4: Notion's pages come across as docs, on by default, its
// databases as tables, and a picked database as a project too.
describe("importing from Notion", () => {
  it("brings pages as docs unless asked not to", async () => {
    withNotion = true
    discover = async () => [{ id: "db1", name: "Roadmap", kind: "database" }]
    render(<ImportCard />)
    const card = screen.getByRole("radio", { name: "Notion" })
    expect(card.textContent).toMatch(/Pages, databases, tasks/)
    fireEvent.click(card)
    const pages = await screen.findByRole("checkbox", { name: "Bring pages across as docs" })
    expect(pages.getAttribute("aria-checked")).toBe("true")
    expect(screen.getByText(/a connection's token reads the pages shared with it/)).toBeTruthy()
    expect(await screen.findByLabelText("Database to bring as a project (optional)")).toBeTruthy()

    // Each job carries the browser's zone, where the source's dates with no
    // time land on their own day.
    const time_zone = browserTZ()
    const start = async (options: Record<string, unknown>) => {
      fireEvent.change(screen.getByLabelText("Workspace name"), { target: { value: "Wiki" } })
      fireEvent.click(screen.getByRole("button", { name: "Start import" }))
      await waitFor(() => expect(createImportJob).toHaveBeenLastCalledWith("notion", expect.objectContaining({ options: { ...options, time_zone } })))
    }
    await start({ pages: true })
    fireEvent.click(pages)
    expect(screen.getByLabelText("Pick a Notion database")).toBeTruthy()
    await start({})
  })

  // At 768 px the settings column is a phone's width: four cards across cut
  // every line short ("Pag…"), so the cards go four across by the column's
  // width, not the window's.
  it("lays the tools out by the column's width", () => {
    render(<ImportCard />)
    expect(document.querySelector("[data-source-picker]")?.parentElement?.className).toBe("cx-imp-sources-wrap")
    const css = readFileSync(join(process.cwd(), "app/styles/admin/connect.css"), "utf8")
    expect(css).toMatch(/\.cx-imp-sources-wrap \{ container-type: inline-size; \}/)
    // Every card at least about 200px wide, so its two lines ("Projects, tasks, people")
    // aren't cut: four across at 600px made them 150px in the first run's 640px dialog.
    expect(css).toMatch(/@container \(min-width: 600px\) \{ \.cx-imp-sources \{ grid-template-columns: repeat\(3/)
    expect(css).toMatch(/@container \(min-width: 860px\) \{ \.cx-imp-sources \{ grid-template-columns: repeat\(4/)
    expect(css).not.toMatch(/@media[^{]*\{\s*\.cx-imp-sources \{/)
  })

  it("offers pages only for a tool that brings them", async () => {
    discover = async () => []
    render(<ImportCard />)
    fireEvent.click(screen.getByRole("radio", { name: "Jira" }))
    await screen.findByRole("button", { name: "Start import" })
    expect(screen.queryByRole("checkbox", { name: "Bring pages across as docs" })).toBeNull()
  })

  it("says rolling back sends the import's docs to the trash, where they can be restored", () => {
    expect(rollbackWords({ options: { pages: true } })).toMatch(/custom fields and tables.*Its docs go to the trash, with any pages added under them, where they can be restored\./)
    expect(rollbackWords({ options: {} })).not.toMatch(/docs|tables/)
  })

  it("says rolling back a Miro import deletes the boards it brought, with their pictures", () => {
    expect(rollbackWords({ provider: "miro", options: {} })).toBe(
      "This deletes the boards the import brought in, with their pictures. Boards your team has made, and anything else, stay.",
    )
  })

  // The server's rollback takes an import's tables too (business/Import
  // rollback.go): for a tool that brings nothing else, they are what goes.
  it("says rolling back a tool that brings tables alone deletes its tables, with their files", () => {
    withTables = true
    discover = async () => []
    jobs = [{ ...running, id: "t1", provider: "airtable", source_workspace_name: "Launch plan", status: "completed", chunks_done: 1 }]
    render(<ImportCard />)
    fireEvent.keyDown(screen.getByRole("button", { name: "More for Launch plan" }), { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Roll back" }))
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        description:
          "This deletes the tables the import brought in, with their files and any rows added to them since. Tables your team has made, and anything else, stay.",
      }),
    )
  })
})

describe("importing Google Sheets", () => {
  // Google Sheets has no list to pick from (the server answers its discover
  // with no_discover, which reads as none): the admin pastes the addresses.
  it("brings the spreadsheets pasted, and Start waits for one", async () => {
    withTables = true
    discover = async () => []
    render(<ImportCard />)
    const card = screen.getByRole("radio", { name: "Google Sheets" })
    expect(card.textContent).toMatch(/Sheets as tables, dropdowns/)
    fireEvent.click(card)
    const box = await screen.findByLabelText("Spreadsheets to bring")
    fireEvent.change(screen.getByLabelText("Workspace name"), { target: { value: "Launch budget" } })
    const start = screen.getByRole("button", { name: "Start import" })
    expect(start).toBeDisabled()

    const budget = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0"
    const vendors = "1qpyC0XzvTcKT6EISywvqESX3A0MwQoFDE8p-Bll4hps"
    fireEvent.change(box, { target: { value: `${budget}\n${vendors}\n` } })
    expect(start).toBeEnabled()
    fireEvent.click(start)
    await waitFor(() =>
      expect(createImportJob).toHaveBeenLastCalledWith(
        "gsheets",
        expect.objectContaining({ source_workspace_name: "Launch budget", options: { spreadsheets: [budget, vendors], time_zone: browserTZ() } }),
      ),
    )
  })
})

describe("a CSV of tasks", () => {
  const csv = (name = "Launch plan.csv") => new File(["Name,Assignee\nShip it,Ana Lima\n"], name, { type: "text/csv" })
  const pickCsv = () => {
    withCsv = true
    render(<ImportCard />)
    fireEvent.click(screen.getByRole("radio", { name: "CSV file" }))
  }
  // The file field is the imports' drop zone (ImportDropZone): its button is the field's, its input hidden.
  const fileInput = () => document.querySelector("[data-import-input]") as HTMLInputElement
  const chooser = () => screen.getByRole("button", { name: "Choose a CSV file" })

  it("is a file to upload, with no account to connect, and a mark of its own", () => {
    pickCsv()
    expect(screen.queryByText(/Not connected/)).toBeNull()
    expect(screen.queryByRole("button", { name: /Connect/ })).toBeNull()
    expect(fileInput().accept).toBe(".csv,text/csv")
    // A file, not a vendor: ClickUp's "C" would be its initial.
    const mark = screen.getByRole("radio", { name: "CSV file" }).querySelector('[data-source-mark="csv"]')
    expect(mark?.querySelector("svg")).toBeTruthy()
    expect(mark?.textContent).toBe("")
  })

  it("asks for a file, refuses one that isn't a CSV, and names the project from the file", () => {
    pickCsv()
    fireEvent.click(screen.getByRole("button", { name: /Start import/ }))
    expect(screen.getByText("Choose the CSV file to import.")).toBeTruthy()
    // Asked for at the field's own button, which the field's help and error describe.
    expect(chooser()).toHaveFocus()
    expect(chooser()).toHaveAccessibleDescription("Its first row names the columns. Choose the CSV file to import.")
    fireEvent.change(fileInput(), { target: { files: [csv("notes.txt")] } })
    expect(screen.getByText("notes.txt isn't a CSV file. Export the list as CSV, then choose that file.")).toBeTruthy()
    expect(chooser()).toHaveAttribute("aria-invalid", "true")
    fireEvent.change(fileInput(), { target: { files: [csv()] } })
    expect((screen.getByLabelText("Project name") as HTMLInputElement).value).toBe("Launch plan")
    expect(screen.queryByText(/isn't a CSV file/)).toBeNull()
    expect(uploadImportFile).not.toHaveBeenCalled()
  })

  it("takes a file dropped on the field, as one chosen", () => {
    pickCsv()
    fireEvent.drop(screen.getByText("Drop a file here, or").parentElement!, { dataTransfer: { types: ["Files"], files: [csv()] } })
    expect((screen.getByLabelText("Project name") as HTMLInputElement).value).toBe("Launch plan")
    expect(screen.getByText(/^Launch plan\.csv, /)).toBeTruthy()
  })

  it("uploads the file under the project's name, with its progress, then opens its plan", async () => {
    let finish: (v: { job_id: string }) => void = () => {}
    uploadImportFile.mockImplementation(async (...a: unknown[]) => {
      ;(a[4] as (p: number) => void)(40)
      return new Promise<{ job_id: string }>((r) => (finish = r))
    })
    refetchJobs.mockResolvedValue({ jobs: [] })
    pickCsv()
    const file = csv()
    fireEvent.change(fileInput(), { target: { files: [file] } })
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "  Launch, Q4 " } })
    fireEvent.click(screen.getByRole("button", { name: /Start import/ }))
    await waitFor(() => expect(screen.getByText("Uploading 40%…")).toBeTruthy())
    expect(uploadImportFile).toHaveBeenCalledWith("csv", file, "Launch, Q4", "backup_csv", expect.any(Function), expect.any(AbortSignal))
    expect(screen.getByRole("button", { name: /Uploading/ }).getAttribute("aria-busy")).toBe("true")
    finish({ job_id: "csv-1" })
    // Not in the list it read back: it says where the import went.
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Import created" })))
    expect(refetchJobs).toHaveBeenCalled()
    expect((screen.getByLabelText("Project name") as HTMLInputElement).value).toBe("")
  })

  it("says why an upload failed, and keeps the file and name to try again", async () => {
    uploadImportFile.mockRejectedValue({ response: { status: 413, data: { error: "That file is larger than this server takes." } } })
    pickCsv()
    fireEvent.change(fileInput(), { target: { files: [csv()] } })
    fireEvent.click(screen.getByRole("button", { name: /Start import/ }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("That file is larger than this server takes."))
    expect((screen.getByLabelText("Project name") as HTMLInputElement).value).toBe("Launch plan")
    expect((screen.getByRole("button", { name: /Start import/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("stops the upload when the panel goes", async () => {
    let signal: AbortSignal | undefined
    uploadImportFile.mockImplementation((...a: unknown[]) => {
      signal = a[5] as AbortSignal
      return new Promise<{ job_id: string }>(() => {})
    })
    pickCsv()
    fireEvent.change(fileInput(), { target: { files: [csv()] } })
    fireEvent.click(screen.getByRole("button", { name: /Start import/ }))
    await waitFor(() => expect(signal).toBeTruthy())
    fireEvent.click(screen.getByRole("radio", { name: "Jira" }))
    expect(signal?.aborted).toBe(true)
  })
})

// basecamp-46: the admin comes back from signing in at a provider, and the
// card says how it went, picks that provider, and leaves the address clean.
describe("coming back from signing in", () => {
  afterEach(() => window.history.replaceState(null, "", "/"))

  it("says the provider is connected and picks it", async () => {
    window.history.replaceState(null, "", "/app/admin?tab=import&connected=basecamp")
    render(<ImportCard />)
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Basecamp connected" })))
    expect(window.location.search).toBe("?tab=import")
  })

  it("says why it didn't connect, in words", async () => {
    window.history.replaceState(null, "", "/app/admin?tab=import&connect_error=cancelled&provider=basecamp")
    render(<ImportCard />)
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Basecamp wasn't connected", description: "The sign-in was cancelled, so nothing changed." })),
    )
    expect(window.location.search).toBe("?tab=import")
  })
})

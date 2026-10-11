import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { ReactElement, ReactNode } from "react"

// The section reads the AI settings through SWR (one key shared with agent
// collaboration), so each test gets its own cache and no automatic retries.
const fresh = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>{children}</SWRConfig>
)
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: fresh })

const toastSpy = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
// AI internals, stood in for: this checks the card's own chrome.
vi.mock("@/components/admin/ai/ProviderEditor", () => ({ ProviderEditor: () => null }))
vi.mock("@/components/admin/ai/SystemStatsBar", () => ({ SystemStatsBar: () => null }))
vi.mock("@/components/admin/ai/ModelCombobox", () => ({ ModelCombobox: () => null }))
vi.mock("@/components/admin/ai/AuthorizedModelsSection", () => ({ default: () => null }))
vi.mock("@/components/admin/ai/AISelfTestSection", () => ({ default: () => null }))
vi.mock("@/components/admin/ai/RunnerTestStatus", () => ({ RunnerTestStatus: () => null }))
vi.mock("@/components/admin/McpServersCard", () => ({ default: () => null }))
vi.mock("@/services/aiModelService", async (orig) => ({
  ...(await orig<typeof import("@/services/aiModelService")>()),
  getAIConfig: vi.fn(),
  getAISystemStats: vi.fn(),
  getReindexStatus: vi.fn(),
  getMemoryBackfillStatus: vi.fn(),
  getAIUsage: vi.fn(),
  getAIUserUsage: vi.fn(),
  getAIChannelUsage: vi.fn(),
  getCodePRScorecard: vi.fn(),
  getCodePRRuns: vi.fn(),
  listProviderModels: vi.fn(),
  setAIEnabled: vi.fn(),
  setMemoryLayerEnabled: vi.fn(),
  setWebSearch: vi.fn(),
}))

import AIModelsCard, { AdvancedPanels, AmbientAgentsPanel, UsagePanel, advancedSummaries } from "@/components/admin/AIModelsCard"
import {
  getAIChannelUsage,
  getAIConfig,
  getAISystemStats,
  getAIUsage,
  getAIUserUsage,
  getCodePRRuns,
  getCodePRScorecard,
  getMemoryBackfillStatus,
  getReindexStatus,
  setMemoryLayerEnabled,
  setWebSearch,
} from "@/services/aiModelService"

const config = {
  enabled: true,
  rate_limit_per_min: 30,
  providers: [],
  chat_provider_id: "",
  chat_model: "",
  embedding_provider_id: "",
  embedding_model: "",
  embedding_dimension: 768,
  context_window_tokens: 0,
  effective_context_window: 8192,
  code_analysis_max_files: 0,
  effective_code_analysis_max_files: 40,
  reasoning_enabled: false,
  local_only_mode: false,
  pii_redaction_enabled: false,
  meeting_recap_enabled: false,
  memory_layer_enabled: false,
  team_report_enabled: false,
  nudges_enabled: false,
  coworker_enabled: false,
  issue_triage_enabled: false,
  web_search_provider: "searxng",
  web_search_base_url: "https://searx.example.com",
  web_search_enabled: false,
  sandbox_enabled: false,
  sandbox_used_today_runs: 0,
  sandbox_used_today_seconds: 0,
  code_pr_enabled: false,
  code_pr_egress_allowlist: [],
  code_pr_effective_wall_minutes: 20,
  code_pr_used_today_runs: 0,
  code_pr_used_today_minutes: 0,
  workspace_daily_token_budget: 0,
  user_daily_token_budget: 0,
}

beforeEach(() => {
  vi.mocked(getAISystemStats).mockResolvedValue(null as never)
  vi.mocked(getReindexStatus).mockResolvedValue({ running: false, total: 0, processed: 0, failed: 0 } as never)
  vi.mocked(getMemoryBackfillStatus).mockResolvedValue({ state: "idle" } as never)
  vi.mocked(getAIUsage).mockResolvedValue({ workspace: { used: 900, limit: 1000 }, user: { used: 10, limit: 0 } } as never)
  vi.mocked(getAIUserUsage).mockResolvedValue({ users: [] } as never)
  vi.mocked(getAIChannelUsage).mockResolvedValue({ channels: [] } as never)
  vi.mocked(getCodePRScorecard).mockResolvedValue(null as never)
  vi.mocked(getCodePRRuns).mockResolvedValue([] as never)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// AI & agents is six sub-pages since design v3 (admin §A15); this file holds
// the parts of them that read and write the AI settings: Models (the default
// export), the ambient agents, usage and the folded Advanced cards.
describe("the AI settings' parts", () => {
  // Requests awaited one after another held the tab on a line of text for
  // the sum of their round trips.
  it("starts the Models page's first requests together, and holds its shape while they run", async () => {
    vi.mocked(getAIConfig).mockReturnValue(new Promise(() => {}))
    render(<AIModelsCard />)
    expect(screen.getByRole("status", { name: "Loading the AI settings" })).toBeTruthy()
    await waitFor(() => {
      expect(getAISystemStats).toHaveBeenCalled()
      expect(getReindexStatus).toHaveBeenCalled()
    })
  })

  it("says the settings could not be loaded, with Try again", async () => {
    vi.mocked(getAIConfig).mockRejectedValue(new Error("Network Error"))
    render(<AIModelsCard />)
    expect(await screen.findByText(/Couldn't load the AI settings/, { selector: "h3" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
  })

  it("keeps its h2 when the read fails, with the compact error under it", async () => {
    vi.mocked(getAIConfig).mockRejectedValue({ response: { status: 403, data: { msg: "Only admins can read this." } } })
    const { container } = render(<AIModelsCard />)
    expect(await screen.findByText("Only admins can read this.")).toBeTruthy()
    expect(screen.getByRole("heading", { level: 2, name: /Models/ })).toBeTruthy()
    expect(container.querySelector("[data-empty-illustration]")).toBeTruthy()
  })

  // A routine save says itself on its row (admin §1.3): a refusal puts the
  // switch back and leaves the server's words under the label, no toast.
  it("puts a refused switch back, with the server's reason on its row", async () => {
    vi.mocked(getAIConfig).mockResolvedValue({ ...config, memory_layer_enabled: false } as never)
    vi.mocked(getMemoryBackfillStatus).mockResolvedValue({ state: "idle" } as never)
    vi.mocked(setMemoryLayerEnabled).mockRejectedValueOnce({ response: { data: { msg: "The demo is shared, so memory stays off." } } })
    render(<AmbientAgentsPanel />)
    const sw = await screen.findByRole("switch", { name: /Workspace memory/ })
    fireEvent.click(sw)
    expect(await screen.findByText("The demo is shared, so memory stays off.")).toBeTruthy()
    await waitFor(() => expect(sw.getAttribute("aria-checked")).toBe("false"))
    expect(toastSpy).not.toHaveBeenCalled()
  })

  // The web search switch only stages its change; the dock says so.
  it("holds a staged web search change in a save bar, and saves from it", async () => {
    vi.mocked(getAIConfig).mockResolvedValue(config as never)
    vi.mocked(setWebSearch).mockResolvedValue(undefined as never)
    render(<AdvancedPanels />)
    fireEvent.click(await screen.findByRole("button", { name: /Web search/ }))
    fireEvent.click(await screen.findByRole("switch", { name: "Use web search" }))
    const bar = await screen.findByRole("region", { name: "Unsaved changes" })
    expect(bar.textContent).toMatch(/web search/)
    fireEvent.click(bar.querySelector("button:last-child") as HTMLElement)
    await waitFor(() => expect(setWebSearch).toHaveBeenCalledWith(expect.objectContaining({ provider: "searxng", enabled: true })))
  })

  it("says how near today's cap the workspace is on the shared progress bar, and no environment variable", async () => {
    vi.mocked(getAIConfig).mockResolvedValue(config as never)
    render(<UsagePanel />)
    const bar = await screen.findByRole("progressbar", { name: /Workspace: 90% of today's cap/ })
    expect(bar).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/AI_WORKSPACE_DAILY_TOKEN_BUDGET/)
  })

  // The rebuild bar animated its width; the shared bar moves by transform.
  // It was a tinted warning box; it is a card.
  it("shows the search index rebuild on the shared progress bar, in a card", async () => {
    vi.mocked(getAIConfig).mockResolvedValue(config as never)
    vi.mocked(getReindexStatus).mockResolvedValue({ running: true, total: 200, processed: 49, failed: 1, dimension: 768 } as never)
    const { container } = render(<AIModelsCard />)
    const bar = await screen.findByRole("progressbar", { name: /Rebuilding the AI search index: 25%/ })
    expect(bar.closest("[data-settings-card]")).toBeTruthy()
    expect(container.innerHTML).not.toMatch(/transition-\[width|bg-warning\/10/)
    expect(container.textContent).toMatch(/1 item couldn't be indexed\./)
  })

  // Advanced (admin §A15): each card is folded to its title row with what is
  // in force on the right, and opens on a click.
  it("folds each Advanced card to its title row with a summary", async () => {
    vi.mocked(getAIConfig).mockResolvedValue({ ...config, sandbox_enabled: true, sandbox_workspace_daily_seconds: 3600 } as never)
    render(<AdvancedPanels />)
    const sandbox = await screen.findByRole("button", { name: /Code analysis sandbox/ })
    expect(sandbox.getAttribute("aria-expanded")).toBe("false")
    expect(sandbox.textContent).toContain("On · 3,600 s a day")
    for (const name of [/Model tuning/, /Code analysis depth/, /Web search/, /Code pull requests/]) {
      expect(screen.getByRole("button", { name }).getAttribute("aria-expanded")).toBe("false")
    }
    expect(screen.queryByRole("switch", { name: "Use the code analysis sandbox" })).toBeNull()
    fireEvent.click(sandbox)
    expect(await screen.findByRole("switch", { name: "Use the code analysis sandbox" })).toBeTruthy()
  })

  it("says Off for what is off, and the provider for web search", () => {
    const s = advancedSummaries({ ...config, web_search_enabled: true } as never)
    expect(s.webSearch).toBe("On · SearXNG")
    expect(s.codePRs).toBe("Off")
    expect(s.tuning).toBe("8,192 tokens · reasoning off")
  })

  // The readers of /admin/ai/config share one key.
  it("reads the AI settings through the shared key, nowhere else", () => {
    const src = readFileSync(resolve(__dirname, "AIModelsCard.tsx"), "utf8")
    expect(src).toContain("useAIConfig()")
    expect(src).not.toMatch(/\bgetAIConfig\(/)
  })
})

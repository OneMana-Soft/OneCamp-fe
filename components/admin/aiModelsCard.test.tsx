import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

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
  setWebSearch: vi.fn(),
}))

import AIModelsCard from "@/components/admin/AIModelsCard"
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
  setAIEnabled,
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

describe("the AI tab's models section", () => {
  // Five requests were awaited one after another, so the tab sat on a line of
  // text for the sum of five round trips.
  it("starts its first requests together, and holds the page's shape while they run", async () => {
    vi.mocked(getAIConfig).mockReturnValue(new Promise(() => {}))
    render(<AIModelsCard />)
    expect(screen.getByRole("status", { name: "Loading the AI settings" })).toBeTruthy()
    await waitFor(() => {
      expect(getAISystemStats).toHaveBeenCalled()
      expect(getReindexStatus).toHaveBeenCalled()
      expect(getMemoryBackfillStatus).toHaveBeenCalled()
      expect(getAIUsage).toHaveBeenCalled()
    })
  })

  it("says the settings could not be loaded, with Try again", async () => {
    vi.mocked(getAIConfig).mockRejectedValue(new Error("Network Error"))
    render(<AIModelsCard />)
    expect(await screen.findByText(/Couldn't load the AI settings/, { selector: "h3" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
  })

  // The switches that save at once are rows of one list, named by their label.
  it("names each switch by its row and says why one failed, in the server's words", async () => {
    vi.mocked(getAIConfig).mockResolvedValue(config as never)
    vi.mocked(setAIEnabled).mockRejectedValueOnce({ response: { data: { msg: "The demo is shared, so AI stays on." } } })
    render(<AIModelsCard />)
    fireEvent.click(await screen.findByRole("switch", { name: "Workspace AI" }))
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't turn workspace AI off", description: "The demo is shared, so AI stays on." }),
      ),
    )
  })

  // The web search switch only staged its change, beside switches that save
  // at once; nothing said so, and an admin who turned it on and left had
  // changed nothing.
  it("holds a staged web search change in a save bar, and saves from it", async () => {
    vi.mocked(getAIConfig).mockResolvedValue(config as never)
    vi.mocked(setWebSearch).mockResolvedValue(undefined as never)
    render(<AIModelsCard />)
    fireEvent.click(await screen.findByRole("switch", { name: "Use web search" }))
    const bar = await screen.findByRole("region", { name: "Unsaved changes" })
    expect(bar.textContent).toMatch(/web search/)
    fireEvent.click(bar.querySelector("button:last-child") as HTMLElement)
    await waitFor(() => expect(setWebSearch).toHaveBeenCalledWith(expect.objectContaining({ provider: "searxng", enabled: true })))
  })

  it("says how near today's cap the workspace is on the shared progress bar, and no environment variable", async () => {
    vi.mocked(getAIConfig).mockResolvedValue(config as never)
    render(<AIModelsCard />)
    const bar = await screen.findByRole("progressbar", { name: /Workspace: 90% of today's cap/ })
    expect(bar).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/AI_WORKSPACE_DAILY_TOKEN_BUDGET/)
  })

  // The rebuild bar animated its width, a layout property, on every poll; the
  // shared bar moves by transform.
  it("shows the search index rebuild on the shared progress bar, with nothing animating a width", async () => {
    vi.mocked(getAIConfig).mockResolvedValue(config as never)
    vi.mocked(getReindexStatus).mockResolvedValue({ running: true, total: 200, processed: 49, failed: 1, dimension: 768 } as never)
    const { container } = render(<AIModelsCard />)
    const bar = await screen.findByRole("progressbar", { name: /Rebuilding the AI search index: 25%/ })
    expect(bar).toBeTruthy()
    expect(container.innerHTML).not.toMatch(/transition-\[width/)
    expect(container.textContent).toMatch(/1 item couldn't be indexed\./)
  })
})

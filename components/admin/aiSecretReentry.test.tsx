import { afterEach, beforeEach, describe, it, vi } from "vitest"
import { cleanup, fireEvent, render as rtlRender, screen, within } from "@testing-library/react"
import { SWRConfig } from "swr"
import type { ReactElement, ReactNode } from "react"
import { expectSecretAskedAgain } from "@/lib/testing/secretReentryKit"

// The AI settings' three stored secrets beside an address (web search's API
// key, the sandbox's and the coding runner's tokens) are bound to the address
// they were given for: another one needs them entered again
// (hooks/useSecretReentry), as the server holds them. Each section asks before
// saving.

const fresh = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>{children}</SWRConfig>
)
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: fresh })

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
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
  getCodePRScorecard: vi.fn(),
  getCodePRRuns: vi.fn(),
  listProviderModels: vi.fn(),
  setWebSearch: vi.fn(),
  setSandboxConfig: vi.fn(),
  setCodePRConfig: vi.fn(),
}))

import { AdvancedPanels } from "@/components/admin/AIModelsCard"
import { getAIConfig, getCodePRRuns, getCodePRScorecard, setCodePRConfig, setSandboxConfig, setWebSearch } from "@/services/aiModelService"

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
  web_search_provider: "tavily",
  web_search_base_url: "https://search.example.com",
  has_web_search_key: true,
  web_search_enabled: true,
  sandbox_enabled: false,
  sandbox_runner_url: "https://runner.example.com",
  has_sandbox_runner_token: true,
  sandbox_used_today_runs: 0,
  sandbox_used_today_seconds: 0,
  code_pr_enabled: false,
  code_pr_runner_url: "https://coder.example.com",
  has_code_pr_runner_token: true,
  code_pr_egress_allowlist: [],
  code_pr_effective_wall_minutes: 20,
  code_pr_used_today_runs: 0,
  code_pr_used_today_minutes: 0,
  workspace_daily_token_budget: 0,
  user_daily_token_budget: 0,
}

beforeEach(() => {
  vi.mocked(getAIConfig).mockResolvedValue(config as never)
  vi.mocked(getCodePRScorecard).mockResolvedValue(null as never)
  vi.mocked(getCodePRRuns).mockResolvedValue([] as never)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/** Opens one of the folded Advanced cards, and the part of the page it is. */
async function openCard(title: RegExp, id: string) {
  render(<AdvancedPanels />)
  fireEvent.click(await screen.findByRole("button", { name: title }))
  return within(document.getElementById(id)!)
}
const saveBar = () => {
  const bar = screen.getByRole("region", { name: "Unsaved changes" })
  fireEvent.click(bar.querySelector("button:last-child") as HTMLElement)
}

describe("a stored secret in the AI settings", () => {
  it("web search's key is asked for again when its address moves, and nothing is saved", async () => {
    const card = await openCard(/Web search/, "ai-models-web-search")
    await expectSecretAskedAgain({
      address: () => card.getByLabelText(/Address/),
      moveTo: "https://search.elsewhere.example.net",
      secret: () => card.getByLabelText("API key"),
      noun: "API key",
      save: saveBar,
      sent: () => vi.mocked(setWebSearch).mock.calls.length,
    })
  })

  it("the sandbox's runner token is asked for again when its runner moves, and nothing is saved", async () => {
    const card = await openCard(/Code analysis sandbox/, "ai-models-sandbox")
    await expectSecretAskedAgain({
      address: () => card.getByLabelText("Runner address"),
      moveTo: "https://runner.elsewhere.example.net",
      secret: () => card.getByLabelText("Runner token"),
      noun: "runner token",
      save: saveBar,
      sent: () => vi.mocked(setSandboxConfig).mock.calls.length,
    })
  })

  it("the coding runner's token is asked for again when its runner moves, and nothing is saved", async () => {
    const card = await openCard(/Code pull requests/, "ai-models-code-prs")
    await expectSecretAskedAgain({
      address: () => card.getByLabelText("Runner address"),
      moveTo: "https://coder.elsewhere.example.net",
      secret: () => card.getByLabelText("Runner token"),
      noun: "runner token",
      save: saveBar,
      sent: () => vi.mocked(setCodePRConfig).mock.calls.length,
    })
  })
})

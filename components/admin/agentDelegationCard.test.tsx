import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import type { ReactElement, ReactNode } from "react"

vi.mock("@/services/aiModelService", async (orig) => ({
  ...(await orig<typeof import("@/services/aiModelService")>()),
  getAIConfig: vi.fn(),
  setAIAgentDelegation: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))

import AgentDelegationCard from "@/components/admin/AgentDelegationCard"
import { getAIConfig, setAIAgentDelegation } from "@/services/aiModelService"
import { useAIConfig } from "@/components/admin/ai/useAIConfig"

// The card reads the AI settings through SWR (one key shared with the Models
// section), so each test gets its own cache and no automatic retries.
const fresh = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>{children}</SWRConfig>
)
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: fresh })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const config = { agent_delegation_enabled: false, agent_delegation_max_hops: 2, agent_delegation_surfaces: "" }

describe("agent collaboration", () => {
  // A failed read left the form on its defaults, "off", with "Saved." under it:
  // a false account of the policy, and a Save that would overwrite the real one.
  it("says the policy could not be loaded, and shows no form and no 'Saved.'", async () => {
    vi.mocked(getAIConfig).mockRejectedValueOnce(new Error("Network Error"))
    render(<AgentDelegationCard />)
    expect(await screen.findByText(/Couldn't load the collaboration policy/)).toBeTruthy()
    expect(screen.queryByRole("switch")).toBeNull()
    expect(screen.queryByText("Saved.")).toBeNull()
    vi.mocked(getAIConfig).mockResolvedValueOnce(config as never)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("switch", { name: /Allow agents to ask each other/ })).toBeTruthy()
  })

  it("shows rows in the form's shape while loading, not a form of defaults", () => {
    vi.mocked(getAIConfig).mockReturnValue(new Promise(() => {}))
    render(<AgentDelegationCard />)
    expect(screen.getByRole("status", { name: /Loading/ })).toBeTruthy()
    expect(screen.queryByRole("switch")).toBeNull()
  })

  // The hop count was five buttons, the chosen one filled in the accent.
  it("chooses how far a chain goes from a radio group, and saves from a save bar", async () => {
    vi.mocked(getAIConfig).mockResolvedValue(config as never)
    render(<AgentDelegationCard />)
    const group = await screen.findByRole("radiogroup", { name: /How far a chain can go/ })
    const three = screen.getByRole("radio", { name: "3" })
    expect(group.contains(three)).toBe(true)
    fireEvent.click(three)
    expect(three.getAttribute("aria-checked")).toBe("true")
    const bar = await screen.findByRole("region", { name: "Unsaved changes" })
    fireEvent.click(bar.querySelector("button:last-child") as HTMLElement)
    await waitFor(() => expect(setAIAgentDelegation).toHaveBeenCalledWith(false, 3, ""))
  })

  // The hops were a hand-made radio group marking the choice with
  // bg-background alone, 1.03:1 against its well; the house control raises it.
  it("picks the hops from the house segmented control", async () => {
    vi.mocked(getAIConfig).mockResolvedValue(config as never)
    render(<AgentDelegationCard />)
    await screen.findByRole("radiogroup", { name: /How far a chain can go/ })
    const two = screen.getByRole("radio", { name: "2" })
    expect(two.getAttribute("aria-checked")).toBe("true")
    expect(two.className).toContain("data-[state=checked]:bg-card")
  })

  // The Models section and this one each fetched /admin/ai/config.
  it("reads the AI settings once with the Models section", async () => {
    vi.mocked(getAIConfig).mockResolvedValue(config as never)
    function ModelsReader() {
      const { config: c } = useAIConfig()
      return <p>{c ? "models has it" : "models waiting"}</p>
    }
    render(
      <>
        <ModelsReader />
        <AgentDelegationCard />
      </>,
    )
    await screen.findByText("models has it")
    await screen.findByRole("switch", { name: /Allow agents to ask each other/ })
    expect(getAIConfig).toHaveBeenCalledTimes(1)
  })

  it("loads in its list's shape and fails compactly with the server's reason", async () => {
    vi.mocked(getAIConfig).mockReturnValue(new Promise(() => {}))
    const { unmount } = render(<AgentDelegationCard />)
    expect(screen.getByRole("status", { name: /Loading/ }).hasAttribute("data-section-list-skeleton")).toBe(true)
    unmount()
    vi.mocked(getAIConfig).mockRejectedValue({ response: { status: 403, data: { msg: "Only admins can read this." } } })
    const { container } = render(<AgentDelegationCard />)
    expect(await screen.findByText("Only admins can read this.")).toBeTruthy()
    expect(container.querySelector("[data-empty-illustration]")).toBeTruthy()
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The Integrations tab's three sections (Slack bridge, GitHub, sign-in
// providers) in one frame: titles without tiles, states said with the app's
// status word, each loading state in the shape of what replaces it, and a
// failed read in the compact form under the title.

const { reads, slack, http } = vi.hoisted(() => ({
  reads: { current: {} as Record<string, { data?: unknown; isLoading?: boolean; isError?: unknown }> },
  slack: { getSlackBridge: vi.fn() },
  http: { get: vi.fn(), post: vi.fn() },
}))

vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => ({ data: undefined, isLoading: false, isError: undefined, mutate: vi.fn(), ...(reads.current[key] ?? {}) }),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
vi.mock("@/hooks/useProjectStatuses", () => ({ useProjectStatuses: () => ({ options: [] }) }))
vi.mock("@/lib/axiosInstance", () => ({ default: { get: http.get, post: http.post }, OWN_ERRORS: {} }))
vi.mock("react-redux", async (orig) => ({ ...(await orig<typeof import("react-redux")>()), useDispatch: () => vi.fn() }))
vi.mock("@/services/slackBridgeService", async (orig) => ({
  ...(await orig<typeof import("@/services/slackBridgeService")>()),
  getSlackBridge: slack.getSlackBridge,
  listSlackChannels: vi.fn().mockResolvedValue([]),
}))

import GitHubIntegrationCard from "@/components/admin/GitHubIntegrationCard"
import GitHubWebhookHealth from "@/components/admin/GitHubWebhookHealth"
import SlackBridgeCard from "@/components/admin/SlackBridgeCard"
import OAuthConfigCard from "@/components/admin/OAuthConfigCard"
import { GetEndpointUrl } from "@/services/endPoints"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  reads.current = {}
})

const status = (connected: boolean, linked_repos: unknown[] = []) => ({
  [GetEndpointUrl.GetGitHubStatus]: { data: { status: { connected, linked_repos } } },
})

const word = (text: string | RegExp) => screen.getByText(text).closest("[data-status-word]")?.getAttribute("data-status-word")

describe("GitHub", () => {
  it("is titled without a tile, like the Slack bridge and the sign-in providers beside it", () => {
    reads.current = status(false)
    render(<GitHubIntegrationCard />)
    const heading = screen.getByRole("heading", { level: 2, name: "GitHub" })
    expect(heading.querySelector("[class*='hue-']")).toBeNull()
  })

  it("draws a status line and the list's rows while it loads", () => {
    reads.current = { [GetEndpointUrl.GetGitHubStatus]: { isLoading: true } }
    render(<GitHubIntegrationCard />)
    const loading = screen.getByRole("status", { name: "Loading the GitHub connection" })
    expect(loading.querySelectorAll("[data-connection-skeleton-row]").length).toBe(2)
    expect(loading.querySelector(".divide-y")).toBeTruthy()
  })

  it("says a failed read in the compact form, with the server's reason", () => {
    reads.current = { [GetEndpointUrl.GetGitHubStatus]: { isError: { response: { status: 502, data: { msg: "GitHub didn't answer." } } } } }
    render(<GitHubIntegrationCard />)
    expect(screen.getByText("Couldn't load the GitHub connection status")).toBeTruthy()
    expect(screen.getByText("GitHub didn't answer.")).toBeTruthy()
    expect(document.querySelector("[data-empty-illustration]")).toBeTruthy()
  })

  it("says it is connected with the status word", () => {
    reads.current = status(true)
    render(<GitHubIntegrationCard />)
    expect(word("Connected")).toBe("success")
  })
})

describe("GitHub's automation rules", () => {
  it("draws each rule's picker at the branch field's height: 44px on a phone, 32px from md up", async () => {
    reads.current = status(true, [
      { id: "l1", project_id: "p1", repo_owner: "acme", repo_name: "web", sync_issues: true, sync_prs: true, auto_create_tasks: false, default_task_status: "", created_at: "2026-10-01T00:00:00Z" },
    ])
    render(<GitHubIntegrationCard />)
    fireEvent.click(screen.getByRole("button", { name: "Automation rules for acme/web" }))
    const triggers = (await screen.findAllByRole("combobox")) as HTMLElement[]
    expect(triggers.length).toBeGreaterThan(0)
    for (const t of triggers) {
      expect(t.className).toContain("h-11")
      expect(t.className).toContain("md:h-8")
    }
  })
})

describe("GitHub's webhook deliveries", () => {
  it("is titled without a tile, and says Healthy with the status word", () => {
    reads.current = { [GetEndpointUrl.GetGitHubWebhookHealth]: { data: { health: { completed_24h: 3, failed_24h: 0, processing_24h: 0 } } } }
    render(<GitHubWebhookHealth />)
    const heading = screen.getByRole("heading", { level: 3, name: "Webhook deliveries" })
    expect(heading.querySelector("[class*='hue-']")).toBeNull()
    expect(word("Healthy")).toBe("success")
  })

  it("says failures with the status word", () => {
    reads.current = { [GetEndpointUrl.GetGitHubWebhookHealth]: { data: { health: { completed_24h: 3, failed_24h: 2, processing_24h: 0 } } } }
    render(<GitHubWebhookHealth />)
    expect(word("2 failed in 24 hours")).toBe("danger")
  })

  it("says a failed read in the compact form, with Try again", () => {
    reads.current = { [GetEndpointUrl.GetGitHubWebhookHealth]: { isError: new Error("Network Error") } }
    render(<GitHubWebhookHealth />)
    expect(screen.getByText("Couldn't load the webhook deliveries")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
    expect(document.querySelector("[data-empty-illustration]")).toBeTruthy()
  })
})

describe("the Slack bridge", () => {
  it("draws a status line and the list's rows while it loads", () => {
    slack.getSlackBridge.mockReturnValue(new Promise(() => {}))
    render(<SlackBridgeCard />)
    const loading = screen.getByRole("status", { name: "Loading the Slack bridge" })
    expect(loading.querySelectorAll("[data-connection-skeleton-row]").length).toBe(2)
  })

  it("says it is connected with the status word, and its pickers are touch targets on a phone", async () => {
    slack.getSlackBridge.mockResolvedValue({
      connected: true,
      team_name: "Kestrel",
      events_url: "https://api.example.com/slack/events",
      manifest_url: "https://api.slack.com/apps?new_app=1",
      manifest: "{}",
      links: [],
    })
    render(<SlackBridgeCard />)
    await waitFor(() => expect(document.querySelector("[data-status-word]")?.textContent).toBe("Connected to Kestrel"))
    expect(document.querySelector("[data-status-word]")?.getAttribute("data-status-word")).toBe("success")
    for (const id of ["slack-link-slack", "slack-link-onecamp"]) {
      const trigger = document.getElementById(id) as HTMLElement
      expect(trigger.className).toContain("h-11")
      expect(trigger.className).toContain("md:h-8")
    }
    const link = screen.getByRole("button", { name: "Link" })
    expect(link.className).toContain("h-11")
    expect(link.className).toContain("md:h-8")
  })
})

describe("the sign-in providers", () => {
  it("say Set up and Not set up with the status word", async () => {
    http.get.mockResolvedValue({
      data: {
        data: {
          google_client_id: "abc.apps.googleusercontent.com",
          google_has_client_secret: true,
          google_configured: true,
          google_source: "db",
          github_client_id: "",
          github_has_client_secret: false,
          github_configured: false,
          github_source: "none",
        },
      },
    })
    render(<OAuthConfigCard />)
    await waitFor(() => expect(word(/^Set up/)).toBe("success"))
    expect(word("Not set up")).toBe("neutral")
  })

  it("say a failed read in the compact form, with the server's reason", async () => {
    http.get.mockRejectedValue({ response: { status: 403, data: { msg: "Admins only." } } })
    render(<OAuthConfigCard />)
    expect(await screen.findByText("Admins only.")).toBeTruthy()
    expect(screen.getByText("Couldn't load the sign-in providers")).toBeTruthy()
  })
})

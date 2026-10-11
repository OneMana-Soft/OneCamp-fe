import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"

// Design v3, admin §A18: every integration is a connection card. The r12 e1
// card has a 48px header holding the vendor's neutral mark (never a hue,
// §1.5), its name, a dot and a word, and on the right Connect (the one
// primary) while it isn't connected or ⋯ once it is. Under the header come
// what it links, as rows. Search settings and deep links land on the ids in
// lib/adminSections (integrations-slack, integrations-github,
// integrations-oauth), so each card carries its id.

const { reads, slack, http } = vi.hoisted(() => ({
  reads: { current: {} as Record<string, { data?: unknown }> },
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
import SlackBridgeCard from "@/components/admin/SlackBridgeCard"
import OAuthConfigCard from "@/components/admin/OAuthConfigCard"
import { GetEndpointUrl } from "@/services/endPoints"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  reads.current = {}
  sessionStorage.clear()
})

const github = (connected: boolean, linked_repos: unknown[] = []) => {
  reads.current = {
    [GetEndpointUrl.GetGitHubStatus]: { data: { status: { connected, linked_repos } } },
    [GetEndpointUrl.GetUserProjectList]: { data: { data: { user_projects: [{ project_uuid: "p1", project_name: "Harbourline mobile app" }] } } },
  }
}

const repo = { id: "l1", project_id: "p1", repo_owner: "kestrel-studio", repo_name: "harbourline-app", sync_issues: true, sync_prs: true, auto_create_tasks: false, default_task_status: "", created_at: "2026-10-01T00:00:00Z" }

/** The card's anatomy: an id, a mark in its header, the name, a state. */
function expectConnectionCard(id: string, name: string) {
  const card = document.getElementById(id) as HTMLElement
  expect(card, `#${id}`).toBeTruthy()
  expect(card.hasAttribute("data-connection-card")).toBe(true)
  expect(card.className).toContain("cx-conn")
  const header = card.querySelector("header") as HTMLElement
  expect(header.querySelector(".cx-mark")).toBeTruthy()
  expect(header.querySelector("h2")?.textContent).toBe(name)
  expect(header.querySelector("[data-state-word]")).toBeTruthy()
  // A vendor is a category, not a hue.
  expect(card.innerHTML).not.toMatch(/bg-camp-[a-z]+-tint|\bhue-(sun|moss|lake|sky|dusk|berry)\b/)
  return { card, header }
}

describe("integrations as connection cards", () => {
  it("GitHub, not connected: its mark, name and state, and Connect as the header's primary", () => {
    github(false)
    render(<GitHubIntegrationCard />)
    const { header } = expectConnectionCard("integrations-github", "GitHub")
    expect(header.querySelector("[data-source-mark='github'] svg")).toBeTruthy()
    expect(header.querySelector("[data-state-word]")?.getAttribute("data-state-word")).toBe("neutral")
    const connect = screen.getByRole("button", { name: "Connect GitHub" })
    expect(header.contains(connect)).toBe(true)
    expect(screen.queryByRole("button", { name: "GitHub actions" })).toBeNull()
  })

  it("GitHub, connected: ⋯ in the header, and each linked repository as a row with a link glyph", () => {
    github(true, [repo])
    render(<GitHubIntegrationCard />)
    const { header, card } = expectConnectionCard("integrations-github", "GitHub")
    expect(header.contains(screen.getByRole("button", { name: "GitHub actions" }))).toBe(true)
    expect(screen.queryByRole("button", { name: "Connect GitHub" })).toBeNull()
    const row = card.querySelector("[data-linked-row]") as HTMLElement
    expect(row.querySelector(".cx-linked-glyph")).toBeTruthy()
    expect(row.textContent).toContain("kestrel-studio/harbourline-app")
    expect(row.textContent).toContain("→")
    expect(row.textContent).toContain("Harbourline mobile app")
  })

  // Back from GitHub's sign-in, the dot morphs off → on once: the card marks
  // the round trip as it leaves, and the first connected answer plays it.
  it("GitHub, back from its sign-in: the dot morphs once, then rests", async () => {
    sessionStorage.setItem("onecamp:connecting:github", "1")
    github(true)
    render(<GitHubIntegrationCard />)
    await waitFor(() => expect(document.querySelector(".cx-int-morph")).toBeTruthy())
    expect(sessionStorage.getItem("onecamp:connecting:github")).toBeNull()
    await act(() => new Promise((r) => setTimeout(r, 1000)))
    expect(document.querySelector(".cx-int-morph")).toBeNull()
    expect(document.querySelector("[data-state-word]")?.getAttribute("data-state-word")).toBe("success")
  })

  it("the Slack bridge, connected: two marks whose dot travels while a channel is linked, and ⋯", async () => {
    slack.getSlackBridge.mockResolvedValue({
      connected: true,
      team_name: "Kestrel",
      events_url: "https://api.example.com/slack/events",
      manifest_url: "https://api.slack.com/apps?new_app=1",
      manifest: "{}",
      links: [{ id: "k1", slack_channel_id: "C1", slack_channel_name: "general", channel_id: "c1", channel_name: "general" }],
    })
    render(<SlackBridgeCard />)
    await screen.findByText("Connected to Kestrel")
    const { header } = expectConnectionCard("integrations-slack", "Slack bridge")
    const marks = header.querySelector("[data-bridge-marks]") as HTMLElement
    expect(marks.querySelectorAll(".cx-mark")).toHaveLength(2)
    expect(marks.getAttribute("data-syncing")).toBe("true")
    expect(header.contains(screen.getByRole("button", { name: "Slack bridge actions" }))).toBe(true)
  })

  it("the Slack bridge, idle: the dot rests", async () => {
    slack.getSlackBridge.mockResolvedValue({ connected: true, team_name: "Kestrel", events_url: "", manifest_url: "", manifest: "{}", links: [] })
    render(<SlackBridgeCard />)
    await screen.findByText("Connected to Kestrel")
    expect(document.querySelector("[data-bridge-marks]")?.hasAttribute("data-syncing")).toBe(false)
  })

  it("the sign-in providers: a section with its id, each provider a connection card", async () => {
    http.get.mockResolvedValue({
      data: { data: { google_client_id: "abc", google_has_client_secret: true, google_configured: true, google_source: "db", github_client_id: "", github_has_client_secret: false, github_configured: false, github_source: "none" } },
    })
    render(<OAuthConfigCard />)
    await screen.findByText("Set up")
    const section = document.getElementById("integrations-oauth") as HTMLElement
    expect(section).toBeTruthy()
    const cards = section.querySelectorAll("[data-connection-card]")
    expect(cards).toHaveLength(2)
    for (const c of Array.from(cards)) {
      expect(c.querySelector("header .cx-mark")).toBeTruthy()
      expect(c.querySelector("header [data-state-word]")).toBeTruthy()
    }
  })
})

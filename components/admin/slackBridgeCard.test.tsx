import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const { toast, confirm } = vi.hoisted(() => ({ toast: vi.fn(), confirm: vi.fn() }))

vi.mock("@/services/slackBridgeService", async (orig) => ({
  ...(await orig<typeof import("@/services/slackBridgeService")>()),
  getSlackBridge: vi.fn(),
  connectSlackBridge: vi.fn(),
  disconnectSlackBridge: vi.fn(),
  listSlackChannels: vi.fn().mockResolvedValue([]),
  linkSlackChannel: vi.fn(),
  unlinkSlackChannel: vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: { channels_list: [{ ch_uuid: "c2", ch_name: "design" }] }, isLoading: false, isError: false, mutate: vi.fn() }),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))

import SlackBridgeCard from "@/components/admin/SlackBridgeCard"
import {
  disconnectSlackBridge,
  getSlackBridge,
  unlinkSlackChannel,
  type SlackBridgeStatus,
} from "@/services/slackBridgeService"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const notConnected: SlackBridgeStatus = {
  connected: false,
  events_url: "https://api.example.com/slack/events",
  manifest_url: "https://api.slack.com/apps?new_app=1",
  manifest: "{}",
  links: [],
}

const connected: SlackBridgeStatus = {
  ...notConnected,
  connected: true,
  team_name: "Acme",
  links: [
    {
      id: "l1",
      slack_channel_id: "S1",
      slack_channel_name: "general",
      channel_uuid: "c1",
      channel_name: "general",
      created_at: "2026-10-01T00:00:00Z",
    },
  ],
}

describe("the Slack bridge", () => {
  it("says the bridge couldn't be loaded, with Try again", async () => {
    vi.mocked(getSlackBridge).mockRejectedValueOnce(new Error("Network Error"))
    render(<SlackBridgeCard />)
    expect(await screen.findByText(/Couldn't load the Slack bridge/)).toBeTruthy()
    vi.mocked(getSlackBridge).mockResolvedValueOnce(notConnected)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("button", { name: "Connect Slack" })).toBeTruthy()
  })

  // Two filled buttons in the setup, beside the GitHub card's: the accent
  // stays with the step that connects.
  it("shows the plug while Slack isn't connected, and fills only Connect Slack", async () => {
    vi.mocked(getSlackBridge).mockResolvedValue(notConnected)
    const { container } = render(<SlackBridgeCard />)
    const connect = await screen.findByRole("button", { name: "Connect Slack" })
    expect(container.querySelector("[data-empty-illustration]")).not.toBeNull()
    expect(connect.className).toMatch(/\bbg-primary\b/)
    expect(screen.getByRole("link", { name: /Create the app in Slack/ }).className).not.toMatch(/\bbg-primary\b/)
    expect(screen.getByRole("button", { name: /Copy the manifest/ }).className).not.toMatch(/\bbg-primary\b/)
  })

  it("names the two keys in words, and says where Slack keeps them", async () => {
    vi.mocked(getSlackBridge).mockResolvedValue(notConnected)
    render(<SlackBridgeCard />)
    const token = await screen.findByLabelText("Bot token")
    expect(token.getAttribute("autocomplete")).toBe("new-password")
    expect(screen.getByLabelText("Signing secret")).toBeTruthy()
    expect(screen.getByText(/Bot User OAuth Token/)).toBeTruthy()
  })

  // One click on the icon used to stop a channel bridging, with no question.
  it("asks before unlinking a channel, and unlinks only once confirmed", async () => {
    vi.mocked(getSlackBridge).mockResolvedValue(connected)
    vi.mocked(unlinkSlackChannel).mockResolvedValue(undefined)
    render(<SlackBridgeCard />)
    fireEvent.click(await screen.findByRole("button", { name: "Unlink #general" }))
    expect(confirm).toHaveBeenCalledTimes(1)
    const opts = confirm.mock.calls[0][0]
    expect(opts.destructive).toBe(true)
    expect(opts.title).toMatch(/#general/)
    expect(opts.description).toMatch(/Past messages stay/)
    expect(unlinkSlackChannel).not.toHaveBeenCalled()
    opts.onConfirm()
    await waitFor(() => expect(unlinkSlackChannel).toHaveBeenCalledWith("l1"))
  })

  it("asks before disconnecting, and names what stops", async () => {
    vi.mocked(getSlackBridge).mockResolvedValue(connected)
    vi.mocked(disconnectSlackBridge).mockResolvedValue(undefined)
    render(<SlackBridgeCard />)
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }))
    const opts = confirm.mock.calls[0][0]
    expect(opts.destructive).toBe(true)
    expect(opts.description).toMatch(/linked channel/)
    expect(disconnectSlackBridge).not.toHaveBeenCalled()
    opts.onConfirm()
    await waitFor(() => expect(disconnectSlackBridge).toHaveBeenCalled())
  })

  it("labels both channel pickers in words", async () => {
    vi.mocked(getSlackBridge).mockResolvedValue(connected)
    render(<SlackBridgeCard />)
    expect(await screen.findByLabelText("Slack channel")).toBeTruthy()
    expect(screen.getByLabelText("OneCamp channel")).toBeTruthy()
    // Visible words, not only a name a screen reader hears.
    expect(screen.getByText("Slack channel", { selector: "label" })).toBeTruthy()
    expect(screen.getByText("OneCamp channel", { selector: "label" })).toBeTruthy()
  })
})

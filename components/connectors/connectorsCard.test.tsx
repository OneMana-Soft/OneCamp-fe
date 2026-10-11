import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"

// The connectors a person can link to OneCamp. A list that couldn't load says
// so, with Try again: it used to say "No connectors are available yet", a
// claim about the server, with no retry. While it loads, cards hold the list's
// shape (it was a spinner).
//
// Design v3 (admin §S3): each connector is a connection card, as on the
// Integrations tab: a neutral mark (a provider is never a hue, §1.5), its
// name, a dot and a word, Connect as the one primary while it isn't connected
// and ⋯ once it is, with Disconnect behind a confirm. A connected card shows
// the account it reads from; one the provider stopped accepting shows a sun
// row with Reconnect.

const { list, connect, disconnect, toast, confirm } = vi.hoisted(() => ({
  list: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  toast: vi.fn(),
  confirm: vi.fn(),
}))
vi.mock("@/services/connectorService", () => ({ listConnectors: list, startConnect: connect, disconnectConnector: disconnect }))
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))

import ConnectorsCard, { connectedOn } from "./ConnectorsCard"

const gmail = {
  id: "gmail",
  name: "Gmail",
  description: "Read and draft email.",
  icon_key: "gmail",
  connected: false,
  permissions: [{ capability: "read" as const, description: "Read your inbox" }],
}
const calendar = { ...gmail, id: "calendar", name: "Google Calendar", icon_key: "calendar", connected: true }

const renderCard = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <ConnectorsCard />
    </SWRConfig>,
  )

beforeEach(() => {
  list.mockReset()
  connect.mockReset()
  disconnect.mockReset()
  toast.mockReset()
  confirm.mockReset()
})
afterEach(cleanup)

describe("the connectors list", () => {
  it("says it couldn't load, rather than that there are none, and tries again", async () => {
    list.mockRejectedValueOnce(new Error("Network Error")).mockResolvedValueOnce([gmail])
    renderCard()
    expect(await screen.findByText("Couldn't load your connectors")).toBeInTheDocument()
    expect(screen.queryByText(/No connectors/)).toBeNull()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /try again/i })))
    expect(await screen.findByText("Gmail")).toBeInTheDocument()
  })

  it("holds the list's shape while it loads", () => {
    list.mockReturnValue(new Promise(() => {}))
    renderCard()
    const status = screen.getByRole("status", { name: "Loading your connectors" })
    expect(status.querySelectorAll(".cx-conn").length).toBe(3)
    expect(screen.queryByText(/Loading connectors/)).toBeNull()
  })

  it("draws each connector as a connection card: a neutral mark, its name, a state, and Connect as the primary", async () => {
    list.mockResolvedValue([gmail, calendar])
    renderCard()
    const card = (await screen.findByRole("heading", { level: 2, name: "Gmail" })).closest("[data-connection-card]") as HTMLElement
    expect(card).toBeTruthy()
    const mark = card.querySelector("[data-source-mark]") as HTMLElement
    expect(mark).toBeTruthy()
    // A provider is a category, never a hue.
    expect(card.innerHTML).not.toMatch(/\bhue-(sun|moss|lake|sky|dusk|berry)\b|bg-camp-/)
    expect(card.querySelector("[data-state-word]")?.textContent).toBe("Not connected")
    expect(screen.getByRole("button", { name: "Connect Gmail" }).className).toMatch(/\bbg-brand\b/)
    const cal = screen.getByRole("heading", { level: 2, name: "Google Calendar" }).closest("[data-connection-card]") as HTMLElement
    expect(cal.querySelector("[data-state-word]")?.getAttribute("data-state-word")).toBe("success")
    expect(screen.queryByRole("button", { name: "Connect Google Calendar" })).toBeNull()
  })

  it("keeps Disconnect behind ⋯ and a confirm, and disconnects only once confirmed", async () => {
    list.mockResolvedValue([calendar])
    disconnect.mockResolvedValue(undefined)
    renderCard()
    const more = await screen.findByRole("button", { name: "Google Calendar actions" })
    fireEvent.keyDown(more, { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Disconnect Google Calendar" }))
    expect(confirm).toHaveBeenCalledTimes(1)
    const opts = confirm.mock.calls[0][0]
    expect(opts.destructive).toBe(true)
    expect(opts.title).toBe("Disconnect your Google Calendar account?")
    expect(disconnect).not.toHaveBeenCalled()
    await act(async () => opts.onConfirm())
    await waitFor(() => expect(disconnect).toHaveBeenCalledWith("calendar"))
  })

  it("shows the account a connected card reads from, and a failing one's Reconnect row", async () => {
    list.mockResolvedValue([{ ...calendar, account: "sam@kestrel.example", connected_at: "2026-10-03T09:00:00Z", failing: true }])
    renderCard()
    const chip = await screen.findByText("sam@kestrel.example")
    const account = chip.closest("[data-account-chip]") as HTMLElement
    expect(account.querySelector("[data-source-mark][data-size='20']")).toBeTruthy()
    expect(account.textContent).toContain("Connected 3 Oct")
    const banner = document.querySelector("[data-connection-banner]") as HTMLElement
    expect(banner.textContent).toMatch(/stopped accepting our access/)
    expect(screen.getByRole("button", { name: "Reconnect Google Calendar" })).toBeTruthy()
  })

  it("dates a connection as 'Connected 3 Oct', and says nothing for a zero time", () => {
    expect(connectedOn("2026-10-03T09:00:00Z")).toBe("Connected 3 Oct")
    expect(connectedOn("0001-01-01T00:00:00Z")).toBeNull()
    expect(connectedOn(undefined)).toBeNull()
  })

  it("says why connecting didn't start, in the server's words", async () => {
    list.mockResolvedValue([gmail])
    connect.mockRejectedValue({ response: { status: 400, data: { msg: "Google sign-in isn't set up on this server." } } })
    renderCard()
    const button = await screen.findByRole("button", { name: "Connect Gmail" })
    await act(async () => void fireEvent.click(button))
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Couldn't connect Gmail", description: "Google sign-in isn't set up on this server.", variant: "destructive" }),
    )
  })

  // The playful layer's plug spot, in the section's hue, for nothing to connect.
  it("says what an empty server needs, under the plug in the section's hue", async () => {
    list.mockResolvedValue([])
    renderCard()
    expect(await screen.findByText("No connectors are set up on this server")).toBeInTheDocument()
    expect(document.querySelector("[data-empty-illustration] svg")).not.toBeNull()
    expect(document.querySelector("[data-empty-illustration] [class*='hue-lake']")).not.toBeNull()
    expect(screen.getByText(/Admin, Integrations/)).toBeInTheDocument()
  })
})

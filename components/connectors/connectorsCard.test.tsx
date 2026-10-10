import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { SWRConfig } from "swr"

// The connectors a person can link to OneCamp. A list that couldn't load says
// so, with Try again: it used to say "No connectors are available yet", a
// claim about the server, with no retry. While it loads, rows hold the list's
// shape (it was a spinner). Each connector is a row with its mark on a tile in
// its own hue; Connect is an outlined button, so the page has no filled button
// on every row.

const { list, connect, disconnect, toast } = vi.hoisted(() => ({ list: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), toast: vi.fn() }))
vi.mock("@/services/connectorService", () => ({ listConnectors: list, startConnect: connect, disconnectConnector: disconnect }))
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))

import ConnectorsCard from "./ConnectorsCard"

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
    expect(screen.getByRole("status", { name: "Loading your connectors" })).toBeInTheDocument()
    expect(screen.queryByText(/Loading connectors/)).toBeNull()
  })

  it("puts each connector's mark on a tile in its own hue, and outlines Connect", async () => {
    list.mockResolvedValue([gmail, calendar])
    renderCard()
    const row = (await screen.findByText("Gmail")).closest("[data-connector]")!
    expect(row.querySelector("[class*='hue-']")?.className).toMatch(/\bhue-(sun|moss|lake|sky|dusk|berry)\b/)
    const connectButton = screen.getByRole("button", { name: "Connect Gmail" })
    expect(connectButton.className).not.toMatch(/\bbg-primary\b/)
    expect(screen.getByText("Connected")).toBeInTheDocument()
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

  it("says what an empty server needs, on a tile in the section's hue", async () => {
    list.mockResolvedValue([])
    renderCard()
    expect(await screen.findByText("No connectors are set up on this server")).toBeInTheDocument()
    expect(document.querySelector("[class*='hue-lake']")).not.toBeNull()
    expect(screen.getByText(/Admin, Integrations/)).toBeInTheDocument()
  })
})

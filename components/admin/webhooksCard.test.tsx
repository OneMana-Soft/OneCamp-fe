import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const fetchState = vi.hoisted(() => ({ value: { data: undefined as unknown, isLoading: false, isError: undefined as unknown, mutate: vi.fn() } }))
const confirmCalls = vi.hoisted(() => [] as Array<{ title: string; description: string; confirmText?: string; destructive?: boolean; onConfirm: () => void }>)

vi.mock("@/hooks/useFetch", () => ({ useFetch: () => fetchState.value }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => (opts: (typeof confirmCalls)[number]) => confirmCalls.push(opts) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: { post: vi.fn().mockResolvedValue({ data: {} }), get: vi.fn() } }))

import WebhooksCard from "@/components/admin/WebhooksCard"
import axiosInstance from "@/lib/axiosInstance"

const incoming = {
  id: "w1",
  name: "Deploy notices",
  type: "incoming" as const,
  token: "tok123",
  is_active: true,
  created_by: "u1",
  bot_name: "Deploy bot",
  failure_count: 0,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
}
const outgoing = { ...incoming, id: "w2", name: "CRM sync", type: "outgoing" as const, secret: "sec456", target_url: "https://crm.example.com/hook" }

const originalBase = process.env.NEXT_PUBLIC_BACKEND_URL

beforeEach(() => {
  confirmCalls.length = 0
  fetchState.value = { data: { webhooks: [incoming, outgoing] }, isLoading: false, isError: undefined, mutate: vi.fn() }
  process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.example.com/"
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_BACKEND_URL = originalBase
})

describe("webhooks", () => {
  // The deployed base ends in "/", and the card added its own, so the URL an
  // admin copied into another service read ".../​/webhook/incoming/…", which
  // the API's router does not match.
  it("shows the incoming URL with one slash after the API's address", () => {
    render(<WebhooksCard />)
    fireEvent.click(screen.getAllByRole("button", { name: "Show token" })[0])
    expect(screen.getByText("https://api.example.com/webhook/incoming/tok123")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\.com\/\/webhook/)
  })

  // One click on a small icon used to replace the token every integration
  // posts with, at once and for good.
  it("asks before regenerating a token, and regenerates only on confirm", async () => {
    render(<WebhooksCard />)
    fireEvent.click(screen.getAllByRole("button", { name: "Regenerate the token" })[0])
    expect(axiosInstance.post).not.toHaveBeenCalled()
    expect(confirmCalls).toHaveLength(1)
    expect(confirmCalls[0].destructive).toBe(true)
    expect(confirmCalls[0].title).toMatch(/Deploy notices/)
    expect(confirmCalls[0].description).toMatch(/stops working/)
    confirmCalls[0].onConfirm()
    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledWith(expect.stringMatching(/\/w1\/regenerate-token$/)))
  })

  it("asks before regenerating a signing secret", async () => {
    render(<WebhooksCard />)
    fireEvent.click(screen.getByRole("button", { name: "Regenerate the signing secret" }))
    expect(axiosInstance.post).not.toHaveBeenCalled()
    expect(confirmCalls[0].title).toMatch(/CRM sync/)
    confirmCalls[0].onConfirm()
    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledWith(expect.stringMatching(/\/w2\/regenerate-secret$/)))
  })

  // A failed read of the delivery log said "No logs yet", which is a claim
  // about the webhook, not about the request.
  it("says when the deliveries could not be loaded, with a way to try again", async () => {
    vi.mocked(axiosInstance.get).mockRejectedValueOnce(new Error("Network Error"))
    render(<WebhooksCard />)
    fireEvent.click(screen.getAllByRole("button", { name: "Show recent deliveries" })[0])
    expect(await screen.findByText(/Couldn.t load the deliveries/)).toBeTruthy()
    expect(screen.queryByText(/No deliveries yet/)).toBeNull()
    vi.mocked(axiosInstance.get).mockResolvedValueOnce({ data: { logs: [] } })
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText(/No deliveries yet/)).toBeTruthy()
  })

  // A badge filled in the accent read as a button; a state is a dot and a word.
  it("marks an active webhook with a dot and a word, not an accent badge", () => {
    render(<WebhooksCard />)
    const active = screen.getAllByText("Active")[0]
    expect(active.className).not.toMatch(/bg-primary|bg-sidebar-accent/)
  })

  // The playful layer: an empty state's icon sits on its admin group's tile
  // (Connections, lake), never in the accent.
  it("puts the empty state's icon on the Connections group's lake tile", () => {
    fetchState.value = { data: { webhooks: [] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<WebhooksCard />)
    expect(screen.getByText("No webhooks yet")).toBeTruthy()
    expect(document.querySelector(".hue-lake")).toBeTruthy()
    // The playful layer's spot: a plug, for a place where things connect.
    expect(document.querySelector("[data-empty-illustration]")).toBeTruthy()
  })

  it("opens the target in a link, not a button inside a link", () => {
    render(<WebhooksCard />)
    const link = screen.getByRole("link", { name: "Open the target in a new tab" })
    expect(link.querySelector("button")).toBeNull()
    expect(link.getAttribute("href")).toBe("https://crm.example.com/hook")
  })
})

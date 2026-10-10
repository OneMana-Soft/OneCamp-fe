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

  // One frame for every admin tab: a section whose title is the tab's h2 and
  // whose one action sits on the title's row, at one height on every tab. It
  // was a CardTitle div, and "New webhook" was 36px where Members' is 32px.
  it("is a section titled by an h2, with New webhook in the header's action slot", () => {
    render(<WebhooksCard />)
    const heading = screen.getByRole("heading", { level: 2, name: /^Webhooks/ })
    const section = heading.closest("section") as HTMLElement
    const action = section.querySelector("[data-section-action]") as HTMLElement
    const button = screen.getByRole("button", { name: "New webhook" })
    expect(action.contains(button)).toBe(true)
    expect(button.className).toContain("md:h-8")
    expect(button.className).toContain("h-11")
    expect(button.className).not.toMatch(/(^|\s)h-9(\s|$)/)
  })

  // A generic block of 40px skeleton lines was replaced by bordered rows of
  // 160px, so the list jumped when it loaded.
  it("draws its loading state as the list's own rows, in the list's frame", () => {
    fetchState.value = { data: undefined, isLoading: true, isError: undefined, mutate: vi.fn() }
    render(<WebhooksCard />)
    const status = screen.getByRole("status", { name: "Loading webhooks" })
    expect(status.tagName).toBe("UL")
    expect(status.className).toContain("divide-y")
    expect(status.className).toContain("rounded-lg")
    const rows = status.querySelectorAll("[data-webhook-skeleton-row]")
    expect(rows.length).toBe(3)
    // The same two blocks a loaded row has: its header at px-4 py-3, then its
    // credentials under it.
    const [head, creds] = Array.from(rows[0].children) as HTMLElement[]
    expect(head.className).toContain("px-4")
    expect(head.className).toContain("py-3")
    expect(creds.querySelectorAll("[data-credential-actions]").length).toBe(2)
    expect(screen.getByRole("heading", { level: 2, name: /^Webhooks/ })).toBeTruthy()
  })

  it("says a failed read in the compact form under its title, with the server's reason", () => {
    const mutate = vi.fn()
    fetchState.value = { data: undefined, isLoading: false, isError: { response: { status: 403, data: { msg: "Admins only." } } }, mutate }
    render(<WebhooksCard />)
    expect(screen.getByRole("heading", { level: 2, name: /^Webhooks/ })).toBeTruthy()
    expect(screen.getByText("Couldn't load the webhooks")).toBeTruthy()
    expect(screen.getByText("Admins only.")).toBeTruthy()
    expect(document.querySelector("[data-empty-illustration]")?.parentElement?.className).toContain("py-6")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(mutate).toHaveBeenCalled()
  })

  // Empty states in admin are one size: the muted one. The plug spot is drawn
  // at 64px for a first run; it was the accent tone's 96px here and in Apps.
  it("draws a first run's spot at the muted size", () => {
    fetchState.value = { data: { webhooks: [] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<WebhooksCard />)
    const spot = document.querySelector("[data-empty-illustration]") as HTMLElement
    expect(spot.className).toContain("[&>svg]:size-16")
    expect(spot.className).not.toContain("size-24")
  })

  it("says a webhook's state with the app's status word", () => {
    render(<WebhooksCard />)
    const active = screen.getAllByText("Active")[0]
    expect(active.closest("[data-status-word]")?.getAttribute("data-status-word")).toBe("success")
  })

  // Each credential row's tinted value ended where its own buttons began: one
  // button on the URL, three on the token, so the boxes ended at different x.
  // Every row keeps three button slots, so the values end on one line and the
  // copy buttons sit in one column.
  it("gives every credential row the same three button slots", () => {
    render(<WebhooksCard />)
    const groups = Array.from(document.querySelectorAll("[data-credential-actions]")) as HTMLElement[]
    // Incoming: URL and token. Outgoing: token, signing secret, target.
    expect(groups).toHaveLength(5)
    for (const g of groups) {
      expect(g.children).toHaveLength(3)
      expect(g.className).toContain("w-24")
      expect(g.className).toContain("shrink-0")
    }
    // The copy buttons share the middle slot.
    const [url, token] = groups
    expect(url.children[1].getAttribute("aria-label")).toBe("Copy webhook URL")
    expect(token.children[1].getAttribute("aria-label")).toBe("Copy token")
  })
})

// The delivery sheet's three tabs open on one row: Request and Response had a
// label and Copy row that Overview lacked, so Overview's first line sat 40px
// higher and switching tabs moved the content.
describe("a delivery", () => {
  it("opens every tab with the same 32px row under the tabs", async () => {
    vi.mocked(axiosInstance.get).mockResolvedValueOnce({
      data: { logs: [{ id: "d1", webhook_id: "w2", event_type: "task.created", success: true, response_status: 200, duration_ms: 84, request_body: "{\"a\":1}", response_body: "ok", created_at: "2026-10-09T10:00:00Z" }] },
    })
    render(<WebhooksCard />)
    fireEvent.click(screen.getAllByRole("button", { name: "Show recent deliveries" })[1])
    fireEvent.click(await screen.findByRole("button", { name: /task\.created/ }))
    const firstRow = () => {
      const panel = document.querySelector('[role="tabpanel"][data-state="active"]') as HTMLElement
      return panel.firstElementChild as HTMLElement
    }
    expect(firstRow().hasAttribute("data-delivery-toolbar")).toBe(true)
    expect(firstRow().className).toContain("h-8")
    for (const name of ["Request", "Response"]) {
      fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 })
      await waitFor(() => expect(screen.getByRole("tab", { name }).getAttribute("aria-selected")).toBe("true"))
      expect(firstRow().hasAttribute("data-delivery-toolbar")).toBe(true)
      expect(firstRow().className).toContain("h-8")
    }
  })
})

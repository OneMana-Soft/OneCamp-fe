import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

/**
 * Design v3, admin §A20: a webhook is one 56px row. Its address is elided in
 * the middle (the host and the end of the path are what tell two apart), it
 * shows at most three event chips and a count of the rest (so the row stays
 * one line), and a webhook that delivered this week asks for its name before
 * it is deleted (GitHub's type-to-confirm, §8.4).
 */

const fetchState = vi.hoisted(() => ({ value: { data: undefined as unknown, isLoading: false, isError: undefined as unknown, mutate: vi.fn() } }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => fetchState.value }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: { post: vi.fn(), get: vi.fn(), put: vi.fn() } }))

import WebhooksCard from "@/components/admin/WebhooksCard"
import WebhookDeleteDialog from "@/components/admin/WebhookDeleteDialog"
import { deliveryState, eventChips, groupEvents, shortUrl } from "@/components/admin/webhookParts"

const LONG = "https://hooks.integrations.example-company.com/services/T000/B000/very-long-secret-path/deploys"
const hook = {
  id: "w1",
  name: "CRM sync",
  type: "outgoing" as const,
  token: "tok",
  target_url: LONG,
  events: JSON.stringify(["task.created", "task.deleted", "post.created", "post.updated", "chat.created"]),
  is_active: true,
  created_by: "u1",
  bot_name: "Bot",
  failure_count: 0,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
}

afterEach(() => cleanup())

describe("a webhook row", () => {
  it("elides the address in the middle, keeping the host and the end of the path", () => {
    const short = shortUrl(LONG)
    expect(short).toContain("…")
    expect(short.startsWith("hooks.integrations")).toBe(true)
    expect(short.endsWith("/deploys")).toBe(true)
    expect(short.length).toBeLessThan(LONG.length)

    fetchState.value = { data: { webhooks: [hook] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<WebhooksCard />)
    const url = document.querySelector("[data-webhook-url]") as HTMLElement
    expect(url.textContent).toBe(short)
    expect(url.className).toContain("font-mono")
  })

  it("shows at most three event chips and a count of the rest", () => {
    expect(eventChips(["a", "b", "c", "d", "e"])).toEqual({ shown: ["a", "b", "c"], more: 2 })
    expect(eventChips(["a"])).toEqual({ shown: ["a"], more: 0 })

    fetchState.value = { data: { webhooks: [hook] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<WebhooksCard />)
    const events = document.querySelector("[data-webhook-events]") as HTMLElement
    expect(events.querySelectorAll("[data-neutral-chip]")).toHaveLength(3)
    expect(events.querySelector("[data-webhook-more]")?.textContent).toBe("+2")
    // Neutral chips: an event is a category, never a hue (§1.5).
    expect(events.innerHTML).not.toMatch(/camp-|hue-/)
  })

  it("says every event when none are chosen", () => {
    fetchState.value = { data: { webhooks: [{ ...hook, events: "[]" }] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<WebhooksCard />)
    expect(screen.getByText("Every event")).toBeTruthy()
  })

  it("says how the last delivery went", () => {
    const now = Date.parse("2026-10-11T12:00:00Z")
    expect(deliveryState({ ...hook, last_triggered_at: "2026-10-11T11:58:00Z" }, now)).toEqual({ tone: "success", word: "Delivered · 2m ago" })
    expect(deliveryState({ ...hook, failure_count: 4 }, now).tone).toBe("danger")
    expect(deliveryState({ ...hook, is_active: false }, now)).toEqual({ tone: "neutral", word: "Off" })
  })

  it("groups the event picker by resource", () => {
    expect(groupEvents(["task.created", "post.created", "task.deleted"])).toEqual([
      { resource: "task", events: ["task.created", "task.deleted"] },
      { resource: "post", events: ["post.created"] },
    ])
  })
})

describe("deleting a webhook", () => {
  it("asks for its name when it delivered in the last seven days", () => {
    const onConfirm = vi.fn()
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString()
    render(<WebhookDeleteDialog open onOpenChange={() => {}} onConfirm={onConfirm} webhook={{ id: "w1", name: "CRM sync", type: "outgoing", last_triggered_at: recent }} />)
    const button = screen.getByRole("button", { name: "Delete webhook" }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    const input = screen.getByLabelText(/Type CRM sync to delete it/)
    fireEvent.change(input, { target: { value: "CRM syn" } })
    expect(button.disabled).toBe(true)
    fireEvent.change(input, { target: { value: "CRM sync" } })
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it("asks only the question when it hasn't delivered this week", () => {
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString()
    render(<WebhookDeleteDialog open onOpenChange={() => {}} onConfirm={() => {}} webhook={{ id: "w1", name: "CRM sync", type: "outgoing", last_triggered_at: old }} />)
    expect(document.querySelector("[data-require-text]")).toBeNull()
    expect((screen.getByRole("button", { name: "Delete webhook" }) as HTMLButtonElement).disabled).toBe(false)
  })
})

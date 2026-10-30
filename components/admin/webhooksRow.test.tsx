import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

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
const dispatch = vi.hoisted(() => vi.fn())
vi.mock("react-redux", () => ({ useDispatch: () => dispatch }))
const post = vi.hoisted(() => vi.fn())
const put = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post, get: vi.fn(), put } }))

import WebhooksCard from "@/components/admin/WebhooksCard"
import WebhookDeleteDialog from "@/components/admin/WebhookDeleteDialog"
import { deliveryState, eventChips, groupEvents, pausedWhy, sendsNothingWhy, shortUrl, TICK_AN_EVENT } from "@/components/admin/webhookParts"

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

  // An outgoing webhook is sent only the kinds of event it names. One with none
  // said "Every event" here and was sent nothing (V-112); the server refuses
  // new ones now, and one kept from before says so, with Edit beside it.
  it("says an outgoing webhook with no kinds sends nothing, and offers Edit", async () => {
    expect(sendsNothingWhy({ type: "outgoing", events: "[]" })).toBe("Sends nothing: no kinds ticked.")
    expect(sendsNothingWhy({ type: "outgoing" })).toBe("Sends nothing: no kinds ticked.")
    expect(sendsNothingWhy({ type: "outgoing", events: '["post.created"]' })).toBeNull()
    expect(sendsNothingWhy({ type: "incoming" })).toBeNull()

    for (const events of ["[]", undefined]) {
      dispatch.mockClear()
      fetchState.value = { data: { webhooks: [{ ...hook, events }] }, isLoading: false, isError: undefined, mutate: vi.fn() }
      render(<WebhooksCard />)
      expect(screen.queryByText("Every event")).toBeNull()
      expect(document.querySelector('[data-webhook-notice="nokinds"]')?.textContent).toContain("Sends nothing: no kinds ticked.")
      // Its switch waits for a kind too, on or off it is sent nothing, and says why in Create's words: focusable, and a press sends nothing.
      const toggle = screen.getByRole("switch", { name: "CRM sync is on" })
      expect(toggle.hasAttribute("disabled")).toBe(false)
      expect(toggle.getAttribute("aria-disabled")).toBe("true")
      expect(toggle.getAttribute("data-disabled-reason")).toBe(TICK_AN_EVENT)
      put.mockClear()
      fireEvent.click(toggle)
      expect(toggle.getAttribute("aria-checked")).toBe("true")
      expect(put).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole("button", { name: "Edit CRM sync" }))
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ key: "webhookEdit" }) }))
      cleanup()
    }

    // An incoming webhook is sent nothing by design: no notice.
    fetchState.value = { data: { webhooks: [{ ...hook, type: "incoming" as const, events: undefined }] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<WebhooksCard />)
    expect(document.querySelector("[data-webhook-notice]")).toBeNull()
    cleanup()

    // One that names kinds keeps its switch: a press saves it off.
    fetchState.value = { data: { webhooks: [hook] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<WebhooksCard />)
    const own = screen.getByRole("switch", { name: "CRM sync is on" })
    expect(own.getAttribute("aria-disabled")).toBeNull()
    fireEvent.click(own)
    await waitFor(() => expect(put).toHaveBeenCalledWith(expect.stringContaining("/w1"), expect.objectContaining({ is_active: false })))
  })

  // Edit opened the dialog without the webhook's scope, so it showed the whole
  // workspace, and Save sent that: one set up for a channel was widened to
  // every channel its owner can read (V-113).
  it("opens Edit with the webhook's own scope", () => {
    dispatch.mockClear()
    fetchState.value = { data: { webhooks: [{ ...hook, scope_type: "channel", scope_entity_id: "c1" }] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<WebhooksCard />)
    fireEvent.keyDown(screen.getByRole("button", { name: "More for CRM sync" }), { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ key: "webhookEdit", data: expect.objectContaining({ scope_type: "channel", scope_entity_id: "c1" }) }),
    }))
  })

  it("says how the last delivery went", () => {
    const now = Date.parse("2026-10-11T12:00:00Z")
    expect(deliveryState({ ...hook, last_triggered_at: "2026-10-11T11:58:00Z" }, now)).toEqual({ tone: "success", word: "Delivered · 2m ago" })
    expect(deliveryState({ ...hook, failure_count: 4 }, now).tone).toBe("danger")
    expect(deliveryState({ ...hook, is_active: false }, now)).toEqual({ tone: "neutral", word: "Off" })
  })

  // Audit A9: a webhook pauses itself when its owner leaves, can no longer
  // read what it's set up for, or keeps failing, and nothing on the list said
  // so. It says why now, and offers Resume.
  describe("when paused", () => {
    // Today is TEST_TODAY, and the pause an hour before it.
    pinTestClock()
    const anHourAgo = () => new Date(Date.now() - 3_600_000).toISOString()

    it("says a paused webhook is paused, and why, whatever else it says", () => {
      const paused = { ...hook, failure_count: 4, paused_at: anHourAgo(), paused_reason: "owner_cant_read" }
      expect(deliveryState(paused, Date.now())).toEqual({ tone: "warning", word: "Paused" })
      expect(pausedWhy({ ...paused, paused_reason: "owner_cant_read", scope_type: "channel" })).toBe("Paused: its owner can't read the channel it's set up for.")
      expect(pausedWhy({ ...paused, paused_reason: "owner_cant_read", scope_type: "project" })).toBe("Paused: its owner can't read the project it's set up for.")
      expect(pausedWhy({ ...paused, paused_reason: "owner_left" })).toBe("Paused: its owner is no longer a member.")
      expect(pausedWhy({ ...paused, paused_reason: "failing" })).toBe("Paused after failing 50 times in a row.")
      expect(pausedWhy({ ...paused, paused_reason: "admin" })).toBe("Paused by an admin.")
      expect(pausedWhy({ ...hook, scope_type: "channel" })).toBeNull()
    })

    it("offers Resume on a paused webhook, and says what the server answered", async () => {
      const mutate = vi.fn()
      post.mockResolvedValueOnce({ data: { msg: "Resumed, and it's yours now: its creator couldn't send it any more. It sends only what you can read." } })
      fetchState.value = {
        data: { webhooks: [{ ...hook, paused_at: anHourAgo(), paused_reason: "owner_cant_read", scope_type: "channel" }] },
        isLoading: false,
        isError: undefined,
        mutate,
      }
      render(<WebhooksCard />)
      expect(document.querySelector('[data-webhook-notice="paused"]')?.textContent).toContain("its owner can't read the channel it's set up for")
      fireEvent.click(screen.getByRole("button", { name: "Resume CRM sync" }))
      await waitFor(() => expect(mutate).toHaveBeenCalled())
      expect(post).toHaveBeenCalledWith("/admin/webhooks/w1/resume")
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("it's yours now") }))
    })
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

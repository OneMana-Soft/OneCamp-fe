import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

/** hub.md AI11: the conversation history popover. */
const list = vi.fn()
const del = vi.fn()
vi.mock("@/services/aiService", () => ({
  listChatSessions: () => list(),
  getChatSession: vi.fn().mockResolvedValue([]),
  deleteChatSession: (id: string) => del(id),
}))
vi.mock("@/hooks/useClientConfig", async (orig) => ({ ...(await orig<typeof import("@/hooks/useClientConfig")>()), useFeature: () => true }))

import { ChatHistoryMenu, historyGroup } from "@/components/ai/ChatHistoryMenu"

afterEach(() => {
  cleanup()
  list.mockReset()
  del.mockReset()
})

const now = new Date()
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()

describe("chat history", () => {
  it("groups by day", () => {
    const n = new Date(2026, 9, 11, 12)
    expect(historyGroup(new Date(2026, 9, 11, 8).toISOString(), n)).toBe("Today")
    expect(historyGroup(new Date(2026, 9, 10, 23).toISOString(), n)).toBe("Yesterday")
    expect(historyGroup(new Date(2026, 9, 2).toISOString(), n)).toBe("Earlier")
  })

  it("lists conversations under their day, marks the open one, and searches", async () => {
    list.mockResolvedValue([
      { id: "a", title: "Launch status", created_at: ago(0), updated_at: ago(0), message_count: 4 },
      { id: "b", title: "Pricing page copy", created_at: ago(5), updated_at: ago(5), message_count: 2 },
    ])
    render(<ChatHistoryMenu onResume={vi.fn()} currentId="a" />)
    fireEvent.click(screen.getByRole("button", { name: "Past conversations" }))
    expect(await screen.findByText("Launch status")).toBeTruthy()
    expect(screen.getByRole("group", { name: "Today" })).toBeTruthy()
    expect(screen.getByRole("group", { name: "Earlier" })).toBeTruthy()
    expect(screen.getByText("Launch status").closest("[data-history-row]")?.hasAttribute("data-current")).toBe(true)
    fireEvent.change(screen.getByRole("textbox", { name: "Search conversations" }), { target: { value: "pricing" } })
    expect(screen.queryByText("Launch status")).toBeNull()
  })

  it("confirms a delete in the row itself", async () => {
    list.mockResolvedValue([{ id: "a", title: "Launch status", created_at: ago(0), updated_at: ago(0), message_count: 4 }])
    del.mockResolvedValue(undefined)
    render(<ChatHistoryMenu onResume={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Past conversations" }))
    fireEvent.click(await screen.findByRole("button", { name: "Delete Launch status" }))
    expect(del).not.toHaveBeenCalled()
    expect(screen.getByText("Delete this chat?")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(del).toHaveBeenCalledWith("a")
  })

  it("says so when there is nothing", async () => {
    list.mockResolvedValue([])
    render(<ChatHistoryMenu onResume={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Past conversations" }))
    expect(await screen.findByText("No earlier chats")).toBeTruthy()
  })
})

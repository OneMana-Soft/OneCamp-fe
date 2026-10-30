import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// New message's people (design v3 rows): a 48px row per person with their
// face, name and handle, the multi-select ground and a checked box when
// chosen, and who is chosen as chips above with a ×. Each person was a
// bordered card and a chosen one an accent frame on a peach fill; the agent
// was an "OA" disc.

const users = [
  { user_uuid: "ai", user_name: "OneCamp AI", is_bot: true },
  { user_uuid: "me", user_name: "Sam Rivera", user_full_name: "Sam Rivera", user_email_id: "visitor@demo.onemana.dev" },
  { user_uuid: "maya", user_name: "Maya Chen", user_full_name: "Maya Chen" },
  { user_uuid: "jonas", user_name: "Jonas Weber", user_full_name: "Jonas Weber" },
]
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => ({ data: url.includes("DMable") || url.includes("ai") ? { data: [] } : { users } }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/useBotKinds", () => ({
  useBotKind: (id?: string, isBot?: boolean) => (isBot && id === "ai" ? "assistant" : undefined),
  useBotKindMap: () => ({ ai: "assistant" }),
}))
vi.mock("@/components/ui/botTag", () => ({ BotTag: () => <span>Agent</span> }))

const { SelectUserToMessageDropdown } = await import("./selectUserToMessageDropdown")

afterEach(cleanup)

describe("the people in New message", () => {
  it("are rows, not cards, and a chosen one is checked on the multi-select ground", () => {
    const onSelect = vi.fn()
    const { container } = render(<SelectUserToMessageDropdown onSelect={onSelect} />)
    const rows = screen.getAllByRole("option")
    expect(rows).toHaveLength(4)
    for (const r of rows) {
      expect(r.className).not.toMatch(/\bborder\b/)
      expect(r.className).toContain("h-12")
    }
    const maya = screen.getByRole("option", { name: /Maya Chen/ })
    fireEvent.click(maya)
    expect(maya.getAttribute("aria-selected")).toBe("true")
    expect(maya.className).toContain("bg-sel")
    expect(maya.className).not.toMatch(/bg-primary|border-primary/)
    expect(maya.querySelector("[data-check] svg")).toBeTruthy()
    expect(onSelect).toHaveBeenLastCalledWith([expect.objectContaining({ user_uuid: "maya" })])
    // Chosen, as a chip with a way to take it back.
    expect(container.querySelector("[data-picked]")?.textContent).toContain("Maya Chen")
    // Its x is 20px drawn, a finger's 44px to tap (app/phone.css F3).
    expect(screen.getByRole("button", { name: "Remove Maya Chen" }).hasAttribute("data-touch-target")).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Remove Maya Chen" }))
    expect(container.querySelector("[data-picked]")).toBeNull()
  })

  it("draws the agent as its square, never initials", () => {
    render(<SelectUserToMessageDropdown onSelect={() => {}} />)
    const ai = screen.getByRole("option", { name: /OneCamp AI/ })
    expect(ai.querySelector("[data-agent-avatar]")).toBeTruthy()
    expect(ai.textContent).not.toContain("OA")
  })

  it("says so when no one matches", () => {
    render(<SelectUserToMessageDropdown onSelect={() => {}} />)
    fireEvent.change(screen.getByRole("searchbox", { name: "Search people" }), { target: { value: "zzq" } })
    expect(screen.getByText("No one called “zzq” here")).toBeTruthy()
  })

  // "Sam Rivera visitor@demo.onemana.dev" was listed second, as someone to
  // message (QA F-47): it is notes to self, and says so, last.
  it("lists the reader last, as notes to self", () => {
    render(<SelectUserToMessageDropdown onSelect={() => {}} />)
    const rows = screen.getAllByRole("option")
    const last = rows[rows.length - 1]
    expect(last.textContent).toContain("Sam Rivera(you)")
    expect(last.textContent).toContain("Notes to self")
    expect(last.textContent).not.toContain("visitor@demo.onemana.dev")
  })
})

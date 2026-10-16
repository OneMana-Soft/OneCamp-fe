import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
vi.mock("@/components/message/chatFace", () => ({ ChatFace: ({ size }: { size: number }) => <span style={{ width: size }} /> }))
const { ConversationEmpty } = await import("./conversationEmpty")

// Design v3 chat, C58: an empty channel orbits its real members around its
// #; a DM shows the other person's face; starter chips make the first move
// one click; and nothing takes a hue from the conversation's id.
afterEach(cleanup)

const faces = [
  { uuid: "s", name: "Sam Rivera" },
  { uuid: "m", name: "Maya Chen" },
  { uuid: "rc", name: "Release Captain", isBot: true },
]

describe("an empty conversation", () => {
  it("in a channel orbits the channel's members around its #", () => {
    const { container } = render(<ConversationEmpty kind="channel" faces={faces} title="This is the start of #launch" />)
    expect(container.querySelector("[data-orbit]")).toBeTruthy()
    expect(container.querySelectorAll("[data-orbit] .motion-safe\\:animate-orbit-in")).toHaveLength(3)
    expect(screen.getByText("This is the start of #launch")).toBeTruthy()
  })

  it("in a DM shows the other person's face, at 64px", () => {
    const { container } = render(<ConversationEmpty kind="dm" faces={[faces[1]]} title="This is the start of your conversation with Maya Chen" />)
    expect(container.querySelector("[data-orbit]")).toBeNull()
    expect(container.querySelector('[style*="width: 64px"]')).toBeTruthy()
  })

  it("offers starter chips that act", () => {
    let said = false
    render(<ConversationEmpty title="x" chips={[{ label: "Say hello", onClick: () => { said = true } }]} />)
    fireEvent.click(screen.getByRole("button", { name: "Say hello" }))
    expect(said).toBe(true)
  })

  it("heads a history as its start, without filling the list", () => {
    const { container } = render(<ConversationEmpty kind="channel" faces={faces} title="This is the start of #design" placement="start" />)
    const block = container.firstElementChild as HTMLElement
    expect(block.className).not.toContain("h-full")
    expect(block.className).toContain("pt-10")
    expect(block.hasAttribute("data-conversation-empty")).toBe(false)
    expect(container.querySelector("[data-orbit]")).toBeTruthy()
  })

  it("takes no hue from the conversation's id", () => {
    const src = readFileSync("components/message/emptyConversations.tsx", "utf8") + readFileSync("components/message/conversationEmpty.tsx", "utf8")
    expect(src).not.toMatch(/hueFor\(/)
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
vi.mock("@/components/message/chatFace", () => ({ ChatFace: ({ size }: { size: number }) => <span style={{ width: size }} /> }))
const { ConversationEmpty } = await import("./conversationEmpty")
const { hueFor } = await import("@/lib/campHue")

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

  // INTERACTION_SPEC D13 (superseding C58 for channels): a channel's orbit
  // centres on its tile, in the channel's own hue, as its sidebar row and its
  // header show it. A DM or a group still takes no hue from its id: its colour
  // is the faces in it.
  it("centres a channel's orbit on its tile, in the channel's hue", () => {
    const { container } = render(<ConversationEmpty kind="channel" channelId="c0de0000-0000-4000-8000-000000000003" faces={faces} title="This is the start of #launch" />)
    const tile = container.querySelector("[data-orbit] [data-channel-tile]")!
    expect(tile.getAttribute("data-hue")).toBe(hueFor("c0de0000-0000-4000-8000-000000000003"))
  })

  it("takes no hue from a DM's or a group's id", () => {
    const src = readFileSync("components/message/emptyConversations.tsx", "utf8") + readFileSync("components/message/conversationEmpty.tsx", "utf8")
    expect(src).not.toMatch(/hueFor\(/)
  })
})

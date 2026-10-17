import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { ChannelListChannel } from "./channelListChannel"
import { hueFor } from "@/lib/campHue"

// INTERACTION_SPEC D13 (15 Oct 2026), superseding design v3 chat's rule 1.2:
// a channel wears its own hue. Chat was the least colourful area of the app
// (PG1-14), a grey column of # tiles. Every row now leads with the channel's
// tile in its hue (hueFor its id), the tile the sidebar, its header, the
// palette and search draw too, and the row itself carries the hue, so its
// hover and selected states tint in it (§2.2).

afterEach(() => cleanup())

const base = {
  lastUsername: "Maya Chen",
  lastUserMessage: "Load test is running now.",
  lastMessageTime: "",
  channelName: "engineering",
  unseenMessageCount: 0,
  userSelected: false,
  attachmentCount: 0,
}

const A = "7d34246f-6121-4751-9b44-b4cbc70a8b85"
const B = "0b8f1f44-9a51-4f7d-8e5c-3f1f1b3a9a10"

describe("a channel in the browser", () => {
  it("leads with its tile in its own hue, and its row tints in it", () => {
    const { container } = render(<ChannelListChannel {...base} channelId={A} />)
    const tile = container.querySelector("[data-channel-tile]")!
    expect(tile.getAttribute("data-hue")).toBe(hueFor(A))
    expect(tile.className).toContain(`hue-${hueFor(A)}`)
    expect(tile.className).toContain("bg-hue-tint")
    expect(tile.getAttribute("aria-hidden")).toBe("true")
    expect(container.querySelector('[data-interactive="row"]')!.getAttribute("data-hue")).toBe(hueFor(A))
  })

  it("is a different colour for a channel that hashes to another hue", () => {
    expect(hueFor(A)).not.toBe(hueFor(B))
    const a = render(<ChannelListChannel {...base} channelId={A} />).container.querySelector("[data-channel-tile]")!.getAttribute("data-hue")
    cleanup()
    const b = render(<ChannelListChannel {...base} channelId={B} />).container.querySelector("[data-channel-tile]")!.getAttribute("data-hue")
    expect(a).not.toBe(b)
  })

  it("shows a lock for a private channel, as its header does", () => {
    const pub = render(<ChannelListChannel {...base} channelId="c1" />).container.querySelector("[data-channel-tile] svg")!.outerHTML
    cleanup()
    const priv = render(<ChannelListChannel {...base} channelId="c1" isPrivate />).container.querySelector("[data-channel-tile] svg")!.outerHTML
    expect(priv).not.toBe(pub)
  })
})

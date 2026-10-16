import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { ChannelListChannel } from "./channelListChannel"

// Design v3 chat, rule 1.2 and C55: a channel has no hue. The browser's rows
// wore a tint tile in each channel's hashed hue (green, blue, pink, yellow)
// while the sidebar and the channel's own header had gone to the monochrome #,
// so one channel was coloured on one screen and grey on the next. Now every
// row carries the same neutral # (a lock for a private channel).

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

describe("a channel in the browser", () => {
  it("wears no hue of its own", () => {
    const { container } = render(<ChannelListChannel {...base} channelId="f8d2c416-1c36-4573-bf20-7388b1b91907" />)
    expect(container.querySelector("[data-hue]")).toBeNull()
    expect(container.innerHTML).not.toMatch(/\bhue-(sun|moss|lake|sky|dusk|berry)\b/)
    const mark = container.querySelector("[data-channel-mark]")!
    expect(mark.className).toContain("bg-sunken")
    expect(mark.className).toContain("text-ink-3")
    expect(mark.getAttribute("aria-hidden")).toBe("true")
  })

  it("is the same mark for any two channels", () => {
    const a = render(<ChannelListChannel {...base} channelId="7d34246f-6121-4751-9b44-b4cbc70a8b85" />).container.querySelector("[data-channel-mark]")!.outerHTML
    cleanup()
    const b = render(<ChannelListChannel {...base} channelId="0b8f1f44-9a51-4f7d-8e5c-3f1f1b3a9a10" />).container.querySelector("[data-channel-mark]")!.outerHTML
    expect(a).toBe(b)
  })

  it("shows a lock for a private channel, as its header does", () => {
    const pub = render(<ChannelListChannel {...base} channelId="c1" />).container.querySelector("[data-channel-mark] svg")!.outerHTML
    cleanup()
    const priv = render(<ChannelListChannel {...base} channelId="c1" isPrivate />).container.querySelector("[data-channel-mark] svg")!.outerHTML
    expect(priv).not.toBe(pub)
  })
})

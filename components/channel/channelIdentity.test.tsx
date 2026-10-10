import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { hueFor } from "@/lib/campHue"
import { ChannelListChannel } from "./channelListChannel"

// A channel carries its own colour in the channel list, the same mark its
// header has: a tint tile with its # in the strong cut, by the channel's uuid
// (lib/campHue). It was a grey # on a grey square for every channel.

describe("a channel in the list", () => {
  afterEach(cleanup)

  it("is marked in its own hue", () => {
    const { container } = render(
      <ChannelListChannel
        channelId="7d34246f-6121-4751-9b44-b4cbc70a8b85"
        lastUsername="Maya Chen"
        lastUserMessage="<p>Final hero is in.</p>"
        lastMessageTime=""
        channelName="design"
        unseenMessageCount={0}
        userSelected={false}
        attachmentCount={0}
      />,
    )
    const mark = container.querySelector("[data-hue]")!
    expect(mark.getAttribute("data-hue")).toBe(hueFor("7d34246f-6121-4751-9b44-b4cbc70a8b85"))
    expect(mark.getAttribute("aria-hidden")).toBe("true")
  })
})

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { ChannelListChannel } from "./channelListChannel"
import { hueFor } from "@/lib/campHue"

// A channel's # in the list sits on a tile in the channel's own hue, the
// colour it has in the sidebar and on the phone's Home.

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

describe("a channel in the list", () => {
  it("wears its own hue", () => {
    const id = "f8d2c416-1c36-4573-bf20-7388b1b91907"
    const { container } = render(<ChannelListChannel {...base} hueId={id} />)
    const tile = container.querySelector(`[data-hue="${hueFor(id)}"]`)
    expect(tile?.className).toContain(`hue-${hueFor(id)}`)
    expect(tile?.className).toContain("bg-hue-tint")
  })

  it("keeps the grey tile where no id is given", () => {
    const { container } = render(<ChannelListChannel {...base} />)
    expect(container.querySelector("[data-hue]")).toBeNull()
  })
})

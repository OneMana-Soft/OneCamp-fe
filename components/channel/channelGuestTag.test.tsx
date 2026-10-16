import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { ChannelListChannel } from "./channelListChannel"

// A channel guests can read says so (backend 12 Oct: has_guest_access on the
// channel's info and the channel lists, left out when false, never in live
// updates). Its members couldn't tell that a client was reading along.

afterEach(() => cleanup())

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const base = {
  channelId: "f8d2c416-1c36-4573-bf20-7388b1b91907",
  lastUsername: "Maya Chen",
  lastUserMessage: "The Acme review is at four.",
  lastMessageTime: "",
  channelName: "acme",
  unseenMessageCount: 0,
  userSelected: false,
  attachmentCount: 0,
}

describe("a channel guests can read", () => {
  it("wears a quiet Guests tag after its name in the lists, in a guest's sun", () => {
    const { container } = render(<ChannelListChannel {...base} hasGuestAccess />)
    const tag = container.querySelector<HTMLElement>("[data-channel-guests]")!
    expect(tag.textContent).toContain("Guests")
    expect(tag.className).toMatch(/\btag\b/)
    expect(tag.className).toContain("bg-camp-sun-tint text-camp-sun-ink")
    expect(tag.title).toMatch(/outside the workspace/)
    // The same sun as a guest's own Guest tag.
    expect(read("components/ui/principalTag.tsx")).toContain('guest: { label: "Guest"')
    expect(read("components/ui/principalTag.tsx")).toMatch(/guest: \{[^}]*tone: "bg-camp-sun-tint text-camp-sun-ink"/)
  })

  it("wears nothing when the field is false or missing", () => {
    expect(render(<ChannelListChannel {...base} />).container.querySelector("[data-channel-guests]")).toBeNull()
    expect(render(<ChannelListChannel {...base} hasGuestAccess={false} />).container.querySelector("[data-channel-guests]")).toBeNull()
  })

  it("is read from the lists' answer, and drawn in the desktop and phone headers", () => {
    expect(read("components/channel/chnnelListResult.tsx")).toMatch(/hasGuestAccess=\{channel\.has_guest_access === true\}/)
    expect(read("components/channel/chanelIdDesktop.tsx")).toMatch(/channel_info\.has_guest_access && <ChannelGuestTag \/>/)
    expect(read("components/navigationBar/mobile/phoneConversationTitle.tsx")).toMatch(/ch\?\.has_guest_access && <ChannelGuestTag \/>/)
  })
})

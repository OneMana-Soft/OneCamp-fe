import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
// The kinds the server would answer: an agent, the Check-in bot, and a bot
// not in the list yet (still loading, or made a moment ago).
const KINDS: Record<string, string> = { captain: "agent", checkin: "checkin" }
vi.mock("@/hooks/useBotKinds", () => ({
  useBotKind: (uuid: string | undefined, isBot: boolean | undefined) => (isBot && uuid ? KINDS[uuid] : undefined),
}))
const { ChannelMessageAvatar } = await import("@/components/channel/channelMessageAvatar")

// A bot must never be drawn like a person, and only an agent is drawn as one.
describe("ChannelMessageAvatar", () => {
  afterEach(cleanup)

  it("draws an agent as a rounded square in the agent colour, with its sparkle", () => {
    const { container } = render(<ChannelMessageAvatar userName="Release Captain" isBot userUUID="captain" />)
    expect(container.querySelector("[data-agent-avatar]")).toBeTruthy()
    const fallback = container.querySelector("[data-agent-avatar] .bg-agent-muted")
    expect(fallback, "the agent's initials sit on the agent tint").toBeTruthy()
    // A rounded square, not a person's circle (twMerge drops the base rounded-full).
    expect(fallback?.className).toContain("rounded-[28%]")
    expect(fallback?.className).not.toContain("rounded-full")
  })

  it("draws a plain bot as a neutral rounded square, with no AI sparkle", () => {
    const { container } = render(<ChannelMessageAvatar userName="Check-in" isBot userUUID="checkin" />)
    expect(container.querySelector("[data-agent-avatar]")).toBeNull()
    expect(container.innerHTML).not.toContain("bg-agent")
    expect(container.querySelector("[data-bot-avatar]")?.className).toContain("rounded-[28%]")
  })

  it("claims no AI for a bot whose kind isn't known yet", () => {
    const { container } = render(<ChannelMessageAvatar userName="Someone new" isBot userUUID="unknown" />)
    expect(container.querySelector("[data-agent-avatar]")).toBeNull()
    expect(container.querySelector("[data-bot-avatar]")).toBeTruthy()
  })

  it("draws a person as before", () => {
    const { container } = render(<ChannelMessageAvatar userName="Maya Chen" />)
    expect(container.querySelector("[data-agent-avatar]")).toBeNull()
    expect(container.querySelector("[data-bot-avatar]")).toBeNull()
    expect(container.innerHTML).not.toContain("bg-agent-muted")
  })
})

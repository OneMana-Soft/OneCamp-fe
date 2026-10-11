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

  // Design v3 (§3.9): a 32% square in the agent gradient with the white
  // spark, and never initials, so an agent never reads as a person.
  it("draws an agent as a 32% square in the agent gradient, with the spark and no initials", () => {
    const { container } = render(<ChannelMessageAvatar userName="Release Captain" isBot userUUID="captain" />)
    expect(container.querySelector("[data-agent-avatar]")).toBeTruthy()
    const fallback = container.querySelector("[data-agent-avatar] .avatar-agent")
    expect(fallback, "the agent's face is the agent gradient").toBeTruthy()
    expect(fallback?.className).toContain("rounded-[32%]")
    expect(fallback?.className).not.toContain("rounded-full")
    expect(fallback?.querySelector("svg")).toBeTruthy()
    expect(fallback?.textContent).toBe("")
  })

  it("draws a plain bot as a neutral rounded square, with no AI sparkle", () => {
    const { container } = render(<ChannelMessageAvatar userName="Check-in" isBot userUUID="checkin" />)
    expect(container.querySelector("[data-agent-avatar]")).toBeNull()
    expect(container.innerHTML).not.toContain("bg-agent")
    expect(container.querySelector("[data-bot-avatar]")?.className).toContain("rounded-[32%]")
    expect(container.querySelector("[data-bot-avatar] .avatar-bot")).toBeTruthy()
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

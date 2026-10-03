import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
const { ChannelMessageAvatar } = await import("@/components/channel/channelMessageAvatar")

// An agent must never be drawn like a person: different shape, its own colour.
describe("ChannelMessageAvatar", () => {
  afterEach(cleanup)

  it("draws an agent as a rounded square in the agent colour, with its sparkle", () => {
    const { container } = render(<ChannelMessageAvatar userName="Release Captain" isAgent />)
    expect(container.querySelector("[data-agent-avatar]")).toBeTruthy()
    const fallback = container.querySelector("[data-agent-avatar] .bg-agent-muted")
    expect(fallback, "the agent's initials sit on the agent tint").toBeTruthy()
    // A rounded square, not a person's circle (twMerge drops the base rounded-full).
    expect(fallback?.className).toContain("rounded-[28%]")
    expect(fallback?.className).not.toContain("rounded-full")
  })

  it("draws a person as before", () => {
    const { container } = render(<ChannelMessageAvatar userName="Maya Chen" />)
    expect(container.querySelector("[data-agent-avatar]")).toBeNull()
    expect(container.innerHTML).not.toContain("bg-agent-muted")
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

const avatarKeys: (string | null | undefined)[] = []
vi.mock("@/hooks/useUserAvatar", () => ({
  useUserAvatar: (key?: string | null) => {
    avatarKeys.push(key)
    return { src: key ? "https://img.example/" + key : undefined }
  },
}))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: () => "guest" }))
const { ChannelMessageAvatar } = await import("@/components/channel/channelMessageAvatar")

// A guest is a person from outside: a circle with their initials on a neutral
// tint, never the Guests bot's square or its image, never a member's colour.
describe("ChannelMessageAvatar for a guest", () => {
  afterEach(() => {
    cleanup()
    avatarKeys.length = 0
  })

  it("draws the guest's initials in a neutral circle", () => {
    const { container } = render(
      <ChannelMessageAvatar userName="Priya (Acme)" userProfileKey="guests-bot.png" isBot userUUID="guests" guest />,
    )
    const avatar = container.querySelector("[data-guest-avatar]")
    expect(avatar).toBeTruthy()
    expect(container.querySelector("[data-bot-avatar]")).toBeNull()
    expect(avatar?.className).not.toContain("rounded-[28%]")
    expect(container.textContent).toBe("P")
    expect(container.innerHTML).toContain("bg-muted")
    expect(avatarKeys.every((k) => !k), "the bot's image never stands in for a guest").toBe(true)
  })
})

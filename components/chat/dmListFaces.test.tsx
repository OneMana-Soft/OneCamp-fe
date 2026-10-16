import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

// Agents look like agents everywhere (design v3 chat, rule 1.2 and C09): the
// OneCamp AI agent, a square with the spark in the sidebar and in its own
// messages, was an "OA" disc in the DM list, drawn as a person.

const kinds: Record<string, string> = { ai: "assistant", checkin: "checkin" }
vi.mock("@/hooks/useBotKinds", () => ({
  useBotKind: (id?: string, isBot?: boolean) => (isBot && id ? kinds[id] : undefined),
  useBotKindMap: () => kinds,
}))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

const { ChatUserListUserAvatar } = await import("./chatUserListUserAvatar")

afterEach(cleanup)

describe("a face in the DM list", () => {
  it("is the agent's square with the spark for an agent, never its initials", () => {
    const { container } = render(<ChatUserListUserAvatar userName="OneCamp AI" userUUID="ai" isBot />)
    expect(container.querySelector("[data-agent-avatar]")).toBeTruthy()
    expect(container.textContent).not.toContain("OA")
  })

  it("is the bot's neutral square for a bot", () => {
    const { container } = render(<ChatUserListUserAvatar userName="Check-in" userUUID="checkin" isBot />)
    expect(container.querySelector("[data-bot-avatar]")).toBeTruthy()
  })

  it("is the person's disc with their initials for a person", () => {
    const { container } = render(<ChatUserListUserAvatar userName="Maya Chen" userUUID="maya" />)
    expect(container.querySelector("[data-agent-avatar],[data-bot-avatar]")).toBeNull()
    expect(container.textContent).toBe("MC")
  })
})

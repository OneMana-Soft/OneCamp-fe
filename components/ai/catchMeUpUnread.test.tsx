import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// "Catch me up" asks for the messages that were unread on opening. Opening
// the conversation marks it seen, and the recap read the last-seen that had
// just moved: nothing to recap, and the banner went for an hour (SA-BUG-7).

const catchUp = vi.fn(async () => ({ enabled: true, has_unread: true, summary: "Maya shipped it.", scopes_allowed: 1 }))
vi.mock("@/services/aiService", () => ({ useCatchUp: () => ({ catchUp, isLoading: false }) }))
vi.mock("@/components/common/withFeature", () => ({ withAI: <T,>(c: T) => c }))
vi.mock("./StreamingText", () => ({ default: ({ text }: { text: string }) => <span>{text}</span> }))
vi.mock("@/lib/utils/helpers/ttlStorage", () => ({ isTTLActive: () => false, setTTL: () => {} }))

const { default: CatchMeUpBanner } = await import("./CatchMeUpBanner")

afterEach(() => {
  cleanup()
  catchUp.mockClear()
})

describe("Catch me up", () => {
  it.each([
    ["channel", { scope_type: "channel", channel_uuid: "c1", unread: 12 }],
    ["group", { scope_type: "chat", chat_grp_id: "c1", unread: 12 }],
  ] as const)("in a %s, asks for the 12 that were unread on opening", async (type, want) => {
    render(<CatchMeUpBanner channelUUID="c1" unreadCount={12} channelName="launch" type={type} isChannel={type === "channel"} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /catch me up/i }))
    })
    expect(catchUp).toHaveBeenCalledWith(want)
  })
})

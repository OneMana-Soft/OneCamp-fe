import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

const KINDS: Record<string, string> = { guests: "guest", slack: "bridge", captain: "agent" }
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => KINDS }))
vi.mock("react-redux", () => ({ useSelector: () => ({}) }))
// Every row at once, without measuring a viewport.
vi.mock("@/components/list/virtualInfiniteScroll", () => ({
  VirtualInfiniteScroll: ({ items, renderItem }: { items: unknown[]; renderItem: (i: unknown, n: number) => React.ReactNode }) => (
    <div>{items.map((item, n) => renderItem(item, n))}</div>
  ),
}))

const { ChannelListResult } = await import("@/components/channel/chnnelListResult")

function channel(uuid: string, by: Record<string, unknown>, text: string) {
  return {
    ch_uuid: uuid,
    ch_name: uuid,
    ch_posts: [{ post_uuid: uuid + "-p", post_text: text, post_created_at: "2026-10-10T09:00:00Z", post_by: by }],
  }
}

// A channel whose latest message a guest wrote read "Guests: [Priya (Acme)
// (guest)]Looks good" in the channel list.
describe("the channel list's latest message", () => {
  afterEach(cleanup)

  it("names the guest or Slack person who wrote it, and shows only their words", () => {
    const { container } = render(
      <ChannelListResult
        channelList={[
          channel("acme", { user_uuid: "guests", user_name: "Guests", is_bot: true }, "<p><strong>[Priya (Acme) (guest)]</strong></p><p>Looks good</p>"),
          channel("bridged", { user_uuid: "slack", user_name: "Slack", is_bot: true }, "<p><strong>[Ana Ruiz]</strong></p><p>On it</p>"),
          channel("eng", { user_uuid: "u1", user_name: "Maya Chen" }, "<p><strong>[note]</strong></p><p>hi</p>"),
        ] as never}
      />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Priya (Acme): Looks good")
    expect(text).toContain("Ana Ruiz: On it")
    expect(text).not.toContain("Guests:")
    expect(text).not.toContain("(guest)]")
    // A member's own bracket line is theirs, and stays.
    expect(screen.getByText(/Maya Chen:/).parentElement?.textContent).toContain("[note]")
  })
})

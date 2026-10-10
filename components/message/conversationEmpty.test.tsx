import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"

// An empty channel, DM or group shows the welcome spot (the playful layer's
// illustration) in the conversation's own hue: the channel's, the other
// person's (their avatar's, seeded by their name), or the group's. It was two
// lines of grey text.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => "/app/channel/c1", useRouter: () => ({ push: () => {} }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => undefined), isSubmitting: false }) }))
vi.mock("@/hooks/useFetch", () => {
  const me = { data: { data: { user_uuid: "me", user_name: "Sam Rivera" } } }
  const maya = { data: { data: { user_uuid: "maya", user_name: "Maya Chen", user_full_name: "Maya Chen" } } }
  return { useFetch: () => ({ data: undefined }), useFetchOnlyOnce: (url: string) => (url === "/user/profile" ? me : maya) }
})

const { default: store } = await import("@/store/store")
const { ChannelMessages } = await import("@/components/channel/channelMessages")
const { ChatMessages } = await import("@/components/chat/chatMessages")
const { GroupChatMessages } = await import("@/components/groupChat/groupChatMessages")

const list = { getOldMessages: () => {}, hasMoreOldMsg: false, getNewMessages: () => {}, hasMoreNewMsg: false, isNewMsgLoading: false, isOLdMsgLoading: false, clickedScrollToBottom: () => {} }
const spot = (container: HTMLElement) => container.querySelector("[data-conversation-empty] svg")

afterEach(cleanup)

describe("an empty conversation", () => {
  it("in a channel shows the welcome spot in the channel's hue", () => {
    const { container } = render(<Provider store={store}><ChannelMessages posts={[]} channelId="c-empty" {...list} /></Provider>)
    expect(spot(container)?.getAttribute("class")).toContain(HUE_CLASS[hueFor("c-empty")])
    expect(screen.getByText("What you write below starts the conversation.")).toBeTruthy()
  })

  it("in a DM shows it in the other person's hue, and says who it is with", () => {
    const { container } = render(<Provider store={store}><ChatMessages chats={[]} chatId="maya" {...list} /></Provider>)
    expect(spot(container)?.getAttribute("class")).toContain(HUE_CLASS[hueFor("Maya Chen")])
    expect(screen.getByText("This is the start of your conversation with Maya Chen")).toBeTruthy()
  })

  it("in a group shows it in the group's hue", () => {
    const { container } = render(<Provider store={store}><GroupChatMessages chats={[]} grpId="g-empty" {...list} /></Provider>)
    expect(spot(container)?.getAttribute("class")).toContain(HUE_CLASS[hueFor("g-empty")])
  })
})

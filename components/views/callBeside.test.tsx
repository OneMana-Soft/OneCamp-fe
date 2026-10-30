import type React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// A call button on a tablet started no call (20 Oct 2026, split view's case
// 14). The channel, DM and group headers open a call beside the conversation
// and asked only "is this a phone?" to decide, while the shell turns split
// view off on a tablet too. So on a tablet the click was taken, the call went
// into a pane nobody could see, and the button did nothing. Now the shell's
// own switch decides (useSplitView sets it; useOpenBeside reads it): where
// views can't sit side by side the button opens the call's page.
//
// The real headers, the real store and the shell's real hook; only what they
// read from the network and draw around them is stood in for.

// The box reads its conversation's command catalog as it draws (LazyCommandSurface).
vi.mock("@/services/commandService", () => ({ fetchCommandCatalog: async () => ({ commands: [] }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: false, isTablet: true }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => "/app/channel/c1", useSearchParams: () => new URLSearchParams() }))
/** Where a link took the page: a plain click that nothing else took. */
const navigated: string[] = []
vi.mock("next/link", () => ({
  default: ({ href, onClick, children, ...rest }: { href: string; onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void; children: React.ReactNode }) => (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented) return
        e.preventDefault()
        navigated.push(href)
      }}
    >
      {children}
    </a>
  ),
}))
// Calls are on for this server.
vi.mock("@/components/common/withFeature", () => ({ FeatureGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => undefined), isSubmitting: false }) }))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({ validateFiles: () => [] }) }))
vi.mock("@/hooks/usePublishTyping", () => ({ usePublishTyping: () => ({ publishTyping: () => {} }) }))
vi.mock("@/hooks/useFetch", () => {
  const channel = { data: { channel_info: { ch_uuid: "c1", ch_name: "design", ch_is_member: true, ch_deleted_at: "0001-01-01T00:00:00Z", ch_member_count: 3 } }, isLoading: false, mutate: () => {} }
  const person = { data: { data: { user_uuid: "maya", user_name: "Maya Chen", user_full_name: "Maya Chen" } }, isLoading: false, mutate: () => {} }
  const group = { data: { data: { dm_grouping_id: "g1", dm_participants: [{ user_uuid: "maya", user_name: "Maya Chen" }] } }, isLoading: false, mutate: () => {} }
  const none = { data: undefined, isLoading: false, mutate: () => {} }
  const pick = (url: string) => (url.includes("channelBasicInfo") ? channel : url.includes("Participants") || url.includes("participants") ? group : url ? person : none)
  return { useFetch: pick, useFetchOnlyOnce: pick }
})
vi.mock("@/components/message/chatFace", () => ({ ChatFace: () => null }))
vi.mock("@/components/textInput/textInput", () => ({ default: () => null }))
vi.mock("@/components/conversation/ConversationMessages", () => ({ ConversationMessages: () => null }))
vi.mock("@/components/ai/ChannelAgents", () => ({ useChannelAgents: () => [] }))
vi.mock("@/components/ai/CatchMeUpBanner", () => ({ default: () => null }))
vi.mock("@/components/ai/ChannelMemoryIndicator", () => ({ ChannelMemoryIndicator: () => null }))
vi.mock("@/components/ai/ComposerAIButton", () => ({ ComposerAIButton: () => null }))
vi.mock("@/components/ai/PendingActionsTray", () => ({ default: () => null }))
vi.mock("@/components/command/CommandSurface", () => ({ default: () => null }))
vi.mock("@/components/messages/heldNotificationsBar", () => ({ HeldNotificationsBar: () => null }))
vi.mock("@/components/chat/chatUserEmojiStatus", () => ({ ChatUserEmojiStatus: () => null }))
vi.mock("@/components/chat/chatUserAvatar", () => ({ ChatUserAvatar: () => null }))

const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: store } = await import("@/store/store")
const { closeSplit } = await import("@/store/slice/splitActions")
const { useSplitView } = await import("@/hooks/useSplitView")
const { ChannelIdDesktop } = await import("@/components/channel/chanelIdDesktop")
const { ChatIdDesktop } = await import("@/components/chat/chatIdDesktop")
const { ChatGrpIdDesktop } = await import("@/components/groupChat/chatGrpIdDesktop")

/** The shell around a page: split view on for a computer, off for a tablet (LayoutContent's switch). */
function Shell({ split, children }: { split: boolean; children: React.ReactNode }) {
  useSplitView(split)
  return <>{children}</>
}

afterEach(() => {
  cleanup()
  navigated.length = 0
  while (store.getState().split?.panes.length) store.dispatch(closeSplit(0))
})

const headers = [
  ["a channel", () => <ChannelIdDesktop channelId="c1" handleSend={() => {}} />, "/app/meet/ch/c1", { kind: "call-channel", id: "c1" }],
  ["a DM", () => <ChatIdDesktop chatId="maya" handleSend={() => {}} />, "/app/meet/chat/maya", { kind: "call-chat", id: "maya" }],
  ["a group", () => <ChatGrpIdDesktop grpId="g1" handleSend={() => {}} />, "/app/meet/grp/g1", { kind: "call-group", id: "g1" }],
] as const

describe.each(headers)("the call button in %s", (_, header, callPage, callPane) => {
  const open = (split: boolean) => {
    render(
      <Provider store={store}>
        <TooltipProvider>
          <Shell split={split}>{header()}</Shell>
        </TooltipProvider>
      </Provider>,
    )
    fireEvent.click(screen.getByRole("link", { name: "Start a huddle" }))
  }

  it("opens the call's page on a tablet, where views can't sit side by side", () => {
    open(false)
    expect(navigated).toEqual([callPage])
    expect(store.getState().split?.panes).toEqual([])
  })

  it("opens the call beside the conversation on a computer", () => {
    open(true)
    expect(navigated).toEqual([])
    expect(store.getState().split?.panes).toEqual([callPane])
  })
})

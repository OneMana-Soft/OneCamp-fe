import type React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// Typing changes the draft, and only the message box reads it. The channel,
// DM and group views read the draft at their top, so every change to it (every
// 300 ms while someone types) re-rendered the header, its menus and tooltips,
// and the conversation's wrapper with it. The DM header also re-rendered on
// every store change at all while it had no draft, because it made a new
// empty draft object on each render.

// The box reads its conversation's command catalog as it draws (LazyCommandSurface).
vi.mock("@/services/commandService", () => ({ fetchCommandCatalog: async () => ({ commands: [] }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useOpenBeside", () => ({ useOpenBeside: () => () => false }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => "/app/channel/c1", useSearchParams: () => new URLSearchParams() }))
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
// What the views hold, as stand-ins. The headers' tooltips (every header
// labels its search button with one) count their renders.
let headerRenders = 0
vi.mock("@/components/common/withTooltip", () => ({
  WithTooltip: ({ children }: { children: React.ReactNode }) => {
    headerRenders++
    return children
  },
}))
vi.mock("@/components/message/chatFace", () => ({ ChatFace: () => null }))
let composerRenders = 0
vi.mock("@/components/textInput/textInput", () => ({
  default: ({ buttonOnclick }: { buttonOnclick?: () => void }) => {
    composerRenders++
    return <button aria-label="Send" onClick={() => buttonOnclick?.()} />
  },
}))
const sparks = vi.fn()
vi.mock("@/lib/chat/celebrateFirst", () => ({ celebrateFirstMessage: () => sparks() }))
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
const { updateChannelInputText } = await import("@/store/slice/channelSlice")
const { createOrUpdateChatBody } = await import("@/store/slice/chatSlice")
const { createOrUpdateGroupChatBody } = await import("@/store/slice/groupChatSlice")
const { ChannelIdDesktop } = await import("@/components/channel/chanelIdDesktop")
const { ChatIdDesktop } = await import("@/components/chat/chatIdDesktop")
const { ChatGrpIdDesktop } = await import("@/components/groupChat/chatGrpIdDesktop")
const { ComposerHost } = await import("@/components/conversation/ComposerHost")

// Each page in its conversation, as ConversationView puts it: the message box writes to the one its host names.
const CHANNEL = { kind: "channel", id: "c1" } as const
const DM = { kind: "dm", id: "maya me", other: "maya" } as const
const GROUP = { kind: "group", id: "g1" } as const

afterEach(() => {
  cleanup()
  headerRenders = 0
  composerRenders = 0
})

const views = [
  ["a channel", () => <ComposerHost target={CHANNEL}><ChannelIdDesktop channelId="c1" handleSend={() => {}} /></ComposerHost>, (n: number) => updateChannelInputText({ channelId: "c1", inputTextHTML: `<p>${"a".repeat(n)}</p>` })],
  ["a DM", () => <ComposerHost target={DM}><ChatIdDesktop chatId="maya" handleSend={() => {}} /></ComposerHost>, (n: number) => createOrUpdateChatBody({ chatUUID: "maya", body: `<p>${"a".repeat(n)}</p>` })],
  ["a group", () => <ComposerHost target={GROUP}><ChatGrpIdDesktop grpId="g1" handleSend={() => {}} /></ComposerHost>, (n: number) => createOrUpdateGroupChatBody({ grpID: "g1", body: `<p>${"a".repeat(n)}</p>` })],
] as const

describe.each(views)("typing in %s", (_, view, typed) => {
  it("redraws the message box and not the header", () => {
    render(
      <Provider store={store}>
        <TooltipProvider>{view()}</TooltipProvider>
      </Provider>,
    )
    const header = headerRenders
    const box = composerRenders
    expect(header).toBeGreaterThan(0)
    for (let n = 1; n <= 5; n++) act(() => void store.dispatch(typed(n)))
    expect(headerRenders).toBe(header)
    expect(composerRenders).toBeGreaterThan(box)
  })
})


// A first message (the view says so) celebrates, from the new row's avatar
// (design v3 chat, C60: lib/chat/celebrateFirst); groups celebrate too.
describe.each([
  ["a channel", (send: () => boolean) => <ComposerHost target={CHANNEL}><ChannelIdDesktop channelId="c1" handleSend={send} /></ComposerHost>],
  ["a DM", (send: () => boolean) => <ComposerHost target={DM}><ChatIdDesktop chatId="maya" handleSend={send} /></ComposerHost>],
  ["a group", (send: () => boolean) => <ComposerHost target={GROUP}><ChatGrpIdDesktop grpId="g1" handleSend={send} /></ComposerHost>],
] as const)("sending a first message in %s", (_, view) => {
  it("celebrates, and a routine send does not", () => {
    let first = true
    render(
      <Provider store={store}>
        <TooltipProvider>{view(() => first)}</TooltipProvider>
      </Provider>,
    )
    const send = screen.getByRole("button", { name: "Send" })
    fireEvent.click(send)
    expect(sparks).toHaveBeenCalledTimes(1)
    sparks.mockReset()
    first = false
    fireEvent.click(send)
    expect(sparks).not.toHaveBeenCalled()
  })
})

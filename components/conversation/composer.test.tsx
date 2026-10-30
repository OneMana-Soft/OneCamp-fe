import type React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { Provider } from "react-redux"
import type { ChatInfo } from "@/types/chat"

// One message box for a channel, a DM and a group, on a computer and a phone
// (chat A1 step 2c). Each kind had its own: the phone's three let the page
// above them redraw at every keystroke, a group's first message on a phone
// went by without its celebration, a DM's starters on a phone sent past it,
// and every box of one kind opened its file picker on one shared switch, so
// Attach beside the page could pick files for the page's conversation.

vi.mock("@/hooks/useOpenBeside", () => ({ useOpenBeside: () => () => false }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => "/app/channel/c1", useSearchParams: () => new URLSearchParams() }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => undefined), isSubmitting: false }) }))
const uploads: string[] = []
// What the boxes read with useFetch: a DM's box mustn't watch a page its list holds.
const asked: string[] = []
vi.mock("@/hooks/useUploadFile", () => ({
  useUploadFile: () => ({
    // The workspace's upload limit, 100 bytes here, as the hook checks it.
    validateFiles: (files: FileList | File[]) => Array.from(files).filter((f) => f.size <= 100),
    makeRequestToUploadToConversation: async (_files: File[], c: { id: string }) => void uploads.push(c.id),
    // How 80b1b7f1c's channel upload strip sent its files: for the run of these tests on that base.
    makeRequestToUploadToChannel: async (_files: FileList, channelId: string) => void uploads.push(channelId),
  }),
}))
vi.mock("@/hooks/usePublishTyping", () => ({ usePublishTyping: () => ({ publishTyping: () => {} }) }))
const STARTER = "What can you do?"
vi.mock("@/hooks/useFetch", () => {
  const channel = (id: string) => ({ data: { channel_info: { ch_uuid: id, ch_name: id, ch_is_member: true, ch_deleted_at: "0001-01-01T00:00:00Z", ch_member_count: 3 } }, isLoading: false, mutate: () => {} })
  const bot = { data: { data: { user_uuid: "bot", user_name: "Ada", user_full_name: "Ada", is_bot: true } }, isLoading: false, mutate: () => {} }
  const group = { data: { data: { dm_grouping_id: "g1", dm_participants: [{ user_uuid: "maya", user_name: "Maya Chen" }] } }, isLoading: false, mutate: () => {} }
  const starters = { data: { data: ["What can you do?"] }, isLoading: false, mutate: () => {} }
  // The DM with "bot" answered its first page with none; any other DM's is still on its way.
  const emptyPage = { data: { data: { chats: [], has_more: false } }, isLoading: false, mutate: () => {} }
  const none = { data: undefined, isLoading: false, mutate: () => {} }
  const pick = (url: string) =>
    !url ? none
      : url.includes("channelBasicInfo") ? channel(url.split("/").pop() || "")
      : url.includes("uggestions") ? starters
      : url.toLowerCase().includes("participants") ? group
      : url.includes("/dm/latestChat/") ? (url.endsWith("/bot") ? emptyPage : none)
      : bot
  const useFetch = (url: string) => {
    asked.push(url)
    return pick(url)
  }
  return { useFetch, useFetchOnlyOnce: pick }
})
// The page's draws, counted by the banner every phone page heads with.
let pageDraws = 0
vi.mock("@/components/ai/CatchMeUpBanner", () => ({
  default: () => {
    pageDraws++
    return null
  },
}))
let boxDraws = 0
vi.mock("@/components/textInput/textInput", () => ({
  default: ({ buttonOnclick, attachmentOnclick, children }: { buttonOnclick?: () => void; attachmentOnclick?: () => void; children?: React.ReactNode }) => {
    boxDraws++
    return (
      <>
        <button aria-label="Send" onClick={() => buttonOnclick?.()} />
        <button aria-label="Attach" onClick={() => attachmentOnclick?.()} />
        {children}
      </>
    )
  },
}))
vi.mock("@/components/drawers/dragableDrawer", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
const sparks = vi.fn()
vi.mock("@/lib/chat/celebrateFirst", () => ({ celebrateFirstMessage: () => sparks() }))
vi.mock("@/components/conversation/ConversationMessages", () => ({ ConversationMessages: () => null }))
vi.mock("@/components/ai/ChannelAgents", () => ({ useChannelAgents: () => [] }))
vi.mock("@/components/ai/ChannelMemoryIndicator", () => ({ ChannelMemoryIndicator: () => null }))
vi.mock("@/components/ai/ComposerAIButton", () => ({ ComposerAIButton: () => null }))
vi.mock("@/components/ai/PendingActionsTray", () => ({ default: () => null }))
vi.mock("@/components/command/CommandSurface", () => ({ default: () => null }))
vi.mock("@/components/messages/heldNotificationsBar", () => ({ HeldNotificationsBar: () => null }))
vi.mock("@/components/chat/chatUserEmojiStatus", () => ({ ChatUserEmojiStatus: () => null }))
vi.mock("@/components/message/chatFace", () => ({ ChatFace: () => null }))

const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: store, RESET_STORE_ACTION } = await import("@/store/store")
const { updateChannelInputText } = await import("@/store/slice/channelSlice")
const { createOrUpdateChatBody, updateChats } = await import("@/store/slice/chatSlice")
const { createOrUpdateGroupChatBody } = await import("@/store/slice/groupChatSlice")
const { ComposerHost } = await import("@/components/conversation/ComposerHost")
const { ChannelIdDesktop } = await import("@/components/channel/chanelIdDesktop")
const { ChannelIdMobile } = await import("@/components/channel/channelIdMobile")
const { ChatIdMobile } = await import("@/components/chat/chatIdMobile")
const { GrpChatIdMobile } = await import("@/components/groupChat/grpChatIdMobile")

type Send = (latestContent?: string) => boolean | void

const app = (ui: React.ReactNode) => render(<Provider store={store}><TooltipProvider>{ui}</TooltipProvider></Provider>)

beforeEach(() => {
  // The app's one store: what a test typed stays in it otherwise.
  store.dispatch({ type: RESET_STORE_ACTION })
  pageDraws = 0
  asked.length = 0
  boxDraws = 0
  uploads.length = 0
  sparks.mockReset()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// Each phone page in its conversation, as ConversationView puts it, and what typing a little writes.
const phones = [
  ["a channel", (send: Send) => <ComposerHost target={{ kind: "channel", id: "c1" }}><ChannelIdMobile channelId="c1" handleSend={send} /></ComposerHost>,
    (n: number) => updateChannelInputText({ channelId: "c1", inputTextHTML: `<p>${"a".repeat(n)}</p>` })],
  ["a DM", (send: Send) => <ComposerHost target={{ kind: "dm", id: "bot me", other: "bot" }}><ChatIdMobile chatId="bot" handleSend={send} /></ComposerHost>,
    (n: number) => createOrUpdateChatBody({ chatUUID: "bot", body: `<p>${"a".repeat(n)}</p>` })],
  ["a group", (send: Send) => <ComposerHost target={{ kind: "group", id: "g1" }}><GrpChatIdMobile grpId="g1" handleSend={send} /></ComposerHost>,
    (n: number) => createOrUpdateGroupChatBody({ grpID: "g1", body: `<p>${"a".repeat(n)}</p>` })],
] as const

describe.each(phones)("on a phone, in %s", (_, page, typed) => {
  it("typing redraws the message box and not the page", () => {
    app(page(() => {}))
    const drawn = pageDraws
    const box = boxDraws
    expect(drawn).toBeGreaterThan(0)
    for (let n = 1; n <= 5; n++) act(() => void store.dispatch(typed(n)))
    expect(pageDraws).toBe(drawn)
    expect(boxDraws).toBeGreaterThan(box)
  })

  it("a first message celebrates, and a routine one doesn't", () => {
    let first = true
    app(page(() => first))
    const send = screen.getByRole("button", { name: "Send" })
    fireEvent.click(send)
    expect(sparks).toHaveBeenCalledTimes(1)
    first = false
    fireEvent.click(send)
    expect(sparks).toHaveBeenCalledTimes(1)
  })
})

describe("a DM with an AI peer and nothing in it yet, on a phone", () => {
  it("sends a starter through the message box, which celebrates the first message", () => {
    const send = vi.fn(() => true)
    app(phones[1][1](send))
    fireEvent.click(screen.getByRole("button", { name: STARTER }))
    expect(send).toHaveBeenCalledWith(`<p>${STARTER}</p>`)
    expect(sparks).toHaveBeenCalledTimes(1)
  })

  it("watches no latest page once the DM holds its messages", () => {
    act(() => void store.dispatch(updateChats({ chatId: "bot", chats: [{ chat_uuid: "m1", chat_body_text: "<p>Hi</p>" } as ChatInfo] })))
    app(phones[1][1](() => {}))
    expect(asked.filter((u) => u.includes("/dm/latestChat/"))).toEqual([])
  })

  it("offers none while its first page is on its way, so none flash over a conversation", () => {
    app(<ComposerHost target={{ kind: "dm", id: "me slow", other: "slow" }}><ChatIdMobile chatId="slow" handleSend={() => {}} /></ComposerHost>)
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: STARTER })).toBeNull()
  })
})

describe("two channels side by side", () => {
  const sideBySide = () => {
    app(
      <>
        <div data-testid="page"><ComposerHost target={{ kind: "channel", id: "c1" }}><ChannelIdDesktop channelId="c1" handleSend={() => {}} /></ComposerHost></div>
        <div data-testid="beside"><ComposerHost target={{ kind: "channel", id: "c2" }}><ChannelIdDesktop channelId="c2" handleSend={() => {}} /></ComposerHost></div>
      </>,
    )
    return { page: within(screen.getByTestId("page")), beside: within(screen.getByTestId("beside")) }
  }

  it("Attach beside the page opens the picker of the box beside the page, and only that one", () => {
    const opened: HTMLInputElement[] = []
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      opened.push(this)
    })
    const { beside } = sideBySide()
    fireEvent.click(beside.getByRole("button", { name: "Attach" }))
    expect(opened).toHaveLength(1)
    expect(screen.getByTestId("beside").contains(opened[0])).toBe(true)
  })

  it("a file picked beside the page goes to the conversation beside the page", () => {
    sideBySide()
    const picker = screen.getByTestId("beside").querySelector<HTMLInputElement>('input[type="file"]')
    expect(picker).not.toBeNull()
    fireEvent.change(picker!, { target: { files: [new File(["plan"], "plan.txt", { type: "text/plain" })] } })
    expect(uploads).toEqual(["c2"])
  })

  it("a file over the upload limit picked with Attach goes nowhere, as a dropped or pasted one", () => {
    sideBySide()
    const picker = screen.getByTestId("beside").querySelector<HTMLInputElement>('input[type="file"]')
    fireEvent.change(picker!, { target: { files: [new File(["x".repeat(101)], "huge.bin")] } })
    expect(uploads).toEqual([])
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"

// The phone's message boxes read their draft with `|| {}`, a fresh object
// whenever there was no draft yet, so every change anywhere in the store
// (a typing event, a presence update, a message in another channel) redrew
// the box, editor and all. The channel's box also read the whole sidebar
// list for its channel's name, and that list changes with every unread
// count in every channel.

let editorDraws = 0
vi.mock("@/components/textInput/textInput", () => ({
  default: () => {
    editorDraws++
    return <div data-testid="editor" />
  },
}))
vi.mock("@/components/drawers/dragableDrawer", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock("@/components/command/CommandSurface", () => ({ default: ({ children }: { children?: React.ReactNode }) => <>{children}</> }))
vi.mock("@/components/ai/ComposerAIButton", () => ({ ComposerAIButton: () => null }))
vi.mock("@/components/ai/ChannelAgents", () => ({ useChannelAgents: () => [] }))
vi.mock("@/components/messages/scheduledMessagesBar", () => ({ ScheduledMessagesBar: () => null }))
vi.mock("@/components/fileUpload/channelFileUpload", () => ({ ChannelFileUpload: () => null }))
vi.mock("@/components/fileUpload/chatCommentFileUpload", () => ({ ChatCommentFileUpload: () => null }))
vi.mock("@/context/ScheduleSendContext", () => ({ useScheduleSend: () => undefined }))
vi.mock("@/hooks/usePublishTyping", () => ({ usePublishTyping: () => ({ publishTyping: () => {} }) }))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({}) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn() }) }))
const me = { data: { data: { user_uuid: "me" } } }
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined }), useFetchOnlyOnce: () => me }))
vi.mock("@/lib/celebrate", () => ({ celebrate: () => null }))

const { default: store } = await import("@/store/store")
const { createUserChannelList, incrementUserChannelUnread } = await import("@/store/slice/userSlice")
const { addChannelTyping } = await import("@/store/slice/typingSlice")
const { MobileChannelTextInput } = await import("@/components/textInput/mobileChannelTextInput")
const { MobileChatMessageTextInput } = await import("@/components/textInput/mobileChatMessageTextInput")

afterEach(() => {
  cleanup()
  editorDraws = 0
})

const channel = (uuid: string, name: string) => ({ ch_uuid: uuid, ch_name: name, unread_post_count: 0 }) as never

describe("a phone's message box with nothing typed yet", () => {
  it("in a channel, stays still while other channels get messages", () => {
    store.dispatch(createUserChannelList({ channelsUser: [channel("c1", "design"), channel("c2", "general")] } as never))
    render(<Provider store={store}><MobileChannelTextInput channelId="c1" handleSend={() => {}} /></Provider>)
    const drawn = editorDraws
    expect(drawn).toBeGreaterThan(0)
    for (let i = 0; i < 3; i++) act(() => void store.dispatch(incrementUserChannelUnread({ ch_uuid: "c2" })))
    act(() => void store.dispatch(addChannelTyping({ channelId: "c2", user: { user_uuid: "maya", user_name: "Maya Chen" } } as never)))
    expect(editorDraws).toBe(drawn)
  })

  it("in a thread, stays still while the rest of the app changes", () => {
    render(<Provider store={store}><MobileChatMessageTextInput chatId="maya" chatMessageUUID="m1" /></Provider>)
    const drawn = editorDraws
    expect(drawn).toBeGreaterThan(0)
    for (let i = 0; i < 3; i++) act(() => void store.dispatch(incrementUserChannelUnread({ ch_uuid: "c2" })))
    expect(editorDraws).toBe(drawn)
  })
})

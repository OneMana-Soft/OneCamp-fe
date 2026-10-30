import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import type { Editor } from "@tiptap/react"
import { SendHorizontal } from "@/lib/icons"
import { TooltipProvider } from "@/components/ui/tooltip"

// A command whose answer is a message (Giphy's Send, /shrug, /me) only wrote
// that message into the box's draft, in every view: Giphy's Send left the GIF
// in the box, unsent, and its card on screen (the owner, 23 Oct). It now goes
// out through the box's own send path, as the server means it to, when the box
// holds nothing. With words or files in the box, it joins them instead:
// nothing written is lost, and nothing is sent unseen.

const media = vi.hoisted(() => ({ isMobile: false }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: media.isMobile, isDesktop: !media.isMobile }) }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/hooks/useVoiceDictation", () => ({
  useVoiceDictation: () => ({ available: false, recording: false, transcribing: false, setup: { needed: false, sizeMb: null, progress: null }, start: vi.fn(), stop: vi.fn(), toggle: vi.fn() }),
  dictationLabel: () => "Dictate",
}))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}), useBotKind: () => undefined }))
const ME = "2f6b6c3a-1d8e-4c55-9a0b-7c1e2d3f4a5b"
// useMediaFetch: an image in a box (a GIF the box holds) asks for nothing here.
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: ME } } }),
  useMediaFetch: () => ({ data: undefined, isLoading: false }),
}))
// What a reply box's send path posts.
const sent = vi.hoisted(() => [] as Array<{ apiEndpoint: string; payload: Record<string, unknown> }>)
vi.mock("@/hooks/usePost", () => ({
  usePost: () => ({ isSubmitting: false, makeRequest: (req: { apiEndpoint: string; payload: Record<string, unknown> }) => (sent.push(req), new Promise(() => {})) }),
}))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({}) }))
vi.mock("next/navigation", async (actual) => ({ ...(await actual<typeof import("next/navigation")>()), useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }) }))
// A box's own extras (its AI draft, agents, file pickers and typing signal): not what these are about.
vi.mock("@/components/ai/ComposerAIButton", () => ({ ComposerAIButton: () => null }))
vi.mock("@/components/ai/ChannelAgents", () => ({ useChannelAgents: () => [] }))
vi.mock("@/components/fileUpload/channelCommentFileUpload", () => ({ ChannelCommentFileUpload: () => null }))
vi.mock("@/components/fileUpload/chatCommentFileUpload", () => ({ ChatCommentFileUpload: () => null }))
vi.mock("@/hooks/usePublishTyping", () => ({ usePublishTyping: () => ({ publishTyping: () => {} }) }))
vi.mock("@/lib/celebrateSoon", () => ({ celebrate: () => {} }))

const GIF = "https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif"
// As business/Command/giphy.go's giphy_send writes it.
const GIF_HTML = `<p><img src="${GIF}" alt="launch"/></p>`
vi.mock("@/services/commandService", () => ({
  fetchCommandCatalog: async () => ({
    commands: [
      { command: "giphy", description: "Search and send a GIF", usage_hint: "<search term>", is_builtin: true },
      { command: "shrug", description: "Append ¯\\_(ツ)_/¯", usage_hint: "[message]", is_builtin: true },
    ],
  }),
  // Giphy answers with its card; /shrug with the message to post, as builtins.go's handleShrug does.
  executeCommand: async (req: { command: string; text: string; trigger_id: string }) =>
    req.command === "giphy"
      ? {
          response_type: "ephemeral",
          trigger_id: req.trigger_id,
          blocks: [
            { type: "image", image_url: GIF, alt_text: "launch" },
            {
              type: "actions",
              elements: [
                { type: "button", text: { type: "plain_text", text: "Shuffle" }, action_id: "giphy_shuffle" },
                { type: "button", text: { type: "plain_text", text: "Send" }, action_id: "giphy_send", style: "primary" },
              ],
            },
          ],
        }
      : { response_type: "ephemeral", client_action: { type: "post_message", payload: { text: `${req.text} ¯\\_(ツ)_/¯` } } },
  // The card's Send: the GIF to post, replacing the card.
  interactCommand: async (req: { trigger_id: string }) => ({
    response_type: "ephemeral",
    replace_original: true,
    trigger_id: req.trigger_id,
    client_action: { type: "post_message", payload: { html: GIF_HTML } },
  }),
  newTriggerID: () => "trigger-1",
}))

// jsdom lays nothing out: ProseMirror measures ranges as it scrolls the caret into view.
if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
}

const { default: store } = await import("@/store/store")
const { default: MinimalTiptapTextInput } = await import("@/components/textInput/textInput")
const { ThreadReplyBox } = await import("@/components/conversation/ThreadReplyBox")
const { Composer } = await import("@/components/conversation/Composer")
const { ComposerHost } = await import("@/components/conversation/ComposerHost")
const { MobileChatMessageTextInput } = await import("@/components/textInput/mobileChatMessageTextInput")
const { LazyCommandSurface } = await import("@/components/command/LazyCommandSurface")
const { threadSurfaceKey } = await import("@/components/command/ThreadCommandSurface")
const { maybeDispatchSlashCommand } = await import("@/components/minimal-tiptap/extensions/slash-command/slashCommand")
const { getGroupingId } = await import("@/lib/utils/getGroupingId")
const { Toaster } = await import("@/components/ui/toaster")
const { dismissCard } = await import("@/store/slice/commandSlice")
// The surface's own code, in before the boxes draw, as a page's first command finds it.
await import("@/components/command/CommandSurface")

const LAUNCH = "c0ffee00-0000-4000-8000-00000000001a"
const MAYA = "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f"
const ROOT = "c0ffee00-0000-4000-8000-0000000000aa"

beforeEach(() => {
  sent.length = 0
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ""
  media.isMobile = false
  // The store outlives a test: each card goes with it.
  for (const surface of Object.keys(store.getState().command.cards)) store.dispatch(dismissCard({ surface_key: surface, trigger_id: "trigger-1" }))
})

const mount = (box: React.ReactNode) =>
  render(
    <Provider store={store}>
      <TooltipProvider>{box}</TooltipProvider>
    </Provider>,
  )

async function editorIn(container: HTMLElement): Promise<Editor> {
  return waitFor(() => {
    const pm = container.querySelector(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null
    expect(pm?.editor).toBeTruthy()
    return pm!.editor!
  }, { timeout: 5000 })
}

/** Runs a command in a surface as its box does on Enter, once its catalog is in. */
async function run(typed: string, surface: string) {
  await waitFor(() => expect(maybeDispatchSlashCommand(typed, {}, surface)).toBe(true), { timeout: 10_000 })
}

/** The Giphy card's own Send (the box's Send button is an icon named "Send", with no words). */
const cardSend = () => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Send")

async function sendTheGif(surface: string) {
  await run("/giphy launch", surface)
  const send = await waitFor(() => {
    const b = cardSend()
    expect(b).toBeTruthy()
    return b!
  })
  await act(async () => void fireEvent.click(send))
}

describe("a command's message (Giphy's Send, /shrug)", () => {
  it("goes out through a computer's message box beside its conversation, and the card goes", async () => {
    const posted = vi.fn()
    mount(
      <section>
        <LazyCommandSurface surfaceKey={LAUNCH} channelId={LAUNCH} />
        <div>
          <MinimalTiptapTextInput variant="chat" output="html" content="" editable ButtonIcon={SendHorizontal} buttonOnclick={posted} />
        </div>
      </section>,
    )
    await sendTheGif(LAUNCH)
    await waitFor(() => expect(posted).toHaveBeenCalledWith(GIF_HTML))
    expect(posted).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(cardSend()).toBeUndefined())
  }, 20_000)

  it("goes out through a thread's reply box, into that thread", async () => {
    mount(<ThreadReplyBox kind="channel" conversation={LAUNCH} thread={ROOT} channelName="launch" />)
    await sendTheGif(threadSurfaceKey(ROOT))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].payload).toMatchObject({ post_id: ROOT, comment_text_html: GIF_HTML })
  }, 20_000)

  it("goes out through a phone's message box", async () => {
    media.isMobile = true
    const handleSend = vi.fn(() => true)
    mount(
      <ComposerHost target={{ kind: "channel", id: LAUNCH }}>
        <Composer phone handleSend={handleSend} placeholder="Message #launch" />
      </ComposerHost>,
    )
    await sendTheGif(LAUNCH)
    await waitFor(() => expect(handleSend).toHaveBeenCalledWith(GIF_HTML))
  }, 20_000)

  it("goes out through a phone's thread page, into that thread", async () => {
    media.isMobile = true
    mount(<MobileChatMessageTextInput chatId={MAYA} chatMessageUUID={ROOT} />)
    await sendTheGif(threadSurfaceKey(ROOT))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].payload).toMatchObject({ comment_text_html: GIF_HTML })
    expect(JSON.stringify(sent[0].payload)).toContain(ROOT)
  }, 20_000)

  it("joins what's being written instead, so nothing is lost or sent unseen", async () => {
    const { container } = mount(<ThreadReplyBox kind="channel" conversation={LAUNCH} thread={ROOT} channelName="launch" />)
    const editor = await editorIn(container)
    await run("/giphy launch", threadSurfaceKey(ROOT))
    await waitFor(() => expect(cardSend()).toBeTruthy())
    await act(async () => void editor.chain().focus("end").insertContent("Look at this").run())
    await act(async () => void fireEvent.click(cardSend()!))
    await waitFor(() => expect(editor.getHTML()).toContain(`src="${GIF}"`))
    expect(editor.getHTML()).toContain("Look at this")
    expect(sent).toHaveLength(0)
  }, 20_000)

  it("posts /shrug's words as words, never as markup", async () => {
    const posted = vi.fn()
    mount(
      <section>
        <LazyCommandSurface surfaceKey={getGroupingId(MAYA, ME)} dmGroupId={getGroupingId(MAYA, ME)} />
        <div>
          <MinimalTiptapTextInput variant="chat" output="html" content="" editable ButtonIcon={SendHorizontal} buttonOnclick={posted} />
        </div>
      </section>,
    )
    await run("/shrug <b>fine</b>", getGroupingId(MAYA, ME))
    await waitFor(() => expect(posted).toHaveBeenCalledWith("<p>&lt;b&gt;fine&lt;/b&gt; ¯\\_(ツ)_/¯</p>"))
  }, 20_000)

  it("says so when no message box of its conversation is open", async () => {
    mount(
      <>
        <Toaster />
        <LazyCommandSurface surfaceKey={LAUNCH} channelId={LAUNCH} />
      </>,
    )
    await run("/shrug", LAUNCH)
    await waitFor(() => expect(document.body.textContent).toContain("Couldn't post that"))
  }, 20_000)
})

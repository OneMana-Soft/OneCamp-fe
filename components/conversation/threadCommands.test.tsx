import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { Provider } from "react-redux"
import type { Editor } from "@tiptap/react"
import { TooltipProvider } from "@/components/ui/tooltip"

// A thread's reply box found its commands through the conversation's own
// command surface, drawn by the conversation's view. A thread open without
// it had none: every thread on a phone (its own page, with no conversation
// view under it), and a thread open beside another screen. Each reply box now
// has its own surface: the conversation's commands, run in that thread
// (thread_ts), answered above that box, and registered apart from the
// conversation's, so closing a thread leaves the conversation's commands be.

const media = vi.hoisted(() => ({ isMobile: false }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: media.isMobile, isDesktop: !media.isMobile }) }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/hooks/useVoiceDictation", () => ({
  useVoiceDictation: () => ({ available: false, recording: false, transcribing: false, setup: { needed: false, sizeMb: null, progress: null }, start: vi.fn(), stop: vi.fn(), toggle: vi.fn() }),
  dictationLabel: () => "Dictate",
}))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}), useBotKind: () => undefined }))
const ME = "2f6b6c3a-1d8e-4c55-9a0b-7c1e2d3f4a5b"
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined }), useFetchOnlyOnce: () => ({ data: { data: { user_uuid: ME } } }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ isSubmitting: false, makeRequest: () => new Promise(() => {}) }) }))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({}) }))
vi.mock("next/navigation", async (actual) => ({ ...(await actual<typeof import("next/navigation")>()), useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }) }))
// A reply's file picker, which reads the workspace's upload limit: not what these are about.
vi.mock("@/components/fileUpload/channelCommentFileUpload", () => ({ ChannelCommentFileUpload: () => null }))
vi.mock("@/components/fileUpload/chatCommentFileUpload", () => ({ ChatCommentFileUpload: () => null }))
vi.mock("@/components/fileUpload/groupChatCommentFileUpload", () => ({ GroupChatCommentFileUpload: () => null }))
const ran = vi.hoisted(() => [] as Array<Record<string, unknown>>)
vi.mock("@/services/commandService", () => ({
  fetchCommandCatalog: async () => ({
    commands: [
      { command: "giphy", description: "Search and send a GIF", usage_hint: "<search term>", is_builtin: true },
      { command: "poll", description: "Create a quick poll", usage_hint: '"Question?" "Option 1"', is_builtin: true },
      { command: "remind", description: "Set a reminder", usage_hint: "<what> <when>", is_builtin: true },
      { command: "shortcuts", description: "View keyboard shortcuts", is_builtin: true },
    ],
  }),
  executeCommand: async (req: Record<string, unknown>) => {
    ran.push(req)
    return { response_type: "ephemeral", text: `Ran /${req.command}` }
  },
  interactCommand: async () => ({}),
  newTriggerID: () => "trigger-1",
}))

// jsdom lays nothing out: ProseMirror measures ranges as it scrolls the caret into view.
if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
}

const { default: store } = await import("@/store/store")
const { ThreadReplyBox } = await import("./ThreadReplyBox")
const { MobileChannelPostTextInput } = await import("@/components/textInput/mobileChannelPostTextInput")
const { MobileChatMessageTextInput } = await import("@/components/textInput/mobileChatMessageTextInput")
const { MobileGroupChatMessageTextInput } = await import("@/components/textInput/mobileGroupChatMessageTextInput")
const { LazyCommandSurface } = await import("@/components/command/LazyCommandSurface")
// The surface's own code, in before the boxes draw, as a page's first "/" finds it.
await import("@/components/command/CommandSurface")

const LAUNCH = "c0ffee00-0000-4000-8000-00000000001a"
const MAYA = "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f"
const CREW = "c0ffee00-0000-4000-8000-00000000002b"
// A thread of its own for each test: the composers keep a thread's draft in the
// store, which every test shares, so a draft one test left ("/", or the clear
// after a pick) was put back into the next test's box and, through its
// throttled onChange, wiped the "/" just typed (jsdom reports the editor
// unfocused right after focus, so the parent's copy wins).
let threads = 0x100
let ROOT = ""

beforeEach(() => {
  ran.length = 0
  ROOT = `c0ffee00-0000-4000-8000-000000000${(threads++).toString(16)}`
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ""
  media.isMobile = false
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

// The surface's code and catalog come after the box; the open menu takes them
// in when they come, so "/" is typed once and the rows are awaited by role.
const WAIT = { timeout: 25_000 }
const named = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"))

async function type(editor: Editor, text: string) {
  await act(async () => {
    editor.commands.clearContent()
    editor.chain().focus("end").insertContent(text).run()
  })
}

/** Types `text` once and waits until the conversation's command menu offers `rows`; returns the first. */
async function offering(editor: Editor, text: string, rows: string[]): Promise<HTMLElement> {
  await type(editor, text)
  const list = await screen.findByRole("listbox", { name: "Commands" }, WAIT)
  const found = await Promise.all(rows.map((r) => within(list).findByRole("option", { name: named(r) }, WAIT)))
  return found[0]
}

/** Types "/" and waits until the menu offers the conversation's commands. */
async function offered(editor: Editor) {
  await offering(editor, "/", ["/giphy", "/poll", "/remind"])
}

/** Types the command and picks its row. */
async function pick(editor: Editor, title: string) {
  const row = await offering(editor, title, [title])
  await act(async () => void fireEvent.click(row))
}

describe("a thread's reply box", () => {
  it("offers its conversation's commands with no conversation view beside it", async () => {
    const { container } = mount(<ThreadReplyBox kind="channel" conversation={LAUNCH} thread={ROOT} channelName="launch" />)
    await offered(await editorIn(container))
  }, 30_000)

  it("runs a command in its conversation, in its thread", async () => {
    const { container } = mount(<ThreadReplyBox kind="channel" conversation={LAUNCH} thread={ROOT} channelName="launch" />)
    const editor = await editorIn(container)
    await offered(editor)
    await pick(editor, "/shortcuts")
    await waitFor(() => expect(ran).toEqual([expect.objectContaining({ command: "shortcuts", channel_id: LAUNCH, thread_ts: ROOT })]), WAIT)
  }, 30_000)

  it("leaves the conversation's own commands when it closes beside it", async () => {
    // The channel's view: its command surface (its message box isn't needed here).
    const conversation = mount(<LazyCommandSurface surfaceKey={LAUNCH} channelId={LAUNCH} />)
    const thread = mount(<ThreadReplyBox kind="channel" conversation={LAUNCH} thread={ROOT} channelName="launch" />)
    const editor = await editorIn(thread.container)
    await offered(editor)
    await pick(editor, "/shortcuts")
    await waitFor(() => expect(ran).toHaveLength(1), WAIT)
    expect(ran[0]).toMatchObject({ thread_ts: ROOT })
    thread.unmount()
    const { maybeDispatchSlashCommand } = await import("@/components/minimal-tiptap/extensions/slash-command/slashCommand")
    await act(async () => void maybeDispatchSlashCommand("/shortcuts", {}, LAUNCH))
    await waitFor(() => expect(ran).toHaveLength(2), WAIT)
    expect(ran[1]).toMatchObject({ command: "shortcuts", channel_id: LAUNCH })
    expect(ran[1].thread_ts).toBeUndefined()
    conversation.unmount()
  }, 30_000)
})

describe("a phone's thread page", () => {
  const PHONE_BOXES = {
    "a channel's": () => <MobileChannelPostTextInput channelId={LAUNCH} postUUID={ROOT} />,
    "a DM's": () => <MobileChatMessageTextInput chatId={MAYA} chatMessageUUID={ROOT} />,
    "a group's": () => <MobileGroupChatMessageTextInput grpId={CREW} chatMessageUUID={ROOT} />,
  }
  const WHERE = {
    "a channel's": { channel_id: LAUNCH },
    // The DM's grouping: both people, as getGroupingId writes it.
    "a DM's": { dm_group_id: [ME, MAYA].sort().join(" ") },
    "a group's": { dm_group_id: CREW },
  }
  for (const [kind, box] of Object.entries(PHONE_BOXES)) {
    it(`offers ${kind} commands in its reply box, and runs them in that thread`, async () => {
      media.isMobile = true
      const { container } = mount(box())
      const editor = await editorIn(container)
      await offered(editor)
      await pick(editor, "/shortcuts")
      await waitFor(() => expect(ran).toEqual([expect.objectContaining({ command: "shortcuts", thread_ts: ROOT, ...WHERE[kind as keyof typeof WHERE] })]), WAIT)
    }, 30_000)
  }
})

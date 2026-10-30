import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { SWRConfig } from "swr"
import type { Editor } from "@tiptap/react"
import type { ConversationRef } from "@/lib/conversation/types"
import { TooltipProvider } from "@/components/ui/tooltip"

// From 12 Oct to 23 Oct no message box offered a single command in its "/"
// menu, only formatting: /giphy, /remind, /poll and every installed app's
// commands were in no menu (the owner, 23 Oct). The slash extension took "its
// host gives its own list" to mean "a doc" and left the conversation's
// commands out, and every message box gives its own list (CHAT_COMMANDS). The
// menu still read "Commands", since the conversation's commands were found
// before they were left out, and the tests asked the menu's items directly,
// never the extension a message box is built with. These build every message
// box the app draws, as it draws it: each composer with its own command
// surface and runner, a conversation's and its threads', on a computer and on
// a phone (12; the regression audit, 23 Oct).

const media = vi.hoisted(() => ({ isMobile: false }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: media.isMobile, isDesktop: !media.isMobile }) }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/hooks/useVoiceDictation", () => ({
  useVoiceDictation: () => ({ available: false, recording: false, transcribing: false, setup: { needed: false, sizeMb: null, progress: null }, start: vi.fn(), stop: vi.fn(), toggle: vi.fn() }),
  dictationLabel: () => "Dictate",
}))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}), useBotKind: () => undefined }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined }), useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))
// A composer's own extras (its AI draft, agents, file pickers and typing signal): not what these are about.
vi.mock("@/components/ai/ComposerAIButton", () => ({ ComposerAIButton: () => null }))
vi.mock("@/components/ai/ChannelAgents", () => ({ useChannelAgents: () => [] }))
vi.mock("@/components/ai/PendingActionsTray", () => ({ default: () => null }))
vi.mock("@/components/fileUpload/channelCommentFileUpload", () => ({ ChannelCommentFileUpload: () => null }))
vi.mock("@/components/fileUpload/chatCommentFileUpload", () => ({ ChatCommentFileUpload: () => null }))
vi.mock("@/components/fileUpload/groupChatCommentFileUpload", () => ({ GroupChatCommentFileUpload: () => null }))
vi.mock("@/hooks/usePublishTyping", () => ({ usePublishTyping: () => ({ publishTyping: () => {} }) }))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({}) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ isSubmitting: false, makeRequest: () => new Promise(() => {}) }) }))
// Each composer draws its conversation's surface, whose runner reads the catalog (and holds the router).
vi.mock("next/navigation", async (actual) => ({ ...(await actual<typeof import("next/navigation")>()), useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }) }))
const ran = vi.hoisted(() => [] as Array<Record<string, unknown>>)
// The catalog's answer, held while a test keeps it on the way, or refused.
const catalog = vi.hoisted(() => ({ held: undefined as Promise<void> | undefined, refused: false, refusals: 0 }))
vi.mock("@/services/commandService", () => ({
  fetchCommandCatalog: async () => {
    await catalog.held
    if (catalog.refused) {
      catalog.refusals++
      throw new Error("Network Error")
    }
    return { commands: CATALOG }
  },
  executeCommand: async (req: Record<string, unknown>) => {
    ran.push(req)
    return { response_type: "ephemeral", text: "" }
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
const { setBackendCommandProvider } = await import("@/components/command/commandItems")
const { extensionsFor, loadBlocks } = await import("@/components/docEditor/registry/factory")
const { Editor: TiptapEditor, EditorContent } = await import("@tiptap/react")
await import("@/components/docEditor/registry")
const { Composer } = await import("@/components/conversation/Composer")
const { ComposerHost } = await import("@/components/conversation/ComposerHost")
const { getGroupingId } = await import("@/lib/utils/getGroupingId")
const { ThreadReplyBox } = await import("@/components/conversation/ThreadReplyBox")
const { MobileChannelPostTextInput } = await import("./mobileChannelPostTextInput")
const { MobileChatMessageTextInput } = await import("./mobileChatMessageTextInput")
const { MobileGroupChatMessageTextInput } = await import("./mobileGroupChatMessageTextInput")

const LAUNCH = "c0ffee00-0000-4000-8000-00000000001a"
const MAYA = "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f"
const CREW = "c0ffee00-0000-4000-8000-00000000002b"
const ROOT = "c0ffee00-0000-4000-8000-0000000000aa"

// What the conversation's catalog holds: built-ins, Giphy, and an installed app's own command.
const CATALOG = vi.hoisted(() => [
  { command: "giphy", description: "Search and send a GIF", usage_hint: "<search term>", is_builtin: true },
  { command: "poll", description: "Create a quick poll", usage_hint: '"Question?" "Option 1" "Option 2"', is_builtin: true },
  { command: "remind", description: "Set a reminder", usage_hint: "[me|@who|#channel] <what> <when>", is_builtin: true },
  { command: "shortcuts", description: "View keyboard shortcuts", is_builtin: true },
  { command: "standup", description: "Post your standup", usage_hint: "<notes>", app_name: "Standup", is_builtin: false },
])

afterEach(() => {
  ran.length = 0
  catalog.held = undefined
  catalog.refused = false
  catalog.refusals = 0
  cleanup()
  document.body.innerHTML = ""
  media.isMobile = false
})

// Every message box the app draws, with the command surface it draws: a
// conversation's one composer (CommandSurface beside its box), in the host its
// page draws, and its threads' reply boxes (ThreadCommandSurface on theirs).
const conversationBox = (target: ConversationRef, phone = false) => (
  <ComposerHost target={target}>
    <Composer handleSend={() => true} placeholder="Message" phone={phone} />
  </ComposerHost>
)
const CHANNEL: ConversationRef = { kind: "channel", id: LAUNCH }
const DM: ConversationRef = { kind: "dm", id: getGroupingId("me", MAYA), other: MAYA }
const GROUP: ConversationRef = { kind: "group", id: CREW }
const COMPOSERS = {
  computer: {
    "a channel's": () => conversationBox(CHANNEL),
    "a DM's": () => conversationBox(DM),
    "a group's": () => conversationBox(GROUP),
    "a channel thread's": () => <ThreadReplyBox kind="channel" conversation={LAUNCH} thread={ROOT} channelName="launch" />,
    "a DM thread's": () => <ThreadReplyBox kind="dm" conversation={MAYA} thread={ROOT} />,
    "a group thread's": () => <ThreadReplyBox kind="group" conversation={CREW} thread={ROOT} />,
  },
  phone: {
    "a channel's": () => conversationBox(CHANNEL, true),
    "a DM's": () => conversationBox(DM, true),
    "a group's": () => conversationBox(GROUP, true),
    "a channel thread's": () => <MobileChannelPostTextInput channelId={LAUNCH} postUUID={ROOT} />,
    "a DM thread's": () => <MobileChatMessageTextInput chatId={MAYA} chatMessageUUID={ROOT} />,
    "a group thread's": () => <MobileGroupChatMessageTextInput grpId={CREW} chatMessageUUID={ROOT} />,
  },
}

// Each with its own cache, so each reads its conversation's catalog afresh.
const mount = (box: React.ReactNode) =>
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <Provider store={store}>
        <TooltipProvider>{box}</TooltipProvider>
      </Provider>
    </SWRConfig>,
  )

async function editorIn(container: HTMLElement): Promise<Editor> {
  return waitFor(() => {
    const pm = container.querySelector(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null
    expect(pm?.editor).toBeTruthy()
    return pm!.editor!
  }, { timeout: 5000 })
}

async function type(editor: Editor, text: string) {
  await act(async () => {
    editor.commands.clearContent()
    editor.chain().focus("end").insertContent(text).run()
  })
}

const menu = () => document.querySelector("[data-slash-menu]") as HTMLElement | null
const rows = () => [...(menu()?.querySelectorAll('[role="option"]') ?? [])] as HTMLElement[]

/**
 * Types `text` once, then waits in the open menu until it offers `row`: the
 * surface's code and catalog come after the box draws, and typing again would
 * hide a menu that never takes them in.
 */
async function offering(editor: Editor, text: string, row: string): Promise<HTMLElement> {
  await type(editor, text)
  return waitFor(
    () => {
      const found = rows().find((r) => r.textContent?.includes(row))
      expect(found).toBeTruthy()
      return found!
    },
    { timeout: 10_000 },
  )
}

describe("a message box's \"/\" menu", () => {
  for (const [device, composers] of Object.entries(COMPOSERS)) {
    for (const [kind, composer] of Object.entries(composers)) {
      it(`offers ${kind} commands, an installed app's among them, on a ${device}`, async () => {
        media.isMobile = device === "phone"
        const { container } = mount(composer())
        // The installed app's command (standup) among the built-ins.
        await offering(await editorIn(container), "/", "/standup")
        expect(menu()!.querySelector('[role="listbox"]')!.getAttribute("aria-label")).toBe("Commands")
        for (const c of ["/giphy", "/poll", "/remind"]) expect(rows().some((r) => r.textContent?.includes(c))).toBe(true)
        // Formatting stays, after the commands.
        expect(menu()!.textContent).toContain("Bold")
      }, 20_000)

      // The owner's report again (23 Oct): a "/" typed before the catalog
      // came offered formatting alone, and stayed so.
      it(`takes ${kind} commands in when they come after its menu opened, on a ${device}`, async () => {
        media.isMobile = device === "phone"
        let release = () => {}
        catalog.held = new Promise<void>((r) => (release = r))
        const { container } = mount(composer())
        const editor = await editorIn(container)
        await type(editor, "/")
        await waitFor(() => expect(menu()).toBeTruthy())
        expect(rows().some((r) => r.textContent?.includes("/standup"))).toBe(false)
        await act(async () => release())
        // The same menu, still open, with nothing typed again.
        await waitFor(() => expect(rows().some((r) => r.textContent?.includes("/standup"))).toBe(true), { timeout: 5000 })
        expect(menu()!.querySelector('[role="listbox"]')!.getAttribute("aria-label")).toBe("Commands")
      }, 20_000)
    }
  }

  // CR-17 (23 Oct): the runner offered its commands before they came, so the
  // menu said "Commands" over formatting alone while they were on their way,
  // and for good when they couldn't be read.
  const label = () => menu()!.querySelector('[role="listbox"]')!.getAttribute("aria-label")
  /** Mounts a channel's box, its runner's code in, and opens its "/" menu. */
  async function openedMenu() {
    const { container } = mount(COMPOSERS.computer["a channel's"]())
    const editor = await editorIn(container)
    await waitFor(() => expect(document.querySelector("[data-command-surface]")).toBeTruthy(), { timeout: 5000 })
    await type(editor, "/")
    await waitFor(() => expect(menu()).toBeTruthy())
  }

  it("says Commands only once the conversation's commands are in", async () => {
    let release = () => {}
    catalog.held = new Promise<void>((r) => (release = r))
    await openedMenu()
    expect(label()).toBe("Insert a block")
    await act(async () => release())
    await waitFor(() => expect(label()).toBe("Commands"), { timeout: 5000 })
  }, 20_000)

  it("stays a block menu when the conversation's commands can't be read", async () => {
    catalog.refused = true
    await openedMenu()
    await waitFor(() => expect(catalog.refusals).toBeGreaterThan(0))
    expect(label()).toBe("Insert a block")
  }, 20_000)

  it("runs a command picked from the menu in the conversation it was picked in", async () => {
    const { container } = mount(COMPOSERS.computer["a channel's"]())
    const row = await offering(await editorIn(container), "/shortcuts", "/shortcuts")
    fireEvent.click(row)
    await waitFor(() => expect(ran).toEqual([expect.objectContaining({ command: "shortcuts", channel_id: LAUNCH })]))
  }, 20_000)

  // how-docs-work N6: a doc's "/" never offers a conversation's commands, even
  // inside a conversation's surface, as a doc opened beside a thread can be.
  it("leaves them out of a doc's menu, which stays a block menu", async () => {
    // As the conversation's command runner registers it (useCommandRunner), for its surface only.
    const removeProvider = setBackendCommandProvider((q) => CATALOG.filter((c) => c.command.includes(q.toLowerCase())), LAUNCH)
    await loadBlocks("doc", { ai: false })
    const doc = new TiptapEditor({
      extensions: extensionsFor({ kind: "doc", gate: { ai: false }, placeholderOf: () => "", toast: () => {} }),
      content: "<p></p>",
    })
    try {
      render(
        <section>
          <span hidden data-command-surface={LAUNCH} />
          <div>
            <EditorContent editor={doc} />
          </div>
        </section>,
      )
      await type(doc, "/")
      await waitFor(() => expect(menu()).toBeTruthy())
      expect(menu()!.querySelector('[role="listbox"]')!.getAttribute("aria-label")).toBe("Insert a block")
      for (const c of ["/giphy", "/poll", "/remind", "/standup"]) expect(menu()!.textContent).not.toContain(c)
    } finally {
      doc.destroy()
      removeProvider()
    }
  })
})

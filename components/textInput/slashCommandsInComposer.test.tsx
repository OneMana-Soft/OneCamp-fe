import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { SWRConfig } from "swr"
import type { Editor } from "@tiptap/react"
import { SendHorizontal } from "@/lib/icons"
import { TooltipProvider } from "@/components/ui/tooltip"

// From 12 Oct to 23 Oct no message box offered a single command in its "/"
// menu, only formatting: /giphy, /remind, /poll and every installed app's
// commands were in no menu (the owner, 23 Oct). The slash extension took "its
// host gives its own list" to mean "a doc" and left the conversation's
// commands out, and every message box gives its own list (CHAT_COMMANDS). The
// menu still read "Commands", since the conversation's commands were found
// before they were left out, and the tests asked the menu's items directly,
// never the extension a message box is built with. These build the real
// message box in each place the app puts one.

const media = vi.hoisted(() => ({ isMobile: false }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: media.isMobile, isDesktop: !media.isMobile }) }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/hooks/useVoiceDictation", () => ({
  useVoiceDictation: () => ({ available: false, recording: false, transcribing: false, setup: { needed: false, sizeMb: null, progress: null }, start: vi.fn(), stop: vi.fn(), toggle: vi.fn() }),
  dictationLabel: () => "Dictate",
}))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}), useBotKind: () => undefined }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined }), useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))
// A conversation's runner (CommandSurface) reads its catalog; the answer is held while a test keeps it on the way.
const catalog = vi.hoisted(() => ({ held: undefined as Promise<void> | undefined }))
vi.mock("@/services/commandService", () => ({
  fetchCommandCatalog: async () => {
    await catalog.held
    return { commands: CATALOG }
  },
  executeCommand: async () => ({ response_type: "ephemeral", text: "" }),
  interactCommand: async () => ({}),
  newTriggerID: () => "trigger-1",
}))
vi.mock("next/navigation", async (actual) => ({ ...(await actual<typeof import("next/navigation")>()), useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }) }))

// jsdom lays nothing out: ProseMirror measures ranges as it scrolls the caret into view.
if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
}

const { default: store } = await import("@/store/store")
const { default: MinimalTiptapTextInput } = await import("./textInput")
const { setBackendCommandProvider } = await import("@/components/minimal-tiptap/extensions/slash-command/slashCommand")
const { default: CommandSurface } = await import("@/components/command/CommandSurface")
const { extensionsFor, loadBlocks } = await import("@/components/docEditor/registry/factory")
const { Editor: TiptapEditor, EditorContent } = await import("@tiptap/react")
await import("@/components/docEditor/registry")

const LAUNCH = "c0ffee00-0000-4000-8000-00000000001a"

// What the conversation's catalog holds: built-ins, Giphy, and an installed app's own command.
const CATALOG = [
  { command: "giphy", description: "Search and send a GIF", usage_hint: "<search term>", is_builtin: true },
  { command: "poll", description: "Create a quick poll", usage_hint: '"Question?" "Option 1" "Option 2"', is_builtin: true },
  { command: "remind", description: "Set a reminder", usage_hint: "[me|@who|#channel] <what> <when>", is_builtin: true },
  { command: "shortcuts", description: "View keyboard shortcuts", is_builtin: true },
  { command: "standup", description: "Post your standup", usage_hint: "<notes>", app_name: "Standup", is_builtin: false },
]

let removeProvider = () => {}
beforeEach(() => {
  // As the conversation's command runner registers it (useCommandRunner), for its surface only.
  removeProvider = setBackendCommandProvider((q) => CATALOG.filter((c) => c.command.includes(q.toLowerCase())), LAUNCH)
})
afterEach(() => {
  removeProvider()
  catalog.held = undefined
  cleanup()
  document.body.innerHTML = ""
  media.isMobile = false
})

const box = () => <MinimalTiptapTextInput variant="chat" output="html" content="" editable ButtonIcon={SendHorizontal} buttonOnclick={() => {}} />

// Where the app puts a message box: its conversation's surface marked beside it
// (the channel, DM and group composers, on a computer and a phone: CommandSurface),
// or on the box's own wrapper (the thread's reply box: ThreadReplyBox).
const PLACES = {
  "beside the box (channel, DM, group)": () => (
    <section>
      <span hidden data-command-surface={LAUNCH} />
      <div>{box()}</div>
    </section>
  ),
  "on the box's wrapper (a thread's reply)": () => <div data-command-surface={LAUNCH}>{box()}</div>,
}

async function editorIn(container: HTMLElement): Promise<Editor> {
  return waitFor(() => {
    const pm = container.querySelector(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null
    expect(pm?.editor).toBeTruthy()
    return pm!.editor!
  })
}

async function type(editor: Editor, text: string) {
  await act(async () => {
    editor.chain().focus("end").insertContent(text).run()
    await new Promise((r) => setTimeout(r, 50))
  })
}

const menu = () => document.querySelector("[data-slash-menu]") as HTMLElement | null

describe("a message box's \"/\" menu", () => {
  for (const [place, layout] of Object.entries(PLACES)) {
    for (const phone of [false, true]) {
      it(`offers its conversation's commands, ${place}, on a ${phone ? "phone" : "computer"}`, async () => {
        media.isMobile = phone
        const { container } = render(
          <Provider store={store}>
            <TooltipProvider>{layout()}</TooltipProvider>
          </Provider>,
        )
        const editor = await editorIn(container)
        await type(editor, "/")
        await waitFor(() => expect(menu()).toBeTruthy())
        expect(menu()!.querySelector('[role="listbox"]')!.getAttribute("aria-label")).toBe("Commands")
        for (const c of ["/giphy", "/poll", "/remind", "/standup"]) expect(menu()!.textContent).toContain(c)
        // Formatting stays, after the commands.
        expect(menu()!.textContent).toContain("Bold")
      })
    }
  }

  // The owner's report again (23 Oct): a "/" typed before the conversation's
  // commands came (a DM as it opens) offered formatting alone, and stayed so.
  it("takes in its conversation's commands when they come after its menu opened", async () => {
    removeProvider()
    let release = () => {}
    catalog.held = new Promise<void>((r) => (release = r))
    const { container } = render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <Provider store={store}>
          <TooltipProvider>
            <section>
              <CommandSurface surfaceKey={LAUNCH} channelId={LAUNCH} />
              <div>{box()}</div>
            </section>
          </TooltipProvider>
        </Provider>
      </SWRConfig>,
    )
    const editor = await editorIn(container)
    await type(editor, "/")
    await waitFor(() => expect(menu()).toBeTruthy())
    expect(menu()!.textContent).not.toContain("/standup")
    await act(async () => release())
    // The same menu, still open, with nothing typed again.
    await waitFor(() => expect(menu()!.textContent).toContain("/standup"))
  })

  it("runs a command picked from the menu in the conversation it was picked in", async () => {
    const ran: Array<{ command: string; surface: string | null }> = []
    const onCommand = (e: Event) => ran.push((e as CustomEvent).detail)
    window.addEventListener("chat-slash-command", onCommand)
    try {
      const { container } = render(
        <Provider store={store}>
          <TooltipProvider>{PLACES["beside the box (channel, DM, group)"]()}</TooltipProvider>
        </Provider>,
      )
      const editor = await editorIn(container)
      await type(editor, "/shortcuts")
      const row = await waitFor(() => {
        const r = [...menu()!.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes("/shortcuts"))
        expect(r).toBeTruthy()
        return r as HTMLElement
      })
      fireEvent.click(row)
      expect(ran).toEqual([expect.objectContaining({ command: "shortcuts", surface: LAUNCH })])
    } finally {
      window.removeEventListener("chat-slash-command", onCommand)
    }
  })

  // how-docs-work N6: a doc's "/" never offers a conversation's commands, even
  // inside a conversation's surface, as a doc opened beside a thread can be.
  it("leaves them out of a doc's menu, which stays a block menu", async () => {
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
    }
  })
})

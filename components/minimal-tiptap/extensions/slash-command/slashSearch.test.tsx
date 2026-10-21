import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { installRangeRects } from "@/lib/testing/rangeRects"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { Editor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { Mention } from "@tiptap/extension-mention"

import { SlashCommand } from "./slashCommandExtension"
import { CHAT_COMMANDS, setBackendCommandProvider, slashCommandSuggestion, type BackendCommandEntry } from "./slashCommand"
import "@/components/docEditor/registry"
import { slashItemsFor } from "@/components/docEditor/registry/readers"

// A doc's "/" in the AI edition, as the registry offers it.
const DOC_SLASH_COMMANDS = slashItemsFor("doc", { ai: true })
import { suggestionMenuOpen } from "../suggestion-popup"
import { EmojiSuggest } from "../emoji-suggest/emojiSuggest"

// The "/" menu, and the menus that work like it ("@", ":").
//
// - Tiptap's query is what follows the "/", and the search cut its first
//   letter off: "/img" and "/todo" found nothing, "/he" listed everything,
//   and the chat's own commands were asked for the clipped word too.
// - A cap of 16 hid the AI items and the last formatting ones.
// - Escape hid the menu but the menu kept the keys: Escape then Enter
//   inserted the item nobody could see.
// - Nothing told a screen reader which item was highlighted.
// - The menus opened inside code.

const users = [
  { user_uuid: "u-sam", uid: "0x1", user_full_name: "Sam Rivera", user_name: "sam", is_bot: false },
  { user_uuid: "u-maya", uid: "0x2", user_full_name: "Maya Chen", user_name: "maya", is_bot: false },
]
vi.mock("@/lib/axiosInstance", () => ({
  default: { get: vi.fn(async () => ({ status: 200, data: { users } })), post: vi.fn(async () => ({ data: {} })) },
}))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => undefined }))

import { mentionSuggestionOptions } from "../mention-list/mentionList"

// jsdom lays nothing out: ProseMirror measures ranges as it scrolls the caret
// into view (lib/testing/rangeRects).
let restoreRects = () => {}
beforeAll(() => {
  restoreRects = installRangeRects()
})
afterAll(() => restoreRects())

const titles = (q: string) => slashCommandSuggestion.items({ query: q, commands: DOC_SLASH_COMMANDS }).map((i) => i.title)

describe("searching the / menu", () => {
  it("counts every letter typed after the slash", () => {
    expect(titles("he")).toEqual(["Heading 1", "Heading 2", "Heading 3", "Heading 4", "Toggle heading 1", "Toggle heading 2", "Toggle heading 3"])
    expect(titles("img")[0]).toBe("Image")
    expect(titles("todo")[0]).toBe("To-do list")
    expect(titles("h1")[0]).toBe("Heading 1")
    expect(titles("#")).toEqual(["Heading 1", "Heading 2", "Heading 3", "Heading 4"])
    expect(titles("div")[0]).toBe("Divider")
    expect(titles("num")[0]).toBe("Numbered list")
    expect(titles("quote")[0]).toBe("Quote")
    expect(titles("toggle")[0]).toBe("Toggle list")
  })

  it("finds the AI items, and offers every block when nothing is typed", () => {
    expect(titles("ai")).toEqual(["Write with AI", "Summarise with AI"])
    const all = titles("")
    expect(all).toHaveLength(DOC_SLASH_COMMANDS.length)
    expect(all).toEqual(expect.arrayContaining(["Write with AI", "Summarise with AI", "Strikethrough", "Inline code", "Clear formatting"]))
  })

  it("asks the chat's commands for the whole word, not the word without its first letter", () => {
    const provider = vi.fn((q: string): BackendCommandEntry[] => (q ? [{ command: "remind", description: "Set a reminder", is_builtin: true }] : []))
    setBackendCommandProvider(provider)
    try {
      const found = slashCommandSuggestion.items({ query: "remind", commands: CHAT_COMMANDS })
      expect(provider).toHaveBeenCalledWith("remind")
      expect(found[0].title).toBe("/remind")
    } finally {
      setBackendCommandProvider(null)
    }
  })
})

const editors: Editor[] = []
afterEach(() => {
  cleanup()
  while (editors.length) editors.pop()?.destroy()
  document.body.innerHTML = ""
})

async function mountEditor(content = "<p></p>") {
  const editor = new Editor({
    extensions: [
      StarterKit,
      SlashCommand.configure({ commands: DOC_SLASH_COMMANDS }),
      Mention.configure({ suggestion: mentionSuggestionOptions }),
      EmojiSuggest,
    ],
    content,
  })
  editors.push(editor)
  render(<EditorContent editor={editor} />)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
  return editor
}

async function typeInto(editor: Editor, text: string) {
  await act(async () => {
    editor.chain().focus("end").insertContent(text).run()
    await new Promise((r) => setTimeout(r, 40))
  })
}

function press(editor: Editor, key: string) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  act(() => {
    editor.view.dom.dispatchEvent(event)
  })
  return event
}

describe("a suggestion menu's keys", () => {
  it("Escape closes the / menu for good: Enter then makes a new line, not the hidden block", async () => {
    const editor = await mountEditor()
    await typeInto(editor, "/quo")
    expect(document.querySelector("[data-slash-menu]")).toBeTruthy()
    expect(suggestionMenuOpen(editor)).toBe(true)

    expect(press(editor, "Escape").defaultPrevented).toBe(true)
    expect(suggestionMenuOpen(editor)).toBe(false)
    press(editor, "Enter")
    // No quote block: the typed text stays, and Enter split the line.
    expect(editor.getJSON().content?.some((n) => n.type === "blockquote")).toBe(false)
    expect(editor.getText()).toContain("/quo")
    expect(editor.getJSON().content).toHaveLength(2)
    // A second Escape is the page's (it isn't taken).
    expect(press(editor, "Escape").defaultPrevented).toBe(false)
  })

  it("Escape closes the @ menu for good too", async () => {
    const editor = await mountEditor()
    await typeInto(editor, "@Sa")
    // The list's view loads when it first opens.
    await waitFor(() => expect(document.querySelector("[data-mention-list]")).toBeTruthy(), { timeout: 5000 })
    press(editor, "Escape")
    press(editor, "Enter")
    expect(JSON.stringify(editor.getJSON())).not.toContain('"type":"mention"')
  })

  it("Enter still picks while the menu shows", async () => {
    const editor = await mountEditor()
    await typeInto(editor, "/h2")
    press(editor, "Enter")
    expect(editor.getJSON().content?.[0]).toEqual(expect.objectContaining({ type: "heading", attrs: { level: 2 } }))
  })
})

describe("a suggestion menu, announced", () => {
  it("points the editor at the list and its highlighted option, and lets go when it closes", async () => {
    const editor = await mountEditor()
    await typeInto(editor, "/")
    const dom = editor.view.dom
    const listbox = document.querySelector('[data-slash-menu] [role="listbox"]')!
    expect(dom.getAttribute("aria-controls")).toBe(listbox.id)
    expect(dom.getAttribute("aria-autocomplete")).toBe("list")
    const first = dom.getAttribute("aria-activedescendant")
    expect(document.getElementById(first!)?.getAttribute("aria-selected")).toBe("true")

    press(editor, "ArrowDown")
    const second = dom.getAttribute("aria-activedescendant")
    expect(second).not.toBe(first)
    expect(document.getElementById(second!)?.getAttribute("aria-selected")).toBe("true")

    press(editor, "Escape")
    expect(dom.hasAttribute("aria-controls")).toBe(false)
    expect(dom.hasAttribute("aria-activedescendant")).toBe(false)
  })
})

describe("menus in code", () => {
  it("/ in a code block or in inline code is just a slash", async () => {
    const editor = await mountEditor("<pre><code>const a = 1</code></pre>")
    await typeInto(editor, " /")
    expect(document.querySelector("[data-slash-menu]")).toBeNull()
    cleanup()
    const inline = await mountEditor("<p><code>path</code></p>")
    await act(async () => {
      inline.chain().focus("end").insertContent({ type: "text", text: " /", marks: [{ type: "code" }] }).run()
      await new Promise((r) => setTimeout(r, 40))
    })
    expect(document.querySelector("[data-slash-menu]")).toBeNull()
  })

  it("@ in inline code is just an at sign", async () => {
    const editor = await mountEditor("<p><code>x</code></p>")
    await act(async () => {
      editor.chain().focus("end").insertContent({ type: "text", text: " @Sa", marks: [{ type: "code" }] }).run()
      await new Promise((r) => setTimeout(r, 40))
    })
    expect(document.querySelector("[data-mention-list]")).toBeNull()
    expect(suggestionMenuOpen(editor)).toBe(false)
  })

  it(": in a code block is just a colon", async () => {
    const editor = await mountEditor("<pre><code>a</code></pre>")
    await typeInto(editor, " :ro")
    expect(document.querySelector("[data-emoji-suggest]")).toBeNull()
  })
})

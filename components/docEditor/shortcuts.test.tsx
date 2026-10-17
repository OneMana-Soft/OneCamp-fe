import * as React from "react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { installRangeRects } from "@/lib/testing/rangeRects"
import { loadBlocks } from "@/components/docEditor/registry/factory"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import { EditorContent, type Editor } from "@tiptap/react"
import type { HocuspocusProvider } from "@hocuspocus/provider"

import { SHORTCUT_GROUPS, keyLabel } from "./shortcuts"
import { useDocEditor } from "./useDocEditor"
import { offlineProvider } from "./docTestKit"
import { useActionKeys } from "./registry/actionKeys"
import { attachBus, createDocCommandBus } from "./registry/commandBus"
import { BlockSelection } from "@/components/minimal-tiptap/extensions/block-selection/blockSelection"
import { answerBlockMenu } from "@/components/minimal-tiptap/extensions/block-commands/menuRequest"
import { copyDocLink } from "./docLink"
import { SelectionBar } from "./SelectionBar"
import { docKeymapOf } from "@/components/minimal-tiptap/extensions/doc-keymap/docKeymap"
import { isToggleOpen } from "@/components/minimal-tiptap/extensions/collapsible/toggleState"
import { colourAsk } from "@/components/minimal-tiptap/extensions/block-color/colourUi"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { TooltipProvider } from "@/components/ui/tooltip"

// The doc's own blocks load once, as the app loads them, before any doc editor is built.
beforeAll(() => loadBlocks("doc", { ai: true }), 30_000)

// The "?" dialog's every row, fired on a real doc editor: a row the editor
// doesn't honour fails here. The dialog listed ⌘⇧X for strikethrough (the key
// is ⌘⇧S, Notion's too) and ⌘K (it opened search), and left out what worked.
// Keys follow Notion's page (notion.com/help/keyboard-shortcuts): ⌘⌥8 makes a
// code block, ⌘⌥T opens or closes every toggle, ⌘↩ checks a to-do or opens a
// toggle, ⌘L copies the page's link, " + space makes a quote.

const users = [{ user_uuid: "u-sam", uid: "0x1", user_full_name: "Sam Rivera", user_name: "sam", is_bot: false }]
vi.mock("@/lib/axiosInstance", () => ({
  OWN_ERRORS: { suppressErrorToast: true },
  default: {
    get: vi.fn(async () => ({ status: 200, data: { users } })),
    // A chip reads what it names (POST /entities): here, each is there to open.
    post: vi.fn(async (url: string, body?: { refs?: Array<{ kind: string; id: string }> }) => ({
      data: url === "/entities" ? { data: (body?.refs ?? []).map((r) => ({ ...r, access: "ok", data: { title: "Plan" } })) } : {},
    })),
  },
}))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => undefined }))
vi.mock("@/components/docEditor/docLink", () => ({ copyDocLink: vi.fn(async () => true), docLink: (id: string) => `/app/doc/${id}` }))
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => undefined }))
const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: routerPush }), usePathname: () => "/app/doc/d" }))
// The selection bar's floating shell only, in place (lib/testing/bubbleMenu);
// the bar itself, and the editor, are the real ones.
vi.mock("@/components/minimal-tiptap/components/bubble-menu/bubble-menu", () => import("@/lib/testing/bubbleMenu"))

let restoreRects = () => {}
beforeAll(() => {
  // jsdom lays nothing out: ProseMirror measures ranges, and the selection
  // bar is only focused once it is on screen.
  restoreRects = installRangeRects()
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return (this as HTMLElement).isConnected ? document.body : null
    },
  })
})
afterAll(() => restoreRects())

const commented = vi.fn()
const store = configureStore({ reducer: { ui: (s: Record<string, unknown> = {}) => s } })
const providers: HocuspocusProvider[] = []
afterEach(() => {
  cleanup()
  while (providers.length) providers.pop()?.destroy()
  document.body.innerHTML = ""
})

const settle = (ms = 30) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })

/** A doc editor as the doc page makes it (live, so undo works), with its selection bar. */
async function docEditor(html = "<p></p>") {
  const provider = offlineProvider()
  providers.push(provider)
  let editor: Editor | null = null
  function Doc() {
    const e = useDocEditor({
      collaboration: { enabled: true, documentId: "d", username: "Sam Rivera", userId: "u-sam" },
      provider,
    })
    editor = e as unknown as Editor | null
    return e ? (
      <>
        <EditorContent editor={e} />
        <SelectionBar editor={e} onAIClick={() => {}} onComment={commented} />
      </>
    ) : null
  }
  render(
    <Provider store={store}>
      <MediaQueryProvider>
        <TooltipProvider>
          <Doc />
        </TooltipProvider>
      </MediaQueryProvider>
    </Provider>,
  )
  await settle()
  await act(async () => {
    editor!.commands.setContent(html)
    editor!.commands.focus("end")
  })
  return editor!
}

const KEY_CODES: Record<string, number> = { Tab: 9, Enter: 13, Escape: 27, F10: 121, "\\": 220, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Backspace: 8 }

/** A key as the browser sends it ("Mod" is Ctrl here: jsdom is not a Mac). */
function press(editor: Editor | null, combo: string, target?: EventTarget) {
  const parts = combo.split(/-(?!$)/)
  const key = parts.pop()!
  const mods = new Set(parts)
  const upper = key.length === 1 ? key.toUpperCase() : key
  const event = new KeyboardEvent("keydown", {
    key,
    code: key.length === 1 && /[a-z]/i.test(key) ? `Key${upper}` : undefined,
    keyCode: KEY_CODES[key] ?? upper.charCodeAt(0),
    ctrlKey: mods.has("Mod") || mods.has("Ctrl"),
    altKey: mods.has("Alt"),
    shiftKey: mods.has("Shift"),
    bubbles: true,
    cancelable: true,
  })
  act(() => {
    ;(target ?? editor!.view.dom).dispatchEvent(event)
  })
  return event
}

/** Typing, as the browser hands it to the editor (input rules run). */
async function type(editor: Editor, text: string) {
  await act(async () => {
    for (const ch of text) {
      const { from, to } = editor.state.selection
      const insert = () => editor.state.tr.insertText(ch, from, to)
      const handled = editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, ch, insert))
      if (!handled) editor.view.dispatch(insert())
    }
    await new Promise((r) => setTimeout(r, 40))
  })
}

const selectAllText = (editor: Editor) =>
  act(() => {
    editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 })
  })

const firstBlock = (editor: Editor) => editor.getJSON().content?.[0]

/** How each row of the dialog is done, and what it must change. */
const EXERCISE: Record<string, () => Promise<void>> = {
  Bold: async () => markOn("Mod-b", "bold"),
  Italic: async () => markOn("Mod-i", "italic"),
  Underline: async () => markOn("Mod-u", "underline"),
  Strikethrough: async () => markOn("Mod-Shift-s", "strike"),
  "Inline code": async () => markOn("Mod-e", "code"),
  "Link, with text selected": async () => {
    const editor = await docEditor("<p>the release notes</p>")
    selectAllText(editor)
    const e = press(editor, "Mod-k")
    expect(e.defaultPrevented).toBe(true)
    await settle(80)
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Link address")
    // With nothing selected, ⌘K is the app's search (the palette's key).
    act(() => editor.commands.setTextSelection(3))
    act(() => editor.commands.focus())
    expect(press(editor, "Mod-k").defaultPrevented).toBe(false)
  },
  "Last colour used": async () => {
    localStorage.setItem("onecamp-doc-colours", JSON.stringify(["moss"]))
    const editor = await docEditor("<p>a word</p>")
    selectAllText(editor)
    expect(press(editor, "Mod-Shift-h").defaultPrevented).toBe(true)
    expect(editor.getHTML()).toContain('data-color="moss"')
    localStorage.removeItem("onecamp-doc-colours")
  },
  Highlight: async () => {
    const editor = await docEditor()
    await type(editor, "the ==point== made")
    expect(editor.getHTML()).toContain('<mark data-color="sun">point</mark>')
  },
  "Toggle list": async () => {
    await blockBy("<p>x</p>", "Mod-Alt-7", "collapsible")
    await blockTyped(">> ", "collapsible")
  },
  "Lettered or roman list": async () => {
    await blockTyped("a. ", "orderedList", { type: "a" })
    await blockTyped("i. ", "orderedList", { type: "i" })
  },
  "Duplicate the block": async () => {
    const editor = await docEditor("<p>one</p><p>two</p>")
    expect(press(editor, "Mod-d").defaultPrevented).toBe(true)
    expect(editor.getJSON().content?.map((n) => n.content?.[0]?.text)).toEqual(["one", "two", "two"])
  },
  "Select the block, then everything": async () => {
    const editor = await docEditor("<p>one</p><p>two</p>")
    press(editor, "Mod-a")
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe("two")
    press(editor, "Mod-a")
    expect(editor.state.selection.to - editor.state.selection.from).toBeGreaterThan(3)
  },
  "Comment on the selection": async () => {
    commented.mockClear()
    const editor = await docEditor("<p>ship on Thursday</p>")
    selectAllText(editor)
    expect(press(editor, "Mod-Shift-m").defaultPrevented).toBe(true)
    expect(commented).toHaveBeenCalledTimes(1)
  },
  "Save for later": async () => {
    const { onSaveForLater, inside } = pageKeys()
    press(null, "l", inside)
    expect(onSaveForLater).toHaveBeenCalledTimes(1)
  },
  Search: async () => {
    const { readFileSync } = await import("node:fs")
    const palette = readFileSync("components/ui/CommandPalette.tsx", "utf8")
    expect(palette).toMatch(/\(e\.key === "k" \|\| e\.key === "p"\) && \(e\.metaKey \|\| e\.ctrlKey\)/)
  },
  "Light or dark": async () => {
    const { isThemeHotkey } = await import("@/components/themeProvider/theme-provider")
    const base = { metaKey: false, ctrlKey: true, shiftKey: true, altKey: false, isComposing: false, defaultPrevented: false }
    expect(isThemeHotkey({ ...base, key: "L" })).toBe(true)
    expect(isThemeHotkey({ ...base, key: "l", shiftKey: false })).toBe(false)
  },
  "Clear formatting": async () => {
    const editor = await docEditor("<p><strong><em>loud</em></strong></p>")
    selectAllText(editor)
    press(editor, "Mod-\\")
    expect(editor.isActive("bold") || editor.isActive("italic")).toBe(false)
  },
  "Insert a block": async () => {
    const editor = await docEditor()
    await type(editor, "/")
    expect(document.querySelector("[data-slash-menu]")).toBeTruthy()
  },
  Text: async () => blockBy("<h2>x</h2>", "Mod-Alt-0", "paragraph"),
  "Heading 1": async () => {
    await blockBy("<p>x</p>", "Mod-Alt-1", "heading", { level: 1 })
    await blockTyped("# ", "heading", { level: 1 })
  },
  "Heading 2": async () => {
    await blockBy("<p>x</p>", "Mod-Alt-2", "heading", { level: 2 })
    await blockTyped("## ", "heading", { level: 2 })
  },
  "Heading 3": async () => {
    await blockBy("<p>x</p>", "Mod-Alt-3", "heading", { level: 3 })
    await blockTyped("### ", "heading", { level: 3 })
  },
  "Heading 4": async () => blockTyped("#### ", "heading", { level: 4 }),
  "Bulleted list": async () => {
    await blockBy("<p>x</p>", "Mod-Alt-5", "bulletList")
    await blockBy("<p>x</p>", "Mod-Shift-8", "bulletList")
    await blockTyped("- ", "bulletList")
  },
  "Numbered list": async () => {
    await blockBy("<p>x</p>", "Mod-Alt-6", "orderedList")
    await blockBy("<p>x</p>", "Mod-Shift-7", "orderedList")
    await blockTyped("1. ", "orderedList")
  },
  "To-do list": async () => {
    await blockBy("<p>x</p>", "Mod-Alt-4", "taskList")
    await blockBy("<p>x</p>", "Mod-Shift-9", "taskList")
    await blockTyped("[] ", "taskList")
  },
  Quote: async () => {
    await blockBy("<p>x</p>", "Mod-Shift-b", "blockquote")
    await blockTyped('" ', "blockquote")
  },
  "Code block": async () => {
    await blockBy("<p>x</p>", "Mod-Alt-8", "codeBlock")
    // Tiptap's own ⌘⌥C still makes one too.
    await blockBy("<p>x</p>", "Mod-Alt-c", "codeBlock")
    await blockTyped("``` ", "codeBlock")
  },
  Divider: async () => {
    const editor = await docEditor()
    await type(editor, "---")
    expect(editor.getJSON().content?.some((n) => n.type === "horizontalRule")).toBe(true)
  },
  "Check a to-do, open a toggle": async () => {
    const todo = await docEditor('<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>ship it</p></li></ul>')
    const e = press(todo, "Mod-Enter")
    expect(e.defaultPrevented).toBe(true)
    expect(JSON.stringify(todo.getJSON())).toContain('"checked":true')
    // Never a line break (⇧↩ is the line break).
    expect(JSON.stringify(todo.getJSON())).not.toContain("hardBreak")
    cleanup()
    // A toggle opens and closes for this viewer alone: nothing in the doc changes.
    const toggle = await docEditor('<div data-type="collapsible" data-block-id="t-more"><p>More</p><p>inside</p></div>')
    act(() => toggle.commands.setTextSelection(2))
    const doc = JSON.stringify(toggle.getJSON())
    press(toggle, "Mod-Enter")
    expect(isToggleOpen("t-more")).toBe(true)
    press(toggle, "Mod-Enter")
    expect(isToggleOpen("t-more")).toBe(false)
    expect(JSON.stringify(toggle.getJSON())).toBe(doc)
  },
  "Open or close every toggle": async () => {
    const editor = await docEditor(
      '<div data-type="collapsible" data-block-id="t-a"><p>A</p><p>a</p></div><div data-type="collapsible" data-block-id="t-b"><p>B</p><p>b</p></div><p>end</p>',
    )
    const opens = () => [isToggleOpen("t-a"), isToggleOpen("t-b")]
    press(editor, "Mod-Alt-t")
    expect(opens()).toEqual([true, true])
    press(editor, "Mod-Alt-t")
    expect(opens()).toEqual([false, false])
  },
  "Nest or un-nest a list item": async () => {
    const editor = await docEditor("<ul><li><p>one</p></li><li><p>two</p></li></ul>")
    const nested = () => JSON.stringify(editor.getJSON()).match(/bulletList/g)?.length ?? 0
    expect(press(editor, "Tab").defaultPrevented).toBe(true)
    expect(nested()).toBe(2)
    expect(press(editor, "Shift-Tab").defaultPrevented).toBe(true)
    expect(nested()).toBe(1)
  },
  "Formatting bar": async () => {
    const editor = await docEditor("<p>select me</p>")
    selectAllText(editor)
    await settle(200)
    press(editor, "Alt-F10")
    expect(document.activeElement?.closest("[data-doc-selection-bar]")).toBeTruthy()
  },
  "Copy the doc's link": async () => {
    const { onCopyLink, inside } = pageKeys()
    const e = press(null, "Mod-l", inside)
    expect(onCopyLink).toHaveBeenCalledTimes(1)
    expect(e.defaultPrevented).toBe(true)
  },
  "Focus mode": async () => {
    const { onFocusMode, inside } = pageKeys()
    press(null, "Shift-F", inside)
    expect(onFocusMode).toHaveBeenCalledTimes(1)
  },
  Undo: async () => {
    const editor = await docEditor()
    await type(editor, "drafted")
    press(editor, "Mod-z")
    expect(editor.getText()).not.toContain("drafted")
  },
  Redo: async () => {
    const editor = await docEditor()
    await type(editor, "drafted")
    press(editor, "Mod-z")
    press(editor, "Mod-Shift-z")
    expect(editor.getText()).toContain("drafted")
  },
  "Line break": async () => {
    const editor = await docEditor("<p>one</p>")
    press(editor, "Shift-Enter")
    expect(JSON.stringify(editor.getJSON())).toContain("hardBreak")
  },
  "Make a to-do a task": async () => {
    // In a doc in no project, ⌘⇧Enter on a to-do asks which project the
    // task goes in (connected.test.tsx makes the task).
    const todo = await docEditor('<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>ship it</p></li></ul>')
    const bus = createDocCommandBus("0d0c0000-0000-4000-8000-000000000001")
    const asked = vi.fn()
    bus.on("openDialog", asked)
    attachBus(todo, bus)
    act(() => void todo.commands.setTextSelection(4))
    expect(press(todo, "Mod-Shift-Enter").defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(asked).toHaveBeenCalledWith({ id: "connected.pickProject" }), { timeout: 3000 })
  },
  "Open the selected page or task": async () => {
    const page = "0d0c0000-0000-4000-8000-000000000001"
    const editor = await docEditor(`<p><span data-type="entityMention" data-id="doc:${page}" data-label="Plan"></span></p>`)
    // The chip's code, then its read.
    await vi.waitFor(() => expect(document.querySelector('[data-entity-chip="doc"][data-state="ok"]')).not.toBeNull(), { timeout: 3000 })
    routerPush.mockClear()
    act(() => void editor.commands.setNodeSelection(1))
    press(editor, "Mod-Enter")
    expect(routerPush).toHaveBeenCalledWith(`/app/doc/${page}`)
  },
  "Link a page": async () => {
    const editor = await docEditor()
    await type(editor, "[[Lau")
    await settle(250)
    expect(document.querySelector("[data-page-link-list]")).toBeTruthy()
  },
  "Mention someone": async () => {
    const editor = await docEditor()
    await type(editor, "@Sa")
    expect(document.querySelector("[data-mention-list]")).toBeTruthy()
  },
  "Leave the text": async () => {
    const editor = await docEditor("<p>words</p>")
    // Tab alone stays in the text...
    expect(press(editor, "Tab").defaultPrevented).toBe(true)
    // ...Escape, then Tab, lets the browser move focus on.
    press(editor, "Escape")
    expect(press(editor, "Tab").defaultPrevented).toBe(false)
    // And only the Tab right after Escape.
    expect(press(editor, "Tab").defaultPrevented).toBe(true)
  },
  "These shortcuts": async () => {
    const { onShortcuts } = pageKeys()
    press(null, "?", document.body)
    expect(onShortcuts).toHaveBeenCalledTimes(1)
  },
  // B1's block keys.
  "Select the block": async () => {
    const editor = await docEditor("<p>one</p><p>two</p>")
    expect(press(editor, "Escape").defaultPrevented).toBe(true)
    const sel = editor.state.selection
    expect(sel instanceof BlockSelection && sel.refs().map((b) => b.node.textContent)).toEqual(["two"])
    // Esc again: back to the text, its end.
    press(editor, "Escape")
    expect(editor.state.selection instanceof BlockSelection).toBe(false)
    expect(editor.state.selection.from).toBe(editor.state.doc.content.size - 1)
  },
  "With blocks selected, select more": async () => {
    const editor = await docEditor("<p>one</p><p>two</p><p>three</p>")
    press(editor, "Escape")
    expect(press(editor, "Shift-ArrowUp").defaultPrevented).toBe(true)
    const sel = editor.state.selection as BlockSelection
    expect(sel.refs().map((b) => b.node.textContent)).toEqual(["two", "three"])
  },
  "With blocks selected, delete them": async () => {
    const editor = await docEditor("<p>one</p><p>two</p><p>three</p>")
    press(editor, "Escape")
    press(editor, "Shift-ArrowUp")
    expect(press(editor, "Backspace").defaultPrevented).toBe(true)
    expect(editor.getJSON().content?.map((n) => n.content?.[0]?.text)).toEqual(["one"])
  },
  "Move the block up or down": async () => {
    const editor = await docEditor("<p>one</p><p>two</p>")
    expect(press(editor, "Mod-Shift-ArrowUp").defaultPrevented).toBe(true)
    expect(editor.getJSON().content?.map((n) => n.content?.[0]?.text)).toEqual(["two", "one"])
    // The caret went with its block.
    expect(editor.state.selection.$from.parent.textContent).toBe("two")
    press(editor, "Mod-Shift-ArrowDown")
    expect(editor.getJSON().content?.map((n) => n.content?.[0]?.text)).toEqual(["one", "two"])
  },
  "Block menu": async () => {
    const editor = await docEditor("<p>one</p><p>two</p>")
    const asked = vi.fn()
    const stop = answerBlockMenu(editor, asked)
    expect(press(editor, "Mod-/").defaultPrevented).toBe(true)
    expect(asked).toHaveBeenCalledWith(expect.objectContaining({ via: "keys", blocks: [5] }))
    stop()
  },
  "Copy link to the block": async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    const editor = await docEditor("<p>one</p>")
    const detach = attachBus(editor, createDocCommandBus("d-1"))
    expect(press(editor, "Alt-Shift-l").defaultPrevented).toBe(true)
    await settle(10)
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/app\/doc\/d-1#block-[0-9a-f-]{36}/))
    detach()
  },
  // B3: equations, tables, find and replace.
  "Inline equation": async () => {
    const editor = await docEditor("<p>so a^2 holds</p>")
    act(() => void editor.commands.setTextSelection({ from: 4, to: 7 }))
    expect(press(editor, "Mod-Shift-e").defaultPrevented).toBe(true)
    expect(JSON.stringify(editor.getJSON())).toContain('"latex":"a^2"')
    cleanup()
    const typed = await docEditor()
    await type(typed, "area $x^2$")
    expect(JSON.stringify(typed.getJSON())).toContain('"type":"inlineMath"')
  },
  "Block equation": async () => blockTyped("$$ ", "blockMath"),
  "Next or previous cell": async () => {
    const editor = await docEditor("<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>")
    act(() => void editor.commands.setTextSelection(3))
    expect(press(editor, "Tab").defaultPrevented).toBe(true)
    expect(editor.state.selection.$from.parent.textContent).toBe("b")
    press(editor, "Shift-Tab")
    expect(editor.state.selection.$from.parent.textContent).toBe("a")
  },
  "Find in the doc": async () => {
    const editor = await docEditor("<p>launch</p>")
    findKeys(editor)
    act(() => (document.activeElement as HTMLElement | null)?.blur())
    const e = press(null, "Mod-f", document.body)
    expect(e.defaultPrevented).toBe(true)
    // The bar is a chunk of its own: ⌘F opens it once that has loaded (its
    // then runs ahead of this one), and act draws it.
    await act(async () => {
      await import("./FindBar")
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(document.querySelector("[data-doc-find]")).toBeTruthy()
  },
  "Replace, while finding": async () => {
    localStorage.setItem("onecamp-doc-colours", JSON.stringify(["moss"]))
    const editor = await docEditor("<p>alpha beta</p>")
    const { openFind } = await import("./FindBar")
    await act(async () => openFind({ docId: "d", editor, canEdit: true, bus: createDocCommandBus("d"), gate: { ai: false } }))
    act(() => editor.commands.focus())
    expect(press(editor, "Mod-Shift-h").defaultPrevented).toBe(true)
    await settle(50)
    expect(document.querySelector('input[aria-label="Replace with"]')).toBeTruthy()
    // Nothing was coloured: while find is open, the key is Replace's.
    expect(editor.getHTML()).not.toContain('data-color="moss"')
    localStorage.removeItem("onecamp-doc-colours")
    // The bar stays open otherwise, and a later row's Escape would be its.
    act(() => editor.destroy())
  },
}

/** The page's ⌘F on a doc whose editor is this one (registry/actionKeys.ts). */
function findKeys(editor: Editor) {
  function Keys() {
    const root = React.useRef<HTMLDivElement>(null)
    useActionKeys(root, () => ({ docId: "d", editor, canEdit: true, bus: createDocCommandBus("d"), gate: { ai: false } }), { ai: false })
    return <div ref={root} data-doc-view="" />
  }
  render(<Keys />)
}

async function markOn(combo: string, mark: string) {
  const editor = await docEditor("<p>a word</p>")
  selectAllText(editor)
  const e = press(editor, combo)
  expect(e.defaultPrevented, combo).toBe(true)
  expect(editor.isActive(mark), `${combo} makes ${mark}`).toBe(true)
  cleanup()
}

async function blockBy(html: string, combo: string, type: string, attrs?: Record<string, unknown>) {
  const editor = await docEditor(html)
  press(editor, combo)
  const block = JSON.stringify(editor.getJSON())
  expect(block, `${combo} makes ${type}`).toContain(`"type":"${type}"`)
  if (attrs) expect(firstBlock(editor)?.attrs).toEqual(expect.objectContaining(attrs))
  cleanup()
}

async function blockTyped(text: string, blockType: string, attrs?: Record<string, unknown>) {
  const editor = await docEditor()
  await type(editor, text)
  expect(JSON.stringify(editor.getJSON()), `"${text}" makes ${blockType}`).toContain(`"type":"${blockType}"`)
  if (attrs) expect(firstBlock(editor)?.attrs).toEqual(expect.objectContaining(attrs))
  cleanup()
}

/**
 * The page's own keys, on a page whose doc holds focus: the doc's actions
 * bound for the page (registry/actionKeys.ts), asking the doc's bus as the
 * page's shell hears it.
 */
function pageKeys() {
  vi.mocked(copyDocLink).mockClear()
  const onCopyLink = vi.mocked(copyDocLink)
  const onShortcuts = vi.fn()
  const onFocusMode = vi.fn()
  const onSaveForLater = vi.fn()
  function Page() {
    const root = React.useRef<HTMLDivElement>(null)
    const bus = React.useMemo(() => {
      const b = createDocCommandBus("d")
      b.on("toggle", ({ what }) => ({ shortcuts: onShortcuts, focusMode: onFocusMode, saved: onSaveForLater })[what as "shortcuts"]?.())
      return b
    }, [])
    useActionKeys(root, () => ({ docId: "d", editor: null, canEdit: true, bus, gate: { ai: false } }), { ai: false })
    return (
      <div ref={root} data-doc-view="">
        <button type="button" data-inside="">x</button>
      </div>
    )
  }
  render(<Page />)
  const inside = document.querySelector<HTMLElement>("[data-inside]")!
  inside.focus()
  return { onCopyLink, onShortcuts, onFocusMode, onSaveForLater, inside }
}

describe("the doc's keyboard shortcuts", () => {
  const rows = SHORTCUT_GROUPS.flatMap((g) => g.rows)

  it("lists Notion's keys and nothing unbound", () => {
    const keys = (label: string) => rows.find((r) => r.label === label)?.ways
    expect(keys("Strikethrough")).toEqual([["⌘", "⇧", "S"]])
    expect(keys("Code block")?.[0]).toEqual(["⌘", "⌥", "8"])
    expect(keys("Open or close every toggle")).toEqual([["⌘", "⌥", "T"]])
    expect(keys("Copy the doc's link")).toEqual([["⌘", "L"]])
    expect(JSON.stringify(rows)).not.toContain('"X"')
  })

  it("names the keys as this computer's keyboard does", () => {
    expect(["⌘", "⌥", "⇧", "K"].map((k) => keyLabel(k, true))).toEqual(["⌘", "⌥", "⇧", "K"])
    expect(["⌘", "⌥", "⇧", "K"].map((k) => keyLabel(k, false))).toEqual(["Ctrl", "Alt", "Shift", "K"])
  })

  it("has an exercise for every row", () => {
    expect(rows.map((r) => r.label).filter((label) => !EXERCISE[label])).toEqual([])
  })

  for (const row of SHORTCUT_GROUPS.flatMap((g) => g.rows)) {
    it(`does "${row.label}"`, async () => {
      await EXERCISE[row.label]?.()
    })
  }
})

describe("⌘K between the doc and the app", () => {
  it("leaves ⌘K to the doc when it took it (text selected), and opens search otherwise", async () => {
    const { readFileSync } = await import("node:fs")
    const palette = readFileSync("components/ui/CommandPalette.tsx", "utf8")
    const handler = palette.slice(palette.indexOf("const down = (e: KeyboardEvent) => {"), palette.indexOf('document.addEventListener("keydown", down)'))
    expect(handler).toMatch(/if \(e\.defaultPrevented\) return/)
    expect(handler.indexOf("defaultPrevented")).toBeLessThan(handler.indexOf('e.key === "k"'))
  })
})

describe("the doc keymap's own storage", () => {
  it("is on the doc's editor, for the selection bar and the link form", async () => {
    const editor = await docEditor()
    expect(docKeymapOf(editor)).toEqual(expect.objectContaining({ tabLeaves: false }))
  })
})

describe("the selection bar's menus, from the keyboard", () => {
  const openFromBar = async (label: RegExp) => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-doc-selection-bar] button")).find((b) =>
      label.test(b.getAttribute("aria-label") ?? ""),
    )!
    act(() => button.focus())
    // Enter or Space on a focused button is a click.
    await act(async () => {
      button.click()
    })
    await settle(50)
    return button
  }

  it("turns a line into a heading without the pointer, and Escape gives focus back", async () => {
    const editor = await docEditor("<p>select me</p>")
    selectAllText(editor)
    await settle(200)
    press(editor, "Alt-F10")
    const button = await openFromBar(/^Turn into/)
    const list = document.activeElement as HTMLElement
    expect(list.getAttribute("role")).toBe("listbox")
    const heading = Array.from(list.querySelectorAll('[role="option"]')).findIndex((o) => /Heading 1/.test(o.textContent ?? ""))
    expect(heading).toBeGreaterThan(-1)
    for (let i = 0; i < heading; i++) press(null, "ArrowDown", list)
    press(null, "Enter", list)
    await settle(50)
    expect(editor.getJSON().content?.[0].type).toBe("heading")

    selectAllText(editor)
    await settle(200)
    press(editor, "Alt-F10")
    const again = await openFromBar(/^Turn into/)
    press(null, "Escape", document.activeElement!)
    await settle(50)
    expect(document.activeElement).toBe(again)
    expect(button.isConnected || again.isConnected).toBe(true)
  })

  it("opens B2's colour grid from the bar's Colour (colour.open)", async () => {
    const editor = await docEditor("<p>select me</p>")
    selectAllText(editor)
    await settle(200)
    press(editor, "Alt-F10")
    await openFromBar(/^Colour$/)
    // The grid itself (arrows, Enter, Escape) is ColourGrid.test.tsx's.
    expect(colourAsk()?.editor).toBe(editor)
  })
})

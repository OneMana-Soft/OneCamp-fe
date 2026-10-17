import * as React from "react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { installRangeRects } from "@/lib/testing/rangeRects"
import { loadBlocks } from "@/components/docEditor/registry/factory"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import { EditorContent, type Editor } from "@tiptap/react"
import type { HocuspocusProvider } from "@hocuspocus/provider"

import { useDocEditor } from "./useDocEditor"
import { offlineProvider } from "./docTestKit"
import { titleKey } from "./docTitleKeys"
import { isComposingKey } from "@/lib/keys/ime"
import { useLocalEditTime } from "./DocMetaLine"
import DocLoading from "@/app/app/doc/[doc-id]/loading"
import { fullWidthKey, useDocFullWidth } from "./docFullWidth"
import { canRestoreDeleted, docLoadFailure } from "./docLoadFailure"
import { setPhoneScrollMargin } from "./phoneScrollMargin"
import { selectionIsOneLink } from "./SelectionBar"
import { DocAccessoryBar, shiftBlock } from "./DocAccessoryBar"
import { docKeymapOf } from "@/components/minimal-tiptap/extensions/doc-keymap/docKeymap"
import { LINK_RULE, STRIKE_RULE, typedHref } from "@/components/minimal-tiptap/extensions/doc-keymap/docInputRules"
import { linkHrefAt } from "@/components/minimal-tiptap/extensions/link/link"
import { withoutChatCommands } from "@/components/minimal-tiptap/extensions/slash-command/slashCommandExtension"
import { forgetWorkspaceMembers, workspaceMembers } from "@/components/minimal-tiptap/extensions/mention-list/mentionList"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { TooltipProvider } from "@/components/ui/tooltip"
import axiosInstance from "@/lib/axiosInstance"

// The doc's own blocks load once, as the app loads them, before any doc editor is built.
beforeAll(() => loadBlocks("doc", { ai: true }), 30_000)

// The docs quick wins (PROGRAM A0, small-details.md §3): one check per row,
// on a real doc editor where the row is about typing.

vi.mock("@/lib/axiosInstance", () => ({ default: { get: vi.fn(async () => ({ status: 200, data: { users: [] } })), post: vi.fn(async () => ({ data: {} })) } }))
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => undefined }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/app/doc/d" }))

let restoreRects = () => {}
beforeAll(() => {
  restoreRects = installRangeRects()
})
afterAll(() => restoreRects())

const store = configureStore({ reducer: { ui: (s: Record<string, unknown> = {}) => s } })
const providers: HocuspocusProvider[] = []
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  while (providers.length) providers.pop()?.destroy()
  document.body.innerHTML = ""
})

async function docEditor(html: string, extra?: (e: Editor) => React.ReactNode) {
  const provider = offlineProvider()
  providers.push(provider)
  let editor: Editor | null = null
  function Doc() {
    const e = useDocEditor({ collaboration: { enabled: true, documentId: "d", username: "Sam Rivera", userId: "u-sam" }, provider, labelledBy: "t" })
    editor = e as unknown as Editor | null
    return e ? (<><EditorContent editor={e} className="minimal-tiptap-editor doc-editor" />{extra?.(e as unknown as Editor)}</>) : null
  }
  render(<Provider store={store}><MediaQueryProvider><TooltipProvider><Doc /></TooltipProvider></MediaQueryProvider></Provider>)
  await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  await act(async () => {
    editor!.commands.setContent(html)
    editor!.commands.focus("end")
  })
  return editor!
}

const CODES: Record<string, number> = { Enter: 13, Backspace: 8, ArrowUp: 38, ArrowRight: 39 }
function press(editor: Editor, key: string, init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent("keydown", { key, keyCode: CODES[key] ?? key.toUpperCase().charCodeAt(0), bubbles: true, cancelable: true, ...init })
  act(() => { editor.view.dom.dispatchEvent(e) })
  return e
}
async function type(editor: Editor, text: string) {
  await act(async () => {
    for (const ch of text) {
      const { from, to } = editor.state.selection
      const insert = () => editor.state.tr.insertText(ch, from, to)
      if (!editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, ch, insert))) editor.view.dispatch(insert())
    }
  })
}
const json = (e: Editor) => JSON.stringify(e.getJSON())

describe("typing (T)", () => {
  it("T3: an empty list item says List, an empty to-do To-do", async () => {
    const e = await docEditor("<ul><li><p></p></li></ul>")
    expect(e.view.dom.querySelector("li p")?.getAttribute("data-placeholder")).toBe("List")
    cleanup()
    const t = await docEditor('<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>')
    expect(t.view.dom.querySelector("li p")?.getAttribute("data-placeholder")).toBe("To-do")
  })

  it("T29: keeps quotes, dashes and arrows, not ², ½, ≠, × or «", async () => {
    const e = await docEditor("<p></p>")
    await type(e, "x^2 1/2 != 3x4 << a -> b -- c ")
    expect(e.getText()).toContain("x^2 1/2 != 3x4 << a → b — c")
  })

  it("T25: Enter in code keeps the line's indent", async () => {
    const e = await docEditor("<pre><code>if (x) {\n  run()</code></pre>")
    expect(press(e, "Enter").defaultPrevented).toBe(true)
    expect(e.getText()).toBe("if (x) {\n  run()\n  ")
  })

  it("T16: Backspace at a later item's start un-bullets it in place", async () => {
    const e = await docEditor("<ul><li><p>one</p></li><li><p>two</p></li><li><p>three</p></li></ul>")
    act(() => { e.commands.setTextSelection(e.state.doc.content.size - 15) })
    expect(e.state.selection.$from.parent.textContent).toBe("two")
    press(e, "Backspace")
    expect(e.getJSON().content?.map((n) => n.type)).toEqual(["bulletList", "paragraph", "bulletList"])
  })

  // On a busy page the browser's "selectionchange" for Home or End can come
  // after the next key (Chrome runs input first). The editor still had the
  // old caret: ⌫ joined the items ("onetwo"), and ↩ split the line where the
  // caret had been (CaretFromScreen).
  it("T16 on a busy page: a key acts on the caret the browser moved, before the editor has heard", async () => {
    const e = await docEditor("<ul><li><p>one</p></li><li><p>two</p></li></ul>")
    // The editor has the focus, as a browser gives it (jsdom counts no
    // contenteditable as focusable without a tabindex).
    act(() => {
      e.view.dom.tabIndex = 0
      e.view.dom.focus()
    })
    // A second on: the 200 ms after the focus are ProseMirror's own (the next test).
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(Date.now() + 1000)
    const blocks = () => e.state.doc.content.content.map((n) => [n.type.name, n.textContent])
    // Home, as the browser does it: the caret moves, and no "selectionchange" yet.
    act(() => { document.getSelection()!.collapse(e.view.dom.querySelectorAll("li p")[1].firstChild!, 0) })
    expect(e.state.selection.$from.parentOffset).toBe(3)
    press(e, "Backspace")
    expect(blocks()).toEqual([["bulletList", "one"], ["paragraph", "two"]])
    // End, the same way, then ↩: the line splits at its end.
    expect(e.state.selection.$from.parentOffset).toBe(0)
    act(() => { document.getSelection()!.collapse(e.view.dom.querySelector(":scope > p")!.firstChild!, 3) })
    press(e, "Enter")
    expect(blocks()).toEqual([["bulletList", "one"], ["paragraph", "two"], ["paragraph", ""]])
  })

  // In the 200 ms after the editor takes the focus, ProseMirror takes a caret
  // at the doc's start for the browser resetting it, and puts its own back.
  // Read then, Home on the doc's one line and ⇧End selected nothing (docAi's
  // "two of three can be taken" clicks in and keys at once).
  it("leaves a caret moved to the doc's start, just after the focus, where the browser put it", async () => {
    const e = await docEditor("<p>one line</p>")
    act(() => {
      e.view.dom.tabIndex = 0
      e.view.dom.focus()
    })
    act(() => { document.getSelection()!.collapse(e.view.dom.querySelector("p")!.firstChild!, 0) })
    press(e, "Shift")
    expect(document.getSelection()!.anchorOffset).toBe(0)
  })

  it("T17: Backspace at a heading's start makes it text first", async () => {
    const e = await docEditor("<p>above</p><h2>head</h2>")
    act(() => { e.commands.setTextSelection(8) })
    press(e, "Backspace")
    expect(e.getJSON().content?.map((n) => n.type)).toEqual(["paragraph", "paragraph"])
    expect(e.getText()).toContain("head")
  })

  it("T6, T7: ↑ on the first line and Backspace on an empty first line go to the title", async () => {
    const e = await docEditor("<p></p><p>more</p>")
    const focusTitle = vi.fn(() => true)
    docKeymapOf(e)!.focusTitle = focusTitle
    act(() => { e.commands.setTextSelection(1) })
    press(e, "ArrowUp")
    expect(focusTitle).toHaveBeenCalledTimes(1)
    press(e, "Backspace")
    expect(focusTitle).toHaveBeenCalledTimes(2)
    expect(e.getText()).toBe("more")
  })

  it("T32: → at the end of inline code steps out of it", async () => {
    const e = await docEditor("<p>run <code>make</code></p>")
    press(e, "ArrowRight")
    await type(e, "now")
    expect(e.getHTML()).toMatch(/<code[^>]*>make<\/code> now/)
  })

  it("T30: ⌘Z undoes the automatic change first", async () => {
    const e = await docEditor("<p></p>")
    await type(e, "## ")
    expect(json(e)).toContain('"heading"')
    press(e, "z", { ctrlKey: true })
    expect(json(e)).not.toContain('"heading"')
    expect(e.getText()).toBe("## ")
  })

  it("T5: Enter splits the title into the body's first line; nothing while composing", async () => {
    const e = await docEditor("<p>body</p>")
    const titled = vi.fn()
    const key = { key: "Enter", isComposing: false, keyCode: 13, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, preventDefault: () => {} }
    act(() => { titleKey(key, { value: "Launch plan", selectionStart: 6, selectionEnd: 6, singleLine: true }, e, titled) })
    expect(titled).toHaveBeenCalledWith("Launch")
    expect(e.getText()).toMatch(/^plan/)
    expect(titleKey({ ...key, isComposing: true }, { value: "x", selectionStart: 1, selectionEnd: 1, singleLine: true }, e, titled)).toBe(false)
  })

  it("A4: an input method's keys are never the title's or the breadcrumb's", () => {
    expect(isComposingKey({ isComposing: true, keyCode: 13 })).toBe(true)
    // Safari ends a composition with an Enter that says 229 and not composing.
    expect(isComposingKey({ isComposing: false, keyCode: 229 })).toBe(true)
    expect(isComposingKey({ isComposing: false, keyCode: 13 })).toBe(false)
  })

  it("P3: an edit typed here is the doc's last edit; a collaborator's sync is not", async () => {
    let at: Date | null = null
    const e = await docEditor("<p>x</p>", (ed) => {
      function Probe() {
        at = useLocalEditTime(ed)
        return null
      }
      return <Probe />
    })
    act(() => {
      e.view.dispatch(e.state.tr.insertText("y").setMeta("y-sync$", { isChangeOrigin: true }))
    })
    expect(at).toBeNull()
    act(() => { e.commands.insertContent("z") })
    expect(at).toBeInstanceOf(Date)
  })

  it("the body is a textbox named by the title", async () => {
    const e = await docEditor("<p>x</p>")
    expect([e.view.dom.getAttribute("role"), e.view.dom.getAttribute("aria-multiline"), e.view.dom.getAttribute("aria-labelledby")]).toEqual(["textbox", "true", "t"])
  })
})

describe("Markdown rules (K)", () => {
  it("K12: ~text~ strikes through", async () => {
    expect(STRIKE_RULE.exec("so ~gone~")?.[2]).toBe("gone")
    expect(STRIKE_RULE.test("~~gone~")).toBe(false)
    const e = await docEditor("<p></p>")
    await type(e, "a ~gone~")
    expect(json(e)).toContain('"strike"')
  })

  it("K10: ``` makes a code block on the third backtick", async () => {
    const e = await docEditor("<p></p>")
    await type(e, "```")
    expect(e.getJSON().content?.[0].type).toBe("codeBlock")
  })

  it("K15: [text](url) makes a link, never to an unsafe address", async () => {
    expect(LINK_RULE.test("![alt](x.png)")).toBe(false)
    expect(typedHref("example.com")).toBe("https://example.com")
    expect(typedHref("javascript:alert(1)")).toBeNull()
    const e = await docEditor("<p></p>")
    await type(e, "see [the brief](example.com/brief)")
    expect(e.getText()).toBe("see the brief")
    expect(e.getHTML()).toContain('href="https://example.com/brief"')
  })
})

describe("keys (S)", () => {
  it("S7: ⌘D copies a list item under itself", async () => {
    const e = await docEditor("<ul><li><p>ship</p></li></ul>")
    press(e, "d", { ctrlKey: true })
    expect(e.getJSON().content?.[0].content?.map((i) => i.content?.[0].content?.[0].text)).toEqual(["ship", "ship"])
  })
})

describe("selection bar and links (L, U, C)", () => {
  it("L7: a selection that is exactly one link gets the link's bar only", async () => {
    const e = await docEditor('<p>read <a href="https://example.com">the brief</a> today</p>')
    act(() => { e.commands.setTextSelection({ from: 6, to: 15 }) })
    expect(selectionIsOneLink(e, 6, 15)).toBe(true)
    act(() => { e.commands.setTextSelection({ from: 1, to: 15 }) })
    expect(selectionIsOneLink(e, 1, 15)).toBe(false)
  })

  it("L8: the link under a ⌘-click is found, and only a safe one", async () => {
    const e = await docEditor('<p><a href="https://example.com">site</a></p>')
    expect(linkHrefAt(e.state.doc, 2, e.schema.marks.link)).toBe("https://example.com")
  })
})

describe("menus and mentions (U, D, N6)", () => {
  it("N6: a doc's menu never offers the chat composer's commands", () => {
    const items = [{ id: "cmd-remind" }, { id: "h1" }] as never[]
    expect(withoutChatCommands(items).map((i: { id: string }) => i.id)).toEqual(["h1"])
  })

  it("D3: the member list is asked for once a minute, not per key", async () => {
    forgetWorkspaceMembers()
    const get = vi.mocked(axiosInstance.get)
    get.mockClear()
    await Promise.all([workspaceMembers(1000), workspaceMembers(2000), workspaceMembers(30_000)])
    expect(get).toHaveBeenCalledTimes(1)
    await workspaceMembers(70_000)
    expect(get).toHaveBeenCalledTimes(2)
  })
})

describe("page (P, E, V20)", () => {
  it("E3 and 410: deleted, gone and unreachable are told apart", () => {
    expect(docLoadFailure({ response: { status: 410 } })).toBe("deleted")
    expect(docLoadFailure({ response: { status: 404 } })).toBe("gone")
    expect(docLoadFailure({ response: { status: 502 } })).toBe("unreachable")
    expect(docLoadFailure(new Error("Network Error"))).toBe("unreachable")
  })

  it("E1: a deleted doc offers Restore only to whom the server says may", () => {
    expect(canRestoreDeleted({ response: { status: 410, data: { can_restore: true } } })).toBe(true)
    expect(canRestoreDeleted({ response: { status: 410, data: { deleted: true } } })).toBe(false)
    expect(canRestoreDeleted({ response: { status: 404, data: { can_restore: true } } })).toBe(false)
    // The page that offers it is B6's TrashedBanner (TrashedBanner.test.tsx).
  })

  it("N36: the doc route has its own skeleton, not the docs list's", () => {
    render(<DocLoading />)
    expect(document.querySelector("[data-doc-skeleton]")).not.toBeNull()
  })

  it("V20: full width is remembered per doc", () => {
    localStorage.removeItem(fullWidthKey("d1"))
    let api: [boolean, () => void] = [false, () => {}]
    function Probe({ id }: { id: string }) {
      api = useDocFullWidth(id)
      return null
    }
    const { rerender } = render(<Probe id="d1" />)
    act(() => api[1]())
    expect(localStorage.getItem(fullWidthKey("d1"))).toBe("1")
    rerender(<Probe id="d2" />)
    expect(api[0]).toBe(false)
    rerender(<Probe id="d1" />)
    expect(api[0]).toBe(true)
  })
})

describe("phone (M)", () => {
  it("M2–M4: the bar indents, outdents, undoes, redoes and comments", async () => {
    const onComment = vi.fn()
    const e = await docEditor("<ul><li><p>one</p></li><li><p>two</p></li></ul>", (ed) => <DocAccessoryBar editor={ed} onAIClick={() => {}} onComment={onComment} />)
    act(() => { e.commands.focus("end"); e.emit("focus", { editor: e, event: new FocusEvent("focus"), transaction: e.state.tr }) })
    for (const label of ["Indent", "Outdent", "Undo", "Redo"]) expect(document.querySelector(`[aria-label="${label}"]`), label).toBeTruthy()
    expect(shiftBlock(e, 1)).toBe(true)
    expect((json(e).match(/bulletList/g) ?? []).length).toBe(2)
    act(() => { e.commands.setTextSelection({ from: 3, to: 5 }) })
    const comment = document.querySelector<HTMLButtonElement>('[aria-label="Comment"]')
    expect(comment).toBeTruthy()
    fireEvent.click(comment!)
    expect(onComment).toHaveBeenCalled()
  })

  it("M8: the caret is kept above the bar while it shows", async () => {
    const e = await docEditor("<p>x</p>")
    setPhoneScrollMargin(e, 345)
    expect(docKeymapOf(e)!.scrollMargin.bottom).toBe(357)
    expect(e.view.someProp("scrollMargin")).toEqual(expect.objectContaining({ bottom: 357 }))
    setPhoneScrollMargin(e, null)
    expect(docKeymapOf(e)!.scrollMargin.bottom).toBe(5)
  })
})

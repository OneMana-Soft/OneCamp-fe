import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { TextSelection } from "@tiptap/pm/state"

// The bubble menu attaches Tiptap's own view to the editor, as a view, never
// as a plugin added to an open editor (which makes every plugin view again:
// registry/factory.ts). Tippy's floating layer can't load under vitest; the
// rest of the view is Tiptap's.
const seen = vi.hoisted(() => ({ shown: 0, hidden: 0, destroyed: 0 }))
vi.mock("@tiptap/extension-bubble-menu", async (original) => {
  const real = await original<typeof import("@tiptap/extension-bubble-menu")>()
  class BubbleMenuView extends real.BubbleMenuView {
    createTooltip() {}
    show() {
      seen.shown++
    }
    hide() {
      seen.hidden++
    }
    destroy() {
      seen.destroyed++
      super.destroy()
    }
  }
  return { ...real, BubbleMenuView }
})

import { BubbleMenu } from "./bubble-menu"
import { attachPluginView } from "../../utils/pluginView"

const editors: Editor[] = []
afterEach(() => {
  cleanup()
  editors.splice(0).forEach((e) => e.destroy())
  Object.assign(seen, { shown: 0, hidden: 0, destroyed: 0 })
})

function make() {
  const editor = new Editor({ element: document.body.appendChild(document.createElement("div")), extensions: [StarterKit], content: "<p>Hello world</p>" })
  editors.push(editor)
  return editor
}

const select = (editor: Editor, from: number, to = from) => act(() => editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to))))

describe("the bubble menu", () => {
  it("floats over a selection as a view of the editor, never a plugin added to it, and goes with its component", () => {
    const editor = make()
    const plugins = editor.state.plugins
    const added = vi.spyOn(editor, "registerPlugin")
    const menu = render(
      <BubbleMenu editor={editor} updateDelay={0} shouldShow={({ from, to }) => to > from}>
        <b>Bold</b>
      </BubbleMenu>,
    )
    select(editor, 1, 6)
    expect(seen.shown).toBe(1)
    select(editor, 3)
    expect(seen.hidden).toBeGreaterThan(0)
    expect(added).not.toHaveBeenCalled()
    expect(editor.state.plugins).toBe(plugins)
    menu.unmount()
    expect(seen.destroyed).toBe(1)
  })

  it("asks the latest shouldShow it was given, where Tiptap's kept the first", () => {
    const editor = make()
    const first = vi.fn(() => false)
    const latest = vi.fn(() => true)
    const menu = render(
      <BubbleMenu editor={editor} updateDelay={0} shouldShow={first}>
        <b>Bold</b>
      </BubbleMenu>,
    )
    menu.rerender(
      <BubbleMenu editor={editor} updateDelay={0} shouldShow={latest}>
        <b>Bold</b>
      </BubbleMenu>,
    )
    // Asked once as it attached; after that, only the latest.
    first.mockClear()
    select(editor, 1, 6)
    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalled()
    expect(seen.shown).toBe(1)
  })

  // The selection bar's loads with the first selection (SelectionBar.tsx).
  it("shows for the selection there is when it attaches, with no change after", () => {
    const editor = make()
    select(editor, 1, 6)
    render(
      <BubbleMenu editor={editor} updateDelay={0} shouldShow={({ from, to }) => to > from}>
        <b>Bold</b>
      </BubbleMenu>,
    )
    expect(seen.shown).toBe(1)
  })
})

describe("a plugin view attached to an editor", () => {
  it("is told of each new state, with the one before, until it is detached", () => {
    const editor = make()
    const updates: Array<[boolean, unknown]> = []
    const destroy = vi.fn()
    const detach = attachPluginView(editor, (view) => ({ update: (v, prev) => void updates.push([v === view, prev]), destroy }))
    const before = editor.state
    editor.commands.insertContent("!")
    expect(updates).toEqual([[true, before]])
    detach()
    expect(destroy).toHaveBeenCalledTimes(1)
    editor.commands.insertContent("?")
    expect(updates).toHaveLength(1)
    detach()
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it("goes with its editor", () => {
    const editor = make()
    const destroy = vi.fn()
    attachPluginView(editor, () => ({ destroy }))
    editor.destroy()
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})

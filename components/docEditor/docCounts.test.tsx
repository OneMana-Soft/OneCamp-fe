import * as React from "react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { blockLabel, countDoc, useDocCounts } from "./docCounts"

const editors: Editor[] = []
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  while (editors.length) editors.pop()?.destroy()
})

function editorWith(content: string) {
  const editor = new Editor({ element: document.createElement("div"), extensions: [StarterKit.configure({ history: false })], content })
  editors.push(editor)
  return editor
}

describe("countDoc", () => {
  it("counts words and characters, and reads at 200 words a minute, never under one", () => {
    expect(countDoc("")).toEqual({ words: 0, chars: 0, minutes: 1 })
    expect(countDoc("  two words  ")).toEqual({ words: 2, chars: 13, minutes: 1 })
    expect(countDoc(Array.from({ length: 401 }, () => "w").join(" ")).minutes).toBe(3)
  })
})

describe("blockLabel", () => {
  it("names the block the caret is in", () => {
    const editor = editorWith("<h2>Goals</h2><p>Body</p>")
    editor.commands.setTextSelection(2)
    expect(blockLabel(editor)).toBe("Heading 2")
    editor.commands.setTextSelection(9)
    expect(blockLabel(editor)).toBe("Paragraph")
  })
})

function Counts({ editor }: { editor: Editor }) {
  const { words } = useDocCounts(editor as never, 400)
  return <span data-testid="words">{words}</span>
}

describe("useDocCounts", () => {
  it("counts once the writer pauses, not on every key", () => {
    vi.useFakeTimers()
    const editor = editorWith("<p>One two</p>")
    render(<Counts editor={editor} />)
    expect(screen.getByTestId("words").textContent).toBe("2")
    const getText = vi.spyOn(editor, "getText")
    for (const ch of " three four five") editor.commands.insertContentAt(editor.state.doc.content.size - 1, ch)
    expect(getText).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(450)
    })
    expect(getText).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId("words").textContent).toBe("5")
  })
})

describe("the doc editor's frame", () => {
  const src = readFileSync(join(__dirname, "docInput.tsx"), "utf8")

  it("does not render again on every keystroke", () => {
    expect(src).toMatch(/shouldRerenderOnTransaction:\s*false/)
  })

  it("reads nothing from the editor while rendering the frame: the footer and toolbar follow it themselves", () => {
    const frame = src.slice(src.indexOf("const MinimalTiptapDocInput"))
    expect(frame).not.toMatch(/editor\.isActive\(|editor\.getAttributes\(|editor\.getText\(/)
  })

  it("shows the formatting toolbar only to someone who can edit", () => {
    expect(src).toMatch(/!focusMode && canEdit && \(/)
  })
})

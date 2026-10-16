import * as React from "react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { countDoc, readingLine, useDocCounts } from "./docCounts"

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

describe("the footer's line", () => {
  it("says how long a doc is in the reader's number format, and no reading time for an empty one", () => {
    expect(readingLine({ words: 0, minutes: 0 })).toBe("0 words")
    expect(readingLine({ words: 1, minutes: 1 })).toBe("1 word, 1 min read")
    expect(readingLine({ words: 1240, minutes: 7 })).toBe(`${(1240).toLocaleString()} words, 7 min read`)
    expect(readingLine({ words: 1240, minutes: 7 })).not.toBe("1240 words, 7 min read")
  })
})

describe("countDoc", () => {
  it("counts words and characters, and reads at 200 words a minute, never under one", () => {
    expect(countDoc("")).toEqual({ words: 0, chars: 0, minutes: 0 })
    expect(countDoc("  two words  ")).toEqual({ words: 2, chars: 13, minutes: 1 })
    expect(countDoc(Array.from({ length: 401 }, () => "w").join(" ")).minutes).toBe(3)
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
    // The doc's editor is made by useDocEditor, which says so for every doc surface.
    expect(src).toMatch(/useDocEditor\(/)
    expect(readFileSync(join(__dirname, "useDocEditor.ts"), "utf8")).toMatch(/shouldRerenderOnTransaction:\s*false/)
  })

  it("reads nothing from the editor while rendering the frame: the footer and toolbar follow it themselves", () => {
    const frame = src.slice(src.indexOf("const MinimalTiptapDocInput"))
    expect(frame).not.toMatch(/editor\.isActive\(|editor\.getAttributes\(|editor\.getText\(/)
  })

  it("offers formatting only to someone who can edit", () => {
    // A reader's selection bar shows too, with only asking and commenting (docs incident, 14 Oct 2026).
    expect(src).toMatch(/\(canEdit \|\| readerBar\) && !isMobile && \(/)
    expect(src).toMatch(/canEdit && isMobile && !focusMode/)
  })

  it("has no footer: the reading time is in the meta line, the count in More", () => {
    expect(src).not.toMatch(/DocFooter/)
    expect(src).toMatch(/<DocTitle\b/)
    const meta = readFileSync(join(__dirname, "DocMetaLine.tsx"), "utf8")
    expect(meta).toMatch(/useDocCounts\(editor\)/)
    expect(meta).toMatch(/min read/)
  })
})

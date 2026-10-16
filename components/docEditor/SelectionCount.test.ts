import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { installRangeRects } from "@/lib/testing/rangeRects"
import { Editor } from "@tiptap/core"
import "@/components/docEditor/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import { slashItemsFor } from "@/components/docEditor/registry/readers"
import { countWords } from "./docCounts"
import { docCountOn, setDocCount } from "./SelectionCount"

// The word count chip (docs programme B3, editor.md P1-15): selecting 12 words
// shows "12 words" at the bottom right; /word count keeps the doc's count
// there, on this device; Chinese and Japanese count a word a character.

beforeAll(() => loadBlocks("doc", ALL_EDITIONS), 30_000)
let restoreRects = () => {}
beforeAll(() => {
  restoreRects = installRangeRects()
})
afterAll(() => restoreRects())

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
  setDocCount(false)
  document.body.innerHTML = ""
})

function docEditor(content: string) {
  const pane = document.body.appendChild(document.createElement("div"))
  pane.className = "doc-scroll"
  const editor = new Editor({ element: pane, extensions: extensionsFor(bareContext("doc")), content })
  editors.push(editor)
  return editor
}

const chip = () => document.querySelector<HTMLElement>("[data-doc-word-count]")
const until = async (f: () => unknown) => {
  for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 10))
}

describe("the word count chip", () => {
  it("shows the selection's words, and goes when nothing is selected", async () => {
    const e = docEditor("<p>one two three four five six seven eight nine ten eleven twelve and more</p>")
    e.commands.setTextSelection({ from: 1, to: 1 + "one two three four five six seven eight nine ten eleven twelve".length })
    await until(chip)
    expect(chip()?.textContent).toBe("12 words")
    e.commands.setTextSelection(3)
    expect(chip()).toBeNull()
  })

  // QA DSA-20 (14 Oct 2026): with the right panel open the chip sat on the
  // panel or its comment box. It keeps 16px inside the sheet's edge, and
  // moves when the panel opens after it showed.
  it("keeps clear of the right panel, and moves when it opens", async () => {
    const e = docEditor("<p>one two three</p>")
    // jsdom lays nothing out: the doc's pane fills the window.
    ;(e.view.dom.closest(".doc-scroll") as HTMLElement).getBoundingClientRect = () => new DOMRect(0, 0, window.innerWidth, 800)
    e.commands.setTextSelection({ from: 1, to: 8 })
    await until(chip)
    expect(chip()!.style.right).toBe("16px")
    document.documentElement.style.setProperty("--shell-right-inset", "376px")
    await until(() => chip()!.style.right === "392px")
    expect(chip()!.style.right).toBe("392px")
    document.documentElement.style.removeProperty("--shell-right-inset")
  })

  it("keeps the doc's count on after /word count, the selection's of it", async () => {
    const e = docEditor("<p>alpha beta gamma delta</p>")
    const item = slashItemsFor("doc", { ai: false }).find((i) => i.id === "wordCount")!
    expect(item.title).toBe("Word count")
    item.command({ editor: e, range: { from: 1, to: 1 } } as never)
    await until(() => chip()?.textContent?.includes("4 words"))
    expect(chip()?.textContent).toBe("4 words")
    expect(docCountOn()).toBe(true)
    e.commands.setTextSelection({ from: 1, to: 11 })
    await until(() => chip()?.textContent?.includes(" of "))
    expect(chip()?.textContent).toBe("2 of 4 words")
    ;(chip()!.querySelector('[aria-label="Hide the word count"]') as HTMLButtonElement).click()
    expect(docCountOn()).toBe(false)
    // One chip, whoever asked for it.
    expect(document.querySelectorAll("[data-doc-word-count]").length).toBeLessThanOrEqual(1)
  })
})

describe("counting words", () => {
  it("counts what spaces part, and each Chinese or Japanese character", () => {
    expect(countWords("  launch the plan  ")).toBe(3)
    expect(countWords("")).toBe(0)
    expect(countWords("发布计划")).toBe(4)
    expect(countWords("今日は launch です")).toBe(6)
  })
})

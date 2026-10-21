import * as React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Editor } from "@tiptap/core"

vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => false,
}))
// The shared popover, in place, keeping the anchor it was given (jsdom lays nothing out).
vi.mock("@/components/ui/popover", () => import("@/lib/testing/popoverAnchor"))
// The layout's width rule, as the provider reads it (for code that still asks it).
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: window.innerWidth < 640, isDesktop: window.innerWidth >= 640 }) }))

import "@/components/docEditor/registry"
import "@/components/minimal-tiptap/extensions/formatting/register"
import { actionById } from "@/components/docEditor/registry/registry"
import { createDocCommandBus } from "@/components/docEditor/registry/commandBus"
import { extensionsFor } from "@/components/docEditor/registry/factory"
import { bareContext } from "@/components/docEditor/registry/manifest"
import { loadDocBlocks, posOf } from "@/components/minimal-tiptap/extensions/block-commands/blockTestKit"
import { anchored } from "@/lib/testing/popoverAnchor"
import BlockMenuPopover from "./BlockMenuPopover"
import ColourMenu from "./ColourGrid"

// A CARD KEEPS BESIDE ITS BLOCK (20 Oct 2026). The block menu and the colour
// grid stood at the place the handle was clicked, held as numbers: the doc
// scrolled and the block went, the menu stayed. They hold the place beside
// the block now (components/ui/heldAnchor), and the grid over a selection is
// never in the corner.

beforeAll(loadDocBlocks, 60_000)

const editors: Editor[] = []
afterEach(() => {
  cleanup()
  anchored.current = null
  while (editors.length) editors.pop()!.destroy()
  document.body.innerHTML = ""
})

const box = (r: DOMRect) => [r.x, r.y, r.width, r.height]

/** A doc on the page (never focused: jsdom can't scroll a caret into view), and its block holding `text`, which measures at `place.y`. */
function docWith(text: string) {
  const editor = new Editor({ extensions: extensionsFor(bareContext("doc")), content: `<p>one</p><p>${text}</p><p>three</p>` })
  editors.push(editor)
  document.body.appendChild(editor.view.dom)
  const pos = posOf(editor.state.doc, text)
  const block = editor.view.nodeDOM(pos) as HTMLElement
  const place = { y: 100 }
  block.getBoundingClientRect = () => new DOMRect(60, place.y, 600, 24)
  return { editor, pos, block, place }
}

describe("the block menu", () => {
  it("stays beside its block as the doc scrolls under it", () => {
    const { editor, pos, block, place } = docWith("two")
    render(<BlockMenuPopover editor={editor} docId="doc-1" request={{ blocks: [pos], anchor: { left: 40, top: 100, bottom: 124 }, via: "handle" }} onClose={() => {}} />)
    expect(box(anchored.current!.getBoundingClientRect())).toEqual([40, 100, 1, 24])
    place.y = -20 // the doc scrolled 120px
    expect(box(anchored.current!.getBoundingClientRect())).toEqual([40, -20, 1, 24])
    // floating-ui listens to the block's scrolling, so it is placed again as it moves.
    expect(anchored.current!.contextElement).toBe(block)
  })
})

describe("the colour grid", () => {
  const open = (editor: Editor, state: Record<string, unknown>) => {
    actionById("colour.open", { ai: false })!.run({ docId: "d", editor, canEdit: true, bus: createDocCommandBus("d"), state })
    render(<ColourMenu docId="d" onClose={() => {}} />)
  }
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

  it("opened from the block menu, stays beside its block as the doc reflows", async () => {
    const { editor, pos, place } = docWith("two")
    const node = editor.state.doc.nodeAt(pos)!
    open(editor, { range: { from: pos, to: pos + node.nodeSize }, anchor: { left: 40, top: 100, bottom: 124 } })
    await settle()
    expect(box(anchored.current!.getBoundingClientRect())).toEqual([40, 100, 0, 24])
    place.y = 160 // a picture above it loaded
    expect(box(anchored.current!.getBoundingClientRect())).toEqual([40, 160, 0, 24])
  })

  it("over a selection with no place yet, is never in the corner", async () => {
    const { editor } = docWith("two")
    editor.commands.setTextSelection({ from: 2, to: 4 })
    open(editor, {})
    await settle()
    const r = anchored.current!.getBoundingClientRect()
    expect(r.x || r.y).toBeTruthy()
  })
})

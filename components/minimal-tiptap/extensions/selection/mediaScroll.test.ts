import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { Editor } from "@tiptap/core"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import "@/components/docEditor/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import type { EditorKind } from "@/components/docEditor/registry/types"

// V-317: on a phone, a GIF "/" added to words in the box sometimes scrolled the
// words out above it. A GIF joining the box is left selected, and the box
// scrolls the selection into view a frame later (Tiptap's focus). ProseMirror
// scrolls a selected node's whole drawing, and a picture's drawing grows its
// caption's field once the picture loads: the field's 30px took the 156px box
// past the words and the GIF together, so the scroll put the words out. One
// rule for media in every box: a selected media node whose picture already
// shows whole isn't scrolled to; one shown in part is, as before. Only the
// node's own media counts (a node view marks it data-node-media), never an icon
// or a face in its chrome, and the window is the visual viewport, as
// ProseMirror measures it (a phone's keyboard shortens it).

const KINDS: EditorKind[] = ["chat", "doc", "guest", "task"]
beforeAll(async () => {
  for (const kind of KINDS) await loadBlocks(kind, ALL_EDITIONS)
})

/** The visual viewport: jsdom has none, so a stand-in the window's size, or shorter, as under a phone's keyboard. */
const viewport = (height = window.innerHeight) => vi.stubGlobal("visualViewport", { width: window.innerWidth, height })
beforeEach(() => viewport())

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
  document.body.innerHTML = ""
  vi.unstubAllGlobals()
})

const GIF = "https://media.giphy.com/media/launch/giphy.gif"
const rect = (top: number, bottom: number) => ({ top, bottom, left: 12, right: 300, width: 288, height: bottom - top, x: 12, y: top, toJSON: () => ({}) }) as DOMRect

/**
 * A phone's box: its words, then a GIF joined the way a command's answer joins
 * them (textInput's takeCommandPost), the box 156px tall. In the app React
 * draws the image's node view (image-view-block): the picture in its frame,
 * then the caption's field once the picture has loaded. jsdom draws no node
 * view, so a stand-in is the selected node's drawing: "picture", the picture
 * marked as the node's own media, then the caption's field; "card", a card's
 * drawing, its words, then a decorative icon (a link's favicon, a face) that
 * is no node's media; "plain", jsdom's own drawing, the node as a bare picture
 * that marks no media (in the app every media node draws through its node view,
 * so a drawing is never the picture itself).
 */
function boxWithGif(kind: EditorKind, { draw = "picture" }: { draw?: "picture" | "card" | "plain" } = {}) {
  const box = document.createElement("div")
  box.style.overflowY = "auto"
  box.getBoundingClientRect = () => rect(600, 756)
  const element = document.createElement("div")
  box.appendChild(element)
  document.body.appendChild(box)
  const e = new Editor({ element, extensions: extensionsFor(bareContext(kind, ALL_EDITIONS)), content: "<p>Look at this</p>" })
  editors.push(e)
  e.chain().focus("end").insertContent(`<img src="${GIF}" width="88" height="88">`).run()
  const at = e.state.selection.from
  if (draw === "plain") return { e, picture: e.view.nodeDOM(at) as HTMLElement }
  const drawn = element.appendChild(document.createElement("div"))
  if (draw === "card") drawn.appendChild(document.createElement("p")).textContent = "Launch notes"
  const picture = drawn.appendChild(document.createElement("img"))
  if (draw === "card") {
    picture.alt = ""
    picture.setAttribute("aria-hidden", "true")
    drawn.getBoundingClientRect = () => rect(560, 700)
  } else {
    picture.setAttribute("data-node-media", "true")
    drawn.appendChild(document.createElement("input")).placeholder = "Add a caption"
    drawn.getBoundingClientRect = () => rect(630, 784)
  }
  const nodeDOM = e.view.nodeDOM.bind(e.view)
  e.view.nodeDOM = (pos: number) => (pos === at ? drawn : nodeDOM(pos))
  return { e, picture }
}

const scrollsTo = (e: Editor) => !e.view.someProp("handleScrollToSelection", (f) => f(e.view))

describe("a selected picture, video or frame in a box (V-317)", () => {
  it("leaves a GIF joining the words selected, as the scroll the box makes a frame later finds it", () => {
    const { e } = boxWithGif("chat")
    expect(e.state.selection).toBeInstanceOf(NodeSelection)
    expect((e.state.selection as NodeSelection).node.type.name).toBe("image")
  })

  it("isn't scrolled to while its picture shows whole, though its caption's field reaches below the box, so the words stay", () => {
    for (const kind of KINDS) {
      const { e, picture } = boxWithGif(kind)
      picture.getBoundingClientRect = () => rect(630, 718)
      expect(scrollsTo(e), kind).toBe(false)
    }
  })

  it("leaves a node drawn with no marked media to ProseMirror's own scroll, though its drawing is a picture that shows whole", () => {
    const { e, picture } = boxWithGif("chat", { draw: "plain" })
    expect(picture.tagName).toBe("IMG")
    picture.getBoundingClientRect = () => rect(630, 718)
    expect(scrollsTo(e)).toBe(true)
  })

  it("is scrolled to, the node whole as before, when its picture shows in part: past the box's foot, above its top, or off the screen", () => {
    const { e, picture } = boxWithGif("chat")
    for (const [top, bottom] of [[700, 788], [560, 648], [-40, 48]]) {
      picture.getBoundingClientRect = () => rect(top, bottom)
      expect(scrollsTo(e), `${top}-${bottom}`).toBe(true)
    }
  })

  it("is scrolled to, as before, when only a decorative icon in its chrome shows whole: a card cut at its top", () => {
    for (const kind of KINDS) {
      const { e, picture } = boxWithGif(kind, { draw: "card" })
      picture.getBoundingClientRect = () => rect(680, 696)
      expect(scrollsTo(e), kind).toBe(true)
    }
  })

  it("is scrolled to while a phone's keyboard covers its picture: the window is the visual viewport, as ProseMirror measures it", () => {
    const { e, picture } = boxWithGif("chat")
    picture.getBoundingClientRect = () => rect(630, 718)
    expect(scrollsTo(e)).toBe(false)
    viewport(700)
    expect(scrollsTo(e)).toBe(true)
  })

  it("is scrolled to as before while its picture has no size yet", () => {
    const { e, picture } = boxWithGif("chat")
    picture.getBoundingClientRect = () => rect(630, 630)
    expect(scrollsTo(e)).toBe(true)
  })

  it("leaves a caret in the words to ProseMirror's own scroll", () => {
    const { e, picture } = boxWithGif("chat")
    picture.getBoundingClientRect = () => rect(630, 718)
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, 3)))
    expect(scrollsTo(e)).toBe(true)
  })
})

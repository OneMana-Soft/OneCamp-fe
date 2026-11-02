import { Extension } from "@tiptap/core"
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

/**
 * The media a selected node draws: the picture, video or frame its node view
 * marks data-node-media (image-view-block, file-block-view, web-embed-view),
 * never its chrome (a caption's field, a card's favicon or faces); null for any
 * other selection. Every media node draws through its node view, so its
 * drawing is the view's wrapper, never the media itself.
 */
function selectedMedia(view: EditorView): Element | null {
  const selection = view.state.selection
  if (!(selection instanceof NodeSelection)) return null
  const drawn = view.nodeDOM(selection.from)
  return drawn instanceof Element ? drawn.querySelector("[data-node-media]") : null
}

/** Whether a box's overflow clips what it holds. */
const clips = (overflow: string) => /^(hidden|clip|scroll|auto)$/.test(overflow)

/**
 * Whether el shows whole: it has a size, and it is inside the window and inside
 * every box around it that clips what it holds. The window is the visual
 * viewport, as ProseMirror measures it (a phone's keyboard shortens it); with
 * none, ProseMirror's own scroll runs.
 */
function showsWhole(el: Element): boolean {
  const r = el.getBoundingClientRect()
  if (r.height <= 0 || r.width <= 0) return false
  const vp = window.visualViewport
  if (!vp || r.top < 0 || r.left < 0 || r.bottom > vp.height || r.right > vp.width) return false
  for (let p = el.parentElement; p && p !== el.ownerDocument.body; p = p.parentElement) {
    const style = getComputedStyle(p)
    if (!clips(style.overflowX) && !clips(style.overflowY)) continue
    const b = p.getBoundingClientRect()
    if (r.top < b.top || r.bottom > b.bottom || r.left < b.left || r.right > b.right) return false
  }
  return true
}

/**
 * One rule for media in every box (V-317): a selected media node whose
 * picture already shows whole isn't scrolled to; one shown in part is, the
 * node whole, as ProseMirror does.
 *
 * Media joining a box is left selected (a GIF a command adds to the words
 * there, a picture pasted or dropped), and the box scrolls the selection into
 * view a frame later (Tiptap's focus). ProseMirror scrolls a selected node's
 * whole drawing, and a picture's grows its caption's field once the picture
 * loads: in a phone's 156px box that field took the box past the words and the
 * GIF together, so the scroll put the words out above the GIF whenever the
 * picture loaded before that frame.
 */
export const MediaScroll = Extension.create({
  name: "mediaScroll",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("mediaScroll"),
        props: {
          handleScrollToSelection(view) {
            const media = selectedMedia(view)
            return !!media && showsWhole(media)
          },
        },
      }),
    ]
  },
})

import { Extension } from '@tiptap/react'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { approxDataUrlBytes, dataURLToFile, isDataURL } from '@/lib/utils/uploadLimit'

// offloadEmbeddedImages — moves an image that arrived INSIDE the content out to
// object storage, and replaces it with a normal URL.
//
// WHY. An image can enter a document without ever touching the upload path.
// Pasting from a word processor, a webmail client or another wiki brings
// <img src="data:image/png;base64,…"> along with the HTML, and the editor accepts
// base64 images, so nothing intercepts it. Those bytes then live in the document
// body: stored in the primary store, and indexed as analysed text — which is how a
// single document exhausted a search node's heap and stopped it.
//
// Removing the editor's base64 FALLBACKS closed the failure path where an upload
// was refused. This closes the one where no upload was ever attempted, and it is
// the door most likely to be used, because pasting a screenshot into a page is
// completely ordinary behaviour.
//
// The behaviour is what a person expects from a modern editor: paste an image, it
// appears immediately, and it quietly becomes a hosted image. Nobody is asked to
// do anything differently.
//
// SAFETY PROPERTIES, each of which is a way this could go wrong:
//   - It NEVER removes or rewrites content it could not upload. A failed offload
//     leaves the document exactly as the author left it; the server-side caps are
//     the safety net for that case, not this extension.
//   - It never retries a payload it has already attempted, so a permanently
//     failing upload cannot loop forever against the server.
//   - It re-locates the node by its payload after the upload, because positions
//     shift while an async upload is in flight and writing to a stale position
//     would corrupt an unrelated part of the document.
//   - Uploads run one at a time, so pasting a page full of images does not open
//     twenty parallel requests.
//   - It skips payloads too small to be worth a round trip (an inline tracking
//     pixel or a tiny SVG marker), which keeps ordinary rich text untouched.

/** OffloadEmbeddedImagesOptions configures the extension. */
interface OffloadEmbeddedImagesOptions {
  /**
   * upload receives the decoded file and returns the hosted URL to use instead.
   * Rejecting leaves the image untouched. Null disables the extension entirely,
   * which is the correct behaviour for a read-only or preview editor.
   */
  upload: ((file: File) => Promise<string>) | null
  /**
   * minBytes is the smallest decoded payload worth offloading. Below this the
   * round trip costs more than the bytes save, and inline markers are legitimate.
   */
  minBytes: number
  /** onError is called once per payload that could not be offloaded. */
  onError?: (message: string) => void
  /** nodeName is the image node type to scan. */
  nodeName: string
}

/**
 * Whether a transaction came from another person, through Yjs (y-prosemirror
 * marks those with its 'y-sync$' meta). Remote changes are left alone (I6):
 * the person who pasted an image offloads it, not every tab that receives it.
 */
export function isRemoteTransaction(tr: Transaction): boolean {
  const meta = tr.getMeta('y-sync$') as { isChangeOrigin?: boolean; isUndoRedoOperation?: boolean } | undefined
  // Undo and redo come through Yjs too, but they are this person's own.
  return meta?.isChangeOrigin === true && meta.isUndoRedoOperation !== true
}

/**
 * The ranges of tr.doc a transaction changed, from its steps' maps, each
 * carried through the steps after it. Typing one letter is one tiny range.
 */
export function changedRanges(tr: Transaction): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const maps = tr.mapping.maps
  maps.forEach((map, i) => {
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      let from = newStart
      let to = newEnd
      for (let j = i + 1; j < maps.length; j++) {
        from = maps[j].map(from, -1)
        to = maps[j].map(to, 1)
      }
      out.push([from, to])
    })
  })
  return out
}

/**
 * shouldOffloadSrc decides whether one src is a payload worth moving out of the
 * document. Pure, so the decision is unit-tested without an editor:
 *
 *   - only inline `data:` payloads qualify; a hosted URL is already fine
 *   - only payloads at or above minBytes, so small inline markers are left alone
 *   - never something already attempted, which is what stops a retry loop
 */
export function shouldOffloadSrc(src: unknown, minBytes: number, attempted: ReadonlySet<string>): boolean {
  if (!isDataURL(src) || typeof src !== 'string') return false
  if (attempted.has(src)) return false
  return approxDataUrlBytes(src) >= minBytes
}

const OffloadEmbeddedImagesPluginKey = new PluginKey('offloadEmbeddedImages')

export const OffloadEmbeddedImages = Extension.create<OffloadEmbeddedImagesOptions>({
  name: 'offloadEmbeddedImages',

  addOptions() {
    return {
      upload: null,
      // 8 KB: comfortably above an inline icon or tracking pixel, well below any
      // real screenshot, so the common cases fall on the right side without tuning.
      minBytes: 8 * 1024,
      onError: undefined,
      nodeName: 'image',
    }
  },

  addProseMirrorPlugins() {
    const options = this.options
    if (typeof options.upload !== 'function') return []

    // Payloads already handled or already failed. Keyed by the payload itself, so
    // the same image pasted twice is only uploaded once and a failure is not
    // retried. Lives for the editor's lifetime, which is the right scope: a new
    // editor is a new chance to succeed.
    const attempted = new Set<string>()
    // Serial queue: one upload at a time.
    let queue: Promise<void> = Promise.resolve()

    // The ranges this editor's own changes touched since the view last
    // looked, in the newest doc's positions (appendTransaction records them;
    // the view's update, right after, reads and clears them).
    let pending: Array<[number, number]> = []

    // Only what changed is looked at: typing a letter looks at that letter's
    // block, not the whole doc. This walked every node of the doc on every
    // change, remote ones included (N21), which grows with the doc (I20).
    const collect = (doc: PMNode, ranges: Array<[number, number]>): string[] => {
      const found: string[] = []
      const size = doc.content.size
      for (const [a, b] of ranges) {
        const from = Math.max(0, Math.min(a, size))
        const to = Math.max(from, Math.min(b, size))
        doc.nodesBetween(from, to, (node) => {
          if (node.type.name !== options.nodeName) return
          const src = node.attrs?.src
          if (shouldOffloadSrc(src, options.minBytes, attempted) && !found.includes(src as string)) found.push(src as string)
        })
      }
      return found
    }

    // replaceSrc re-finds the node by its payload and swaps in the hosted URL.
    // Re-finding is essential: the position recorded before the upload may now
    // point somewhere else entirely.
    const replaceSrc = (view: EditorView, payload: string, hostedSrc: string) => {
      if (view.isDestroyed) return
      let pos: number | null = null
      view.state.doc.descendants((node, nodePos) => {
        if (pos !== null) return false
        if (node.type.name === options.nodeName && node.attrs?.src === payload) pos = nodePos
        return true
      })
      if (pos === null) return // the author deleted it while it was uploading
      const node = view.state.doc.nodeAt(pos)
      if (!node) return
      view.dispatch(
        view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: hostedSrc }),
      )
    }

    const process = (view: EditorView, payload: string) => {
      // Mark before starting: an update fires again as soon as we dispatch, and
      // without this the same payload would be picked up repeatedly.
      attempted.add(payload)
      const file = dataURLToFile(payload)
      if (!file) return
      queue = queue
        .then(async () => {
          if (view.isDestroyed) return
          try {
            const hostedSrc = await options.upload!(file)
            if (typeof hostedSrc === 'string' && hostedSrc !== '') {
              replaceSrc(view, payload, hostedSrc)
            }
          } catch {
            // Deliberately silent about the document: the image stays exactly as
            // the author left it. Only the person is told.
            options.onError?.('An image couldn’t be uploaded, so it stays embedded in this page. Try replacing it.')
          }
        })
        // Never let one rejection break the queue for everything after it.
        .catch(() => undefined)
    }

    return [
      new Plugin({
        key: OffloadEmbeddedImagesPluginKey,
        // Observes, never appends: it returns nothing.
        appendTransaction: (transactions) => {
          for (const tr of transactions) {
            if (!tr.docChanged) continue
            // Earlier ranges move with this transaction's changes.
            pending = pending.map(([a, b]) => [tr.mapping.map(a, -1), tr.mapping.map(b, 1)])
            if (isRemoteTransaction(tr)) continue
            pending.push(...changedRanges(tr))
          }
          return null
        },
        view: () => ({
          update: (view: EditorView) => {
            if (pending.length === 0) return
            const ranges = pending
            pending = []
            // A read-only editor never writes (a reader's, a guest's): it has
            // no right to change the document, and a guest has no session to
            // upload with, so the attempt only failed and said so.
            if (!view.editable) return
            for (const payload of collect(view.state.doc, ranges)) process(view, payload)
          },
        }),
      }),
    ]
  },
})

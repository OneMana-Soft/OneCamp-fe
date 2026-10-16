import { describe, it, expect } from 'vitest'
import { shouldOffloadSrc } from './offloadEmbeddedImages'

// The decision of WHICH payloads to move out of a document is the part that has to
// be right: too eager and it uploads inline markers or loops forever, too lax and a
// pasted screenshot stays embedded and reaches the search index.

const dataURL = (bytes: number) => `data:image/png;base64,${'A'.repeat(Math.ceil((bytes * 4) / 3))}`
const MIN = 8 * 1024

describe('shouldOffloadSrc', () => {
  it('offloads an embedded payload big enough to matter', () => {
    expect(shouldOffloadSrc(dataURL(64 * 1024), MIN, new Set())).toBe(true)
  })

  // A hosted image is already fine; re-uploading it would be pointless work and
  // would churn object storage on every keystroke.
  it('ignores anything already hosted', () => {
    expect(shouldOffloadSrc('https://cdn.example.com/a.png', MIN, new Set())).toBe(false)
    expect(shouldOffloadSrc('/uploads/a.png', MIN, new Set())).toBe(false)
    expect(shouldOffloadSrc('', MIN, new Set())).toBe(false)
  })

  // An inline marker or tracking pixel is legitimate rich text. Uploading it would
  // cost a round trip and clutter storage for no benefit.
  it('leaves small inline markers alone', () => {
    expect(shouldOffloadSrc(dataURL(512), MIN, new Set())).toBe(false)
    expect(shouldOffloadSrc('data:image/gif;base64,R0lGODlhAQABAA==', MIN, new Set())).toBe(false)
  })

  it('treats the threshold as inclusive', () => {
    const atLimit = dataURL(MIN)
    expect(shouldOffloadSrc(atLimit, MIN, new Set())).toBe(true)
  })

  // THE LOOP GUARD. Without this, a payload whose upload keeps failing would be
  // retried on every editor update, hammering the server forever.
  it('never re-attempts a payload it has already tried', () => {
    const src = dataURL(64 * 1024)
    const attempted = new Set([src])
    expect(shouldOffloadSrc(src, MIN, attempted)).toBe(false)
  })

  it('does not confuse two different payloads', () => {
    const a = dataURL(64 * 1024)
    const b = `data:image/jpeg;base64,${'B'.repeat(90000)}`
    expect(shouldOffloadSrc(b, MIN, new Set([a]))).toBe(true)
  })

  it('is safe on non-string attributes', () => {
    for (const bad of [undefined, null, 0, {}, []]) {
      expect(shouldOffloadSrc(bad, MIN, new Set())).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// What it looks at (docs programme A2; I20 and N21): only what this editor
// changed, never the whole doc, and never someone else's change.
// ---------------------------------------------------------------------------
import { Editor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { Image } from '@tiptap/extension-image'
import { TextSelection } from '@tiptap/pm/state'
import { vi, afterEach } from 'vitest'
import { OffloadEmbeddedImages, changedRanges, isRemoteTransaction } from './offloadEmbeddedImages'

const editors: Editor[] = []
afterEach(() => {
  editors.splice(0).forEach((e) => e.destroy())
  vi.restoreAllMocks()
})
const big = (n: number) => Array.from({ length: n }, (_, i) => `<p>Block ${i} says something</p>`).join('')
function make(content: string) {
  const uploaded: string[] = []
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ history: false }),
      Image.configure({ allowBase64: true }),
      OffloadEmbeddedImages.configure({ upload: async (file: File) => (uploaded.push(file.name), 'https://cdn.example.com/hosted.png') }),
    ],
    content,
  })
  editors.push(editor)
  return { editor, uploaded }
}

describe('the offload looks only at what changed here', () => {
  it('offloads an image pasted by this person', async () => {
    const { editor, uploaded } = make('<p>Hello</p>')
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: 'image', attrs: { src: dataURL(64 * 1024) } })
    await vi.waitFor(() => expect(uploaded).toHaveLength(1))
    await vi.waitFor(() => expect(editor.getHTML()).toContain('https://cdn.example.com/hosted.png'))
  })

  it("leaves an image that arrived in someone else's change to them (N21)", async () => {
    const { editor, uploaded } = make('<p>Hello</p>')
    const tr = editor.state.tr.insert(editor.state.doc.content.size, editor.schema.nodes.image.create({ src: dataURL(64 * 1024) }))
    tr.setMeta('y-sync$', { isChangeOrigin: true })
    expect(isRemoteTransaction(tr)).toBe(true)
    editor.view.dispatch(tr)
    await new Promise((r) => setTimeout(r, 20))
    expect(uploaded).toHaveLength(0)
  })

  it('treats undo and redo through Yjs as this person\'s own', () => {
    const { editor } = make('<p>Hello</p>')
    const tr = editor.state.tr.insertText('x', 1).setMeta('y-sync$', { isChangeOrigin: true, isUndoRedoOperation: true })
    expect(isRemoteTransaction(tr)).toBe(false)
  })

  it('a keystroke in a 2,000-block doc looks at that keystroke, not the doc', () => {
    const { editor } = make(`${big(2000)}<p>End</p>`)
    const proto = Object.getPrototypeOf(editor.state.doc)
    const descendants = vi.spyOn(proto, 'descendants')
    const nodesBetween = vi.spyOn(proto, 'nodesBetween')
    const end = editor.state.doc.content.size - 1
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, end)))
    for (let i = 0; i < 10; i++) editor.view.dispatch(editor.state.tr.insertText('a', editor.state.selection.from))
    expect(descendants).not.toHaveBeenCalled()
    const spans = nodesBetween.mock.calls.map(([from, to]) => (to as number) - (from as number))
    expect(spans.length).toBeGreaterThan(0)
    expect(Math.max(...spans)).toBeLessThan(10)
  })

  it('carries each step\'s range through the steps after it', () => {
    const { editor } = make('<p>abcdef</p>')
    const tr = editor.state.tr.insertText('XY', 2).delete(1, 2)
    expect(changedRanges(tr)).toEqual([[1, 3], [1, 1]])
  })
})

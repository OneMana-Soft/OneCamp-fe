import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { Editor, type JSONContent } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import { BLOCK_ID_ATTR, BlockId } from './blockId'
import { duplicateBlocks, targetBlocks } from '../block-commands/commands'

// Block identity between tabs (docs programme §4 #4, I6): each tab gives ids
// only in its own transactions, so two tabs never fight over a block, and the
// ids they give never collide. Two real editors, each on its own Y.Doc, synced
// both ways as the collaboration server would.

const REMOTE = 'remote'
const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
})

function tab(doc: Y.Doc) {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ history: false }), Collaboration.configure({ document: doc, field: 'default' }), BlockId],
  })
  editors.push(editor)
  return editor
}

/** ⌘D, as B1's block commands run it: what the selection covers, copied below. */
function duplicate(editor: Editor) {
  const tr = duplicateBlocks(editor.state, targetBlocks(editor.state))
  if (tr) editor.view.dispatch(tr)
}

/** Two tabs on one doc. `local(doc)` counts the updates a tab wrote itself (not what it was sent). */
function pair(initial?: (doc: Y.Doc) => void) {
  const a = new Y.Doc()
  const b = new Y.Doc()
  initial?.(a)
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), REMOTE)
  const written = new Map<Y.Doc, number>([[a, 0], [b, 0]])
  let connected = true
  const relay = (from: Y.Doc, to: Y.Doc) =>
    from.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE) return
      written.set(from, (written.get(from) ?? 0) + 1)
      if (connected) Y.applyUpdate(to, update, REMOTE)
    })
  relay(a, b)
  relay(b, a)
  const ea = tab(a)
  const eb = tab(b)
  return {
    a: ea,
    b: eb,
    written: (e: Editor) => written.get(e === ea ? a : b) ?? 0,
    offline() {
      connected = false
    },
    online() {
      connected = true
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), REMOTE)
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), REMOTE)
    },
  }
}

/** [type, id] of every block, in order. */
function blocks(editor: Editor): Array<[string, string | null]> {
  const out: Array<[string, string | null]> = []
  editor.state.doc.descendants((node) => {
    if (node.isBlock) out.push([node.type.name, (node.attrs[BLOCK_ID_ATTR] as string | null) ?? null])
    return true
  })
  return out
}
const ids = (editor: Editor) => blocks(editor).map(([, id]) => id)

/** The id of the paragraph whose text is exactly this. */
function idOf(editor: Editor, exactly: string): string | null {
  let id: string | null | undefined
  editor.state.doc.descendants((node) => {
    if (id === undefined && node.type.name === 'paragraph' && node.textContent === exactly) id = (node.attrs[BLOCK_ID_ATTR] as string | null) ?? null
    return id === undefined
  })
  if (id === undefined) throw new Error(`no paragraph reading "${exactly}"`)
  return id
}
const text = (editor: Editor) => editor.getText()

/** A paragraph's start and end positions (inside it), by its text. */
function paragraph(editor: Editor, has: string): { from: number; to: number } {
  let found: { from: number; to: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (!found && node.type.name === 'paragraph' && node.textContent.includes(has)) found = { from: pos + 1, to: pos + node.nodeSize - 1 }
    return !found
  })
  if (!found) throw new Error(`no paragraph with "${has}"`)
  return found
}

/** A legacy block: written by something that gave it no id (a server write before block ids). */
function legacyParagraph(doc: Y.Doc, text: string) {
  const p = new Y.XmlElement('paragraph')
  p.insert(0, [new Y.XmlText(text)])
  doc.getXmlFragment('default').insert(doc.getXmlFragment('default').length, [p])
}

describe('block ids between two tabs', () => {
  it('gives a block made in a tab its id there, and the other tab writes nothing back', () => {
    const t = pair()
    t.a.commands.insertContent('<p>Launch</p><p>Ship on Thursday</p>')
    expect(ids(t.a).every(Boolean)).toBe(true)
    expect(ids(t.b)).toEqual(ids(t.a))
    // Tab B only received: a remote transaction never assigns one (I6).
    expect(t.written(t.b)).toBe(0)
  })

  it('never assigns an id in a remote transaction, only when this tab edits the block', () => {
    const t = pair((doc) => legacyParagraph(doc, 'written before block ids'))
    expect(ids(t.a)).toEqual([null])
    expect(t.written(t.a) + t.written(t.b)).toBe(0)
    // Typing in it gives it one, in the tab that typed.
    const { to } = paragraph(t.a, 'written before')
    t.a.chain().setTextSelection(to).insertContent('!').run()
    const [id] = ids(t.a)
    expect(id).toBeTruthy()
    expect(ids(t.b)).toEqual([id])
    expect(t.written(t.b)).toBe(0)
  })

  it('keeps a block its id when Enter is pressed at its start: the id follows the text', () => {
    const t = pair()
    t.a.commands.insertContent('<p>Ship on Thursday</p>')
    const before = idOf(t.a, 'Ship on Thursday')
    expect(before).toBeTruthy()
    const { from } = paragraph(t.a, 'Ship on Thursday')
    t.a.chain().setTextSelection(from).splitBlock().run()
    expect(idOf(t.a, 'Ship on Thursday')).toBe(before)
    expect(idOf(t.b, 'Ship on Thursday')).toBe(before)
    const all = ids(t.a).filter(Boolean)
    expect(new Set(all).size).toBe(all.length)
  })

  it('never gives two blocks one id when both tabs split the same block at once', () => {
    const t = pair()
    t.a.commands.insertContent('<p>one two three</p>')
    t.offline()
    const pa = paragraph(t.a, 'one two three')
    t.a.chain().setTextSelection(pa.from).splitBlock().run()
    const pb = paragraph(t.b, 'one two three')
    t.b.chain().setTextSelection(pb.from + 4).splitBlock().run()
    t.b.chain().setTextSelection(pb.to + 1).splitBlock().run()
    t.online()
    expect(text(t.a)).toBe(text(t.b))
    expect(ids(t.a)).toEqual(ids(t.b))
    const all = ids(t.a).filter(Boolean)
    expect(new Set(all).size).toBe(all.length)
  })

  it('gives a pasted block an id of its own, even when it was copied from this doc', () => {
    const t = pair()
    t.a.commands.insertContent('<p>Launch</p>')
    const [original] = ids(t.a).filter(Boolean)
    const copied: JSONContent = { type: 'paragraph', attrs: { [BLOCK_ID_ATTR]: original }, content: [{ type: 'text', text: 'Launch, again' }] }
    t.a.commands.insertContentAt(t.a.state.doc.content.size, copied)
    const all = ids(t.a)
    expect(all.filter((id) => id === original)).toHaveLength(1)
    expect(new Set(all).size).toBe(all.length)
    expect(ids(t.b)).toEqual(all)
  })

  it('gives a duplicated block (⌘D), and every block inside it, ids of their own', () => {
    const t = pair()
    t.a.commands.setContent('<blockquote data-block-id="q-1"><p data-block-id="p-1">quoted</p><p data-block-id="p-2">twice</p></blockquote>')
    // The line the caret is in: the quote's second (its first line is the
    // quote itself, as B1's blocks are taken).
    t.a.commands.setTextSelection(11)
    duplicate(t.a)
    const lines = ids(t.a)
    expect(lines).toHaveLength(4)
    expect(lines.slice(0, 2)).toEqual(['q-1', 'p-1'])
    expect(new Set(lines).size).toBe(4)
    // The whole quote, selected: it and the lines inside it.
    t.a.commands.setNodeSelection(0)
    duplicate(t.a)
    const all = ids(t.a)
    expect(all).toHaveLength(8)
    expect(all.slice(0, 4)).toEqual(lines)
    expect(new Set(all).size).toBe(8)
    expect(ids(t.b)).toEqual(all)
  })

  it('writes ids as data-block-id and reads them back', () => {
    const t = pair()
    t.a.commands.setContent('<p data-block-id="b-1">kept</p>')
    expect(t.a.getHTML()).toContain('data-block-id="b-1"')
    expect(ids(t.a)).toEqual(['b-1'])
  })

  it('gives no ids in a tab that may not edit', () => {
    const t = pair((doc) => legacyParagraph(doc, 'read only'))
    t.b.setEditable(false)
    t.b.commands.insertContent('x')
    expect(ids(t.a).filter(Boolean)).toHaveLength(0)
  })
})

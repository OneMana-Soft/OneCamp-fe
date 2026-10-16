import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { Editor, Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import { anchorFor, bindingOf } from '@/lib/anchors/anchors'
import type { ResolvedAnchor } from '@/lib/anchors/types'
import { AnchorDecorations, anchorDecorationsKey } from './anchorDecorations'

let editors: Editor[] = []
afterEach(() => {
  editors.forEach((e) => e.destroy())
  editors = []
})

/** A doc editor bound to a Yjs doc, as the doc page's is, reporting where anchors are. */
function editorOn(ydoc: Y.Doc, seen: ReadonlyMap<string, ResolvedAnchor>[]) {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: ydoc }),
      AnchorDecorations.configure({ onResolve: (r) => seen.push(r) }),
    ],
  })
  editors.push(editor)
  return editor
}

/** Block ids on paragraphs and dividers, as the doc's editor gives every block one. */
const BlockIds = Extension.create({
  name: 'testBlockIds',
  addGlobalAttributes: () => [
    {
      types: ['paragraph', 'horizontalRule'],
      attributes: {
        blockId: {
          default: null,
          parseHTML: (el: HTMLElement) => el.getAttribute('data-block-id'),
          renderHTML: (a: { blockId?: string | null }) => (a.blockId ? { 'data-block-id': a.blockId } : {}),
        },
      },
    },
  ],
})

/** A doc editor with block ids, on its own (block anchors need no Yjs). */
function blocksEditor(html: string, seen: ReadonlyMap<string, ResolvedAnchor>[] = []) {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, BlockIds, AnchorDecorations.configure({ onResolve: (r) => seen.push(r) })],
    content: html,
  })
  editors.push(editor)
  return editor
}

/** Where block id's text is, from its start to its end. */
function blockAt(editor: Editor, id: string) {
  let at = { from: -1, to: -1 }
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs.blockId === id) at = { from: pos, to: pos + node.nodeSize }
  })
  return at
}

const highlighted = (editor: Editor) =>
  Array.from(editor.view.dom.querySelectorAll('.thread-anchor')).map((el) => el.textContent).join('|')

describe('anchor decorations', () => {
  it('draw a thread on its words, follow edits from both sides, and say when it is detached', () => {
    const a = new Y.Doc()
    const b = new Y.Doc()
    a.on('update', (u: Uint8Array, o: unknown) => o !== 'net' && Y.applyUpdate(b, u, 'net'))
    b.on('update', (u: Uint8Array, o: unknown) => o !== 'net' && Y.applyUpdate(a, u, 'net'))

    const seen: ReadonlyMap<string, ResolvedAnchor>[] = []
    const mine = editorOn(a, seen)
    const theirs = editorOn(b, [])
    mine.commands.setContent('<p>We ship on Thursday, then rest.</p>')
    expect(theirs.getText()).toBe('We ship on Thursday, then rest.')

    const text = mine.state.doc.textContent
    const from = text.indexOf('ship') + 1
    const anchor = anchorFor(bindingOf(mine.state)!, mine.state.doc, from, from + 'ship on Thursday'.length)
    mine.commands.setThreadAnchors([{ id: 't1', anchor }], { synced: true })
    expect(highlighted(mine)).toBe('ship on Thursday')
    expect(seen.at(-1)?.get('t1')?.state).toBe('attached')

    // My own typing before it moves it by mapping.
    mine.commands.insertContentAt(1, 'So ')
    expect(highlighted(mine)).toBe('ship on Thursday')

    // Theirs arrives as a remote change: read again from Yjs.
    theirs.commands.insertContentAt(1, 'Note: ')
    expect(mine.state.doc.textContent.startsWith('Note: So We')).toBe(true)
    expect(highlighted(mine)).toBe('ship on Thursday')

    // They delete the words: detached, with the quote, and nothing drawn.
    const t2 = theirs.state.doc.textContent
    const at = t2.indexOf('ship on Thursday') + 1
    theirs.commands.deleteRange({ from: at, to: at + 'ship on Thursday'.length })
    expect(highlighted(mine)).toBe('')
    expect(seen.at(-1)?.get('t1')).toEqual({ state: 'detached', reason: 'deleted', quote: 'ship on Thursday' })
    // Nothing was written into the doc for any of it.
    expect(mine.getHTML()).not.toContain('thread')
  })

  it('draws nothing until the doc has synced, and leaves remote transactions alone', () => {
    const a = new Y.Doc()
    const seen: ReadonlyMap<string, ResolvedAnchor>[] = []
    const editor = editorOn(a, seen)
    editor.commands.setContent('<p>Hello world</p>')
    const anchor = anchorFor(bindingOf(editor.state)!, editor.state.doc, 1, 6)
    editor.commands.setThreadAnchors([{ id: 't', anchor, active: true }])
    expect(seen.at(-1)?.get('t')).toEqual({ state: 'pending' })
    expect(highlighted(editor)).toBe('')
    editor.commands.setThreadAnchors([{ id: 't', anchor, active: true }], { synced: true })
    expect(editor.view.dom.querySelector('.thread-anchor-active')?.textContent).toBe('Hello')
    // A lineage the doc doesn't have detaches it.
    editor.commands.setThreadAnchors([{ id: 't', anchor }], { synced: true, lineage: 'other' })
    expect(anchorDecorationsKey.getState(editor.state)?.resolved.get('t')).toMatchObject({ state: 'detached', reason: 'lineage' })
  })

  // B7: the block menu's Comment on blocks chosen apart.
  it('draw a thread on blocks chosen together on each of them, never on what lies between', () => {
    const seen: ReadonlyMap<string, ResolvedAnchor>[] = []
    const editor = blocksEditor('<p data-block-id="a">Plan</p><p data-block-id="b">Budget</p><p data-block-id="c">Dates</p>', seen)
    editor.commands.setThreadAnchors(
      [{ id: 't', anchor: { kind: 'block', block_id: 'a', quote: 'Plan\nDates', meta: { block_ids: ['a', 'c'] } } }],
      { synced: true },
    )
    expect(highlighted(editor)).toBe('Plan|Dates')

    // The first block deleted by my own edit: still on the other, never detached.
    const a = blockAt(editor, 'a')
    editor.commands.deleteRange(a)
    expect(highlighted(editor)).toBe('Dates')
    const r = seen.at(-1)?.get('t')
    expect(r?.state === 'attached' && editor.state.doc.textBetween(r.from, r.to)).toBe('Dates')

    // Both gone: detached, with the quote.
    editor.commands.deleteRange(blockAt(editor, 'c'))
    expect(seen.at(-1)?.get('t')).toEqual({ state: 'detached', reason: 'deleted', quote: 'Plan\nDates' })
    expect(highlighted(editor)).toBe('')
  })

  it('outline a block with no words of its own, and keep a block whose words were all deleted', () => {
    const seen: ReadonlyMap<string, ResolvedAnchor>[] = []
    const editor = blocksEditor('<p data-block-id="p">Keep me</p><hr data-block-id="d">', seen)
    editor.commands.setThreadAnchors(
      [
        { id: 'line', anchor: { kind: 'block', block_id: 'd', quote: 'Divider', meta: { named: true } }, active: true },
        { id: 'words', anchor: { kind: 'block', block_id: 'p', quote: 'Keep me' } },
      ],
      { synced: true },
    )
    const hr = editor.view.dom.querySelector('hr')
    expect(hr?.classList.contains('thread-anchor-block')).toBe(true)
    expect(hr?.classList.contains('thread-anchor-block-active')).toBe(true)
    expect(hr?.getAttribute('data-thread-id')).toBe('line')
    expect(highlighted(editor)).toBe('Keep me')

    // All its words deleted by my own edit: the block is still there, so the thread is too.
    editor.commands.deleteRange({ from: 1, to: 8 })
    expect(seen.at(-1)?.get('words')?.state).toBe('attached')
    expect(editor.view.dom.querySelector('p.thread-anchor-block')?.getAttribute('data-thread-id')).toBe('words')
  })
})

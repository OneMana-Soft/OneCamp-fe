import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { Editor, Extension, type AnyExtension, type JSONContent } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { yUndoPluginKey } from 'y-prosemirror'
import { proposeReplacement } from '@/lib/proposals/review'
import { Proposals, acceptProposal, showProposal } from '../proposals/proposals'
import { BLOCK_ID_ATTR, BlockId, isRemote } from './blockId'

// ⌘Z in a live doc, with block ids (B9's finding). y-prosemirror writes a
// whole update to Yjs with the history flag of the LAST transaction in it, and
// the ids are appended last: marked "addToHistory: false", they took the
// change that caused them out of undo too. Enter, a paste, Turn into, a block
// dropped into a list: none could be undone. Each is one step here: one ⌘Z
// takes all of it back, ids included, and one ⌘⇧Z puts all of it back.
// Real editors on Y.Docs, synced as the collaboration server would.

const REMOTE = 'remote'
const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
})

function tab(doc: Y.Doc = new Y.Doc(), extra: AnyExtension[] = []) {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ history: false }), Collaboration.configure({ document: doc, field: 'default' }), ...extra, BlockId],
  })
  editors.push(editor)
  return editor
}

const undoManager = (editor: Editor) => yUndoPluginKey.getState(editor.state)!.undoManager
/** The steps ⌘Z can take back. */
const steps = (editor: Editor) => undoManager(editor).undoStack.length
/** Half a second without typing: the next change is a step of its own (Yjs merges changes 500 ms apart). */
const pause = (editor: Editor) => undoManager(editor).stopCapturing()
/** The doc, ids and all. */
const json = (editor: Editor): JSONContent => editor.getJSON()
/** The top-level blocks' text, in order. */
function lines(editor: Editor): string[] {
  const out: string[] = []
  editor.state.doc.forEach((node) => out.push(node.textContent))
  return out
}
/** Whether every block, at any depth, has an id. */
function allHaveIds(editor: Editor): boolean {
  let all = true
  editor.state.doc.descendants((node) => {
    if (node.isBlock && !node.attrs[BLOCK_ID_ATTR]) all = false
  })
  return all
}

/** A top-level block by its text: where it is, and it. */
function topBlock(editor: Editor, text: string): { pos: number; node: PMNode } {
  let found: { pos: number; node: PMNode } | null = null
  editor.state.doc.forEach((node, pos) => {
    if (!found && node.textContent === text) found = { pos, node }
  })
  if (!found) throw new Error(`no block reading "${text}"`)
  return found
}

/** Change, ⌘Z, ⌘⇧Z: each one step, and each leaves the doc exactly as it was, ids included. */
function oneStepEach(editor: Editor, change: () => void) {
  pause(editor)
  const before = json(editor)
  const stepsBefore = steps(editor)
  change()
  const after = json(editor)
  expect(after).not.toEqual(before)
  expect(steps(editor)).toBe(stepsBefore + 1)
  expect(editor.commands.undo()).toBe(true)
  expect(json(editor)).toEqual(before)
  expect(editor.commands.redo()).toBe(true)
  expect(json(editor)).toEqual(after)
  return { before, after }
}

/** A legacy block: written by something that gave it no id (a server write before block ids). */
function legacyParagraph(doc: Y.Doc, text: string) {
  const p = new Y.XmlElement('paragraph')
  p.insert(0, [new Y.XmlText(text)])
  doc.getXmlFragment('default').insert(doc.getXmlFragment('default').length, [p])
}

describe('one ⌘Z for a change that adds blocks', () => {
  it('takes back Enter, and ⌘⇧Z puts the new line back with its id', () => {
    const e = tab()
    e.commands.insertContent('<p>Ship on Thursday</p>')
    const { before } = oneStepEach(e, () => e.commands.enter())
    expect(before.content).toHaveLength(1)
    expect(lines(e)).toEqual(['Ship on Thursday', ''])
    expect(allHaveIds(e)).toBe(true)
  })

  it('takes back Enter at a block’s start, where the text keeps its id and the line above gets one', () => {
    const e = tab()
    e.commands.insertContent('<p>Ship on Thursday</p>')
    const id = topBlock(e, 'Ship on Thursday').node.attrs[BLOCK_ID_ATTR]
    e.commands.setTextSelection(1)
    oneStepEach(e, () => e.commands.enter())
    expect(lines(e)).toEqual(['', 'Ship on Thursday'])
    expect(topBlock(e, 'Ship on Thursday').node.attrs[BLOCK_ID_ATTR]).toBe(id)
  })

  it('takes back a paste of two blocks, both at once', () => {
    const e = tab()
    e.commands.insertContent('<p>Agenda</p>')
    // A paste is new blocks (BlockId's transformPasted), even when copied from this doc.
    oneStepEach(e, () => e.view.pasteHTML('<p data-block-id="copied">Budget</p><p>Hiring</p>', new Event('paste') as ClipboardEvent))
    expect(lines(e)).toEqual(['AgendaBudget', 'Hiring'])
    expect(JSON.stringify(json(e))).not.toContain('"copied"')
  })

  it('takes back blocks put in by a command (the "/" menu, an AI insert), all at once', () => {
    const e = tab()
    e.commands.insertContent('<p>Agenda</p>')
    oneStepEach(e, () => e.commands.insertContentAt(e.state.doc.content.size, '<p>Budget</p><p>Hiring</p>'))
    expect(lines(e)).toEqual(['Agenda', 'Budget', 'Hiring'])
  })

  // Turn into's entries run these (blocks/text.ts turnInto). A list or a quote
  // wraps the line in new blocks, which get ids; clearNodes resets the line's
  // attributes, so the heading gets an id too.
  it.each([
    ['a bulleted list', (e: Editor) => e.chain().toggleBulletList().run()],
    ['a numbered list', (e: Editor) => e.chain().toggleOrderedList().run()],
    ['a quote', (e: Editor) => e.chain().toggleBlockquote().run()],
    ['a heading', (e: Editor) => e.chain().clearNodes().setHeading({ level: 2 }).run()],
  ])('takes back Turn into %s', (_kind, turn) => {
    const e = tab()
    e.commands.insertContent('<p>Launch plan</p>')
    const { after } = oneStepEach(e, () => turn(e))
    expect(after.content).toHaveLength(1)
    expect(lines(e)).toEqual(['Launch plan'])
    expect(allHaveIds(e)).toBe(true)
  })

  it('takes back a block moved up (⌘⇧↑), which keeps its id', () => {
    const e = tab()
    e.commands.setContent('<p data-block-id="a">alpha</p><p data-block-id="b">beta</p>')
    // As the block menu moves a block (B1's moveBlocks): out of its place, in
    // above the block before it.
    oneStepEach(e, () => {
      const beta = topBlock(e, 'beta')
      const alpha = topBlock(e, 'alpha')
      e.view.dispatch(e.state.tr.delete(beta.pos, beta.pos + beta.node.nodeSize).insert(alpha.pos, beta.node))
    })
    expect(lines(e)).toEqual(['beta', 'alpha'])
  })

  it('takes back a block dropped between two items of a list, which parts the list', () => {
    const e = tab()
    e.commands.setContent(
      '<ul data-block-id="list"><li data-block-id="i1"><p data-block-id="p1">one</p></li><li data-block-id="i2"><p data-block-id="p2">two</p></li></ul><p data-block-id="m">moved</p>',
    )
    // As B1's drag drops a block among a list's items (dropTransaction): out
    // of its place, and the list parted around it, its second part a new list
    // with no id yet.
    oneStepEach(e, () => {
      const moved = topBlock(e, 'moved')
      const tr = e.state.tr.delete(moved.pos, moved.pos + moved.node.nodeSize)
      const list = tr.doc.firstChild!
      const parts = [
        list.type.create(list.attrs, list.child(0)),
        moved.node,
        list.type.create({ ...list.attrs, [BLOCK_ID_ATTR]: null }, list.child(1)),
      ]
      e.view.dispatch(tr.replaceWith(0, list.nodeSize, parts))
    })
    expect(lines(e)).toEqual(['one', 'moved', 'two'])
    const ids = e.state.doc.content.content.map((n) => n.attrs[BLOCK_ID_ATTR])
    expect(ids.slice(0, 2)).toEqual(['list', 'm'])
    expect(ids[2]).toBeTruthy()
    expect(ids[2]).not.toBe('list')
  })

  it('takes back an accepted edit proposal that adds a block (A9: one transaction, one ⌘Z)', () => {
    const e = tab(new Y.Doc(), [Proposals])
    e.commands.setContent('<h2 data-block-id="h">Launch</h2><p data-block-id="p">We ship on Thursday.</p>')
    const p = topBlock(e, 'We ship on Thursday.')
    const tracked = proposeReplacement(e.state, p.pos, p.pos + p.node.nodeSize, [
      { type: 'paragraph', content: [{ type: 'text', text: 'We ship on Friday.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Sales hear first.' }] },
    ])!
    showProposal(e, tracked)
    oneStepEach(e, () => expect(acceptProposal(e, tracked.proposal.id).applied.length).toBeGreaterThan(0))
    expect(lines(e)).toEqual(['Launch', 'We ship on Friday.', 'Sales hear first.'])
  })

  it('takes back the first edit of a block that had no id, and the id it got with it', () => {
    const doc = new Y.Doc()
    legacyParagraph(doc, 'written before block ids')
    const e = tab(doc)
    const loaded = json(e)
    expect(loaded.content![0].attrs?.[BLOCK_ID_ATTR] ?? null).toBeNull()
    // ⌘Z leaves the doc as it loaded: the "!" and the id it came with both go.
    const { before } = oneStepEach(e, () => e.chain().setTextSelection(e.state.doc.content.size - 1).insertContent('!').run())
    expect(before).toEqual(loaded)
    expect(lines(e)).toEqual(['written before block ids!'])
    expect(allHaveIds(e)).toBe(true)
  })

  it('keeps a change made out of history out of it, its ids too', () => {
    // As an upload swapping in its address does (image/uploads.ts).
    const e = tab()
    e.commands.insertContent('<p>Agenda</p>')
    pause(e)
    const stepsBefore = steps(e)
    const { schema } = e.state
    e.view.dispatch(e.state.tr.insert(e.state.doc.content.size, schema.nodes.paragraph.create(null, schema.text('kept out'))).setMeta('addToHistory', false))
    expect(topBlock(e, 'kept out').node.attrs[BLOCK_ID_ATTR]).toBeTruthy()
    expect(steps(e)).toBe(stepsBefore)
  })

  it('keeps a change one step when a later plugin answers it out of history and that answer gets an id', () => {
    // A plugin after BlockId's (lower priority) that keeps an empty line at
    // the doc's end, out of history, as a trailing-line plugin does. BlockId
    // then sees only that answer, not the change it answers: the ids it gives
    // the new line still belong to the change, and to its step.
    const key = new PluginKey('trailingLine')
    const TrailingLine = Extension.create({
      name: 'trailingLine',
      priority: 50,
      addProseMirrorPlugins: () => [
        new Plugin({
          key,
          appendTransaction(transactions, _old, state) {
            if (!transactions.some((tr) => tr.docChanged) || transactions.some(isRemote)) return null
            const last = state.doc.lastChild
            if (last?.type.name === 'paragraph' && last.content.size === 0) return null
            return state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create()).setMeta('addToHistory', false)
          },
        }),
      ],
    })
    const e = tab(new Y.Doc(), [TrailingLine])
    e.commands.insertContent('<p>Agenda</p>')
    expect(lines(e)).toEqual(['Agenda', ''])
    oneStepEach(e, () => e.commands.insertContentAt(e.state.doc.content.size - 1, 'Next'))
    expect(lines(e)).toEqual(['Agenda', 'Next', ''])
    expect(allHaveIds(e)).toBe(true)
  })
})

/** Two tabs on one doc, synced both ways. `written(e)` counts the updates a tab wrote itself. */
function pair() {
  const a = new Y.Doc()
  const b = new Y.Doc()
  const written = new Map<Y.Doc, number>([[a, 0], [b, 0]])
  const relay = (from: Y.Doc, to: Y.Doc) =>
    from.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE) return
      written.set(from, (written.get(from) ?? 0) + 1)
      Y.applyUpdate(to, update, REMOTE)
    })
  relay(a, b)
  relay(b, a)
  const ea = tab(a)
  const eb = tab(b)
  return { a: ea, b: eb, written: (e: Editor) => written.get(e === ea ? a : b) ?? 0 }
}

describe('undo between two tabs', () => {
  it('never puts another tab’s blocks in this tab’s undo', () => {
    const t = pair()
    t.b.commands.insertContent('<p>From Priya</p><p>Also from Priya</p>')
    expect(lines(t.a)).toEqual(['From Priya', 'Also from Priya'])
    expect(steps(t.a)).toBe(0)
    expect(t.a.can().undo()).toBe(false)
    const shown = json(t.a)
    t.a.commands.undo()
    expect(json(t.a)).toEqual(shown)
    expect(t.written(t.a)).toBe(0)
  })

  it('takes back this tab’s own Enter, and never the blocks another tab added since', () => {
    const t = pair()
    t.a.commands.insertContent('<p>Sam writes</p>')
    pause(t.a)
    t.a.commands.enter()
    const stepsA = steps(t.a)
    t.b.commands.insertContentAt(t.b.state.doc.content.size, '<p>Priya adds</p>')
    expect(lines(t.a)).toEqual(['Sam writes', '', 'Priya adds'])
    // Priya's insert is not Sam's to undo.
    expect(steps(t.a)).toBe(stepsA)
    expect(t.a.commands.undo()).toBe(true)
    expect(lines(t.a)).toEqual(['Sam writes', 'Priya adds'])
    expect(lines(t.b)).toEqual(lines(t.a))
    expect(json(t.b)).toEqual(json(t.a))
    expect(t.a.commands.redo()).toBe(true)
    expect(lines(t.b)).toEqual(['Sam writes', '', 'Priya adds'])
  })

  it('opens a doc whose blocks get their ids from the server with nothing to undo, and ⌘Z then takes back only an edit', () => {
    // The collaboration service gives an older doc its ids when it loads it
    // (transforms/blockIds.js): the tab receives them, never writes them.
    const server = new Y.Doc()
    legacyParagraph(server, 'Launch')
    legacyParagraph(server, 'Ship on Thursday')
    const mine = new Y.Doc()
    let wrote = 0
    mine.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE) return
      wrote++
      Y.applyUpdate(server, update, REMOTE)
    })
    server.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== REMOTE) Y.applyUpdate(mine, update, REMOTE)
    })
    Y.applyUpdate(mine, Y.encodeStateAsUpdate(server), REMOTE)
    const e = tab(mine)
    expect(lines(e)).toEqual(['Launch', 'Ship on Thursday'])
    server.transact(() => {
      server.getXmlFragment('default').toArray().forEach((el, i) => (el as Y.XmlElement).setAttribute(BLOCK_ID_ATTR, `server-${i}`))
    })
    const loaded = json(e)
    expect(loaded.content!.map((b) => b.attrs?.[BLOCK_ID_ATTR])).toEqual(['server-0', 'server-1'])
    expect(steps(e)).toBe(0)
    expect(e.can().undo()).toBe(false)
    expect(wrote).toBe(0)
    // An edit after it is a step of its own, and ⌘Z takes back only the edit.
    e.chain().setTextSelection(topBlock(e, 'Launch').node.nodeSize - 1).insertContent('!').run()
    expect(steps(e)).toBe(1)
    e.commands.undo()
    expect(json(e)).toEqual(loaded)
  })
})

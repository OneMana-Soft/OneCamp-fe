import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { Editor, type JSONContent } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import type { Node as PMNode } from '@tiptap/pm/model'
import { yUndoPluginKey } from 'y-prosemirror'
import '@/components/docEditor/registry'
import { extensionsFor, loadBlocks } from '@/components/docEditor/registry/factory'
import { ALL_EDITIONS, bareContext } from '@/components/docEditor/registry/manifest'
import { turnIntoFor } from '@/components/docEditor/registry/readers'
import { resolveAnchor } from '@/lib/anchors/anchors'
import { BLOCK_ID_ATTR } from './blockId'

// Turn into keeps the block (A1's identity): threads, links and proposals
// find a block by its id. Text and the headings went through clearNodes then
// setNode, and some lists through Tiptap's toggleList, each of which rebuilds
// the line without its attributes, so it came back with a new id. A block
// rebuilt in its place now keeps its id, for every entry in the menu, in one
// undo step. The doc's editor as the registry builds it, on a live Y.Doc.

beforeAll(() => loadBlocks('doc', ALL_EDITIONS), 60_000)

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
})

const TEXT = 'Launch plan'

/** The line "Launch plan" as each kind of block, its id "L"; a container round it has "C", an item "I". */
const STARTS: Record<string, string> = {
  text: `<p data-block-id="L">${TEXT}</p>`,
  'a heading': `<h2 data-block-id="L">${TEXT}</h2>`,
  'a bulleted item': `<ul data-block-id="C"><li data-block-id="I"><p data-block-id="L">${TEXT}</p></li></ul>`,
  'a numbered item': `<ol data-block-id="C"><li data-block-id="I"><p data-block-id="L">${TEXT}</p></li></ol>`,
  'a to-do': `<ul data-type="taskList" data-block-id="C"><li data-type="taskItem" data-checked="false" data-block-id="I"><p data-block-id="L">${TEXT}</p></li></ul>`,
  'a quote': `<blockquote data-block-id="C"><p data-block-id="L">${TEXT}</p></blockquote>`,
  code: `<pre data-block-id="L"><code>${TEXT}</code></pre>`,
}

/** A doc's editor on a live Y.Doc, holding this content, the caret in the line. */
function docWith(html: string): Editor {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: [...extensionsFor(bareContext('doc')), Collaboration.configure({ document: new Y.Doc(), field: 'default' })],
  })
  editors.push(editor)
  editor.commands.setContent(html)
  editor.commands.setTextSelection(line(editor).pos + 3)
  undoManager(editor).stopCapturing()
  return editor
}

/** The text block that reads "Launch plan". */
function line(editor: Editor): { pos: number; node: PMNode } {
  let found: { pos: number; node: PMNode } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (!found && node.isTextblock && node.textContent === TEXT) found = { pos, node }
    return !found
  })
  if (!found) throw new Error('no line reads "Launch plan"')
  return found
}
const idOf = (node: PMNode) => node.attrs[BLOCK_ID_ATTR] as string | null
const undoManager = (editor: Editor) => yUndoPluginKey.getState(editor.state)!.undoManager
const json = (editor: Editor): JSONContent => editor.getJSON()
const entry = (id: string) => {
  const found = turnIntoFor(ALL_EDITIONS).find((t) => t.id === id)
  if (!found) throw new Error(`no Turn into entry "${id}"`)
  return found
}

const CASES = Object.keys(STARTS).flatMap((start) => turnIntoFor(ALL_EDITIONS).map((t) => [start, t.id] as const))

describe('Turn into keeps the block', () => {
  it('has the entries this test walks', () => {
    // With B2's and B3's entries (a fourth heading, toggles, a callout, an equation).
    expect(turnIntoFor(ALL_EDITIONS).map((t) => t.id)).toEqual([
      'text', 'h1', 'h2', 'h3', 'h4', 'bullet', 'ordered', 'todo', 'toggle', 'quote', 'code', 'blockMath', 'callout', 'toggleH1', 'toggleH2', 'toggleH3',
    ])
  })

  it.each(CASES)('keeps the line’s id from %s to %s', (start, target) => {
    const e = docWith(STARTS[start])
    entry(target).run(e)
    expect(idOf(line(e).node)).toBe('L')
  })

  it.each([
    ['a bulleted item', 'ordered', 'orderedList'],
    ['a numbered item', 'bullet', 'bulletList'],
  ])('keeps the list’s and the item’s ids when %s becomes %s (the list changes kind in place)', (start, target, made) => {
    const e = docWith(STARTS[start])
    entry(target).run(e)
    const list = e.state.doc.firstChild!
    expect(list.type.name).toBe(made)
    expect(idOf(list)).toBe('C')
    expect(idOf(list.firstChild!)).toBe('I')
  })

  it('keeps a thread on the block (a block anchor) attached through Turn into a heading, and its ⌘Z', () => {
    const e = docWith(STARTS.text)
    const anchor = { kind: 'block' as const, block_id: 'L', quote: TEXT }
    const attached = (editor: Editor) => resolveAnchor(null, editor.state.doc, anchor)
    expect(attached(e)).toMatchObject({ state: 'attached' })
    entry('h2').run(e)
    expect(line(e).node.type.name).toBe('heading')
    const r = attached(e)
    expect(r).toEqual({ state: 'attached', from: line(e).pos + 1, to: line(e).pos + 1 + TEXT.length })
    e.commands.undo()
    expect(line(e).node.type.name).toBe('paragraph')
    expect(attached(e)).toMatchObject({ state: 'attached' })
  })

  it.each([
    ['text', 'h2', 'paragraph', 'heading'],
    ['a heading', 'text', 'heading', 'paragraph'],
    ['a bulleted item', 'todo', 'paragraph', 'paragraph'],
    ['a to-do', 'bullet', 'paragraph', 'paragraph'],
    ['a bulleted item', 'ordered', 'paragraph', 'paragraph'],
    ['code', 'text', 'codeBlock', 'paragraph'],
    ['a quote', 'h1', 'paragraph', 'heading'],
  ])('takes back Turn into from %s to %s in one ⌘Z, the line as it was with its id; ⌘⇧Z turns it again', (start, target, was, becomes) => {
    const e = docWith(STARTS[start])
    const before = json(e)
    const steps = undoManager(e).undoStack.length
    entry(target).run(e)
    const after = json(e)
    expect(line(e).node.type.name).toBe(becomes)
    expect(idOf(line(e).node)).toBe('L')
    expect(undoManager(e).undoStack.length).toBe(steps + 1)
    expect(e.commands.undo()).toBe(true)
    expect(json(e)).toEqual(before)
    expect(line(e).node.type.name).toBe(was)
    expect(idOf(line(e).node)).toBe('L')
    expect(e.commands.redo()).toBe(true)
    expect(json(e)).toEqual(after)
  })

  it('keeps the id through a Markdown shortcut that rebuilds the line ("## ")', () => {
    const e = docWith(STARTS.text)
    e.commands.setTextSelection(1)
    e.commands.insertContent('##')
    // The space as the browser types it: input rules run on text input.
    const at = e.state.selection.from
    expect(e.view.someProp('handleTextInput', (f) => f(e.view, at, at, ' ', () => e.state.tr.insertText(' ', at)))).toBe(true)
    expect(line(e).node.type.name).toBe('heading')
    expect(idOf(line(e).node)).toBe('L')
  })

  it('gives a block pasted over another an id of its own: a new block, not a rebuilt one', () => {
    const e = docWith(STARTS.text)
    e.commands.setNodeSelection(line(e).pos)
    e.view.pasteHTML('<p>Something else</p>', new Event('paste') as ClipboardEvent)
    const pasted = e.state.doc.firstChild!
    expect(pasted.textContent).toBe('Something else')
    expect(idOf(pasted)).toBeTruthy()
    expect(idOf(pasted)).not.toBe('L')
  })
})

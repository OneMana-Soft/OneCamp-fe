import { afterEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'

import '@/components/docEditor/registry'
import { attachBus, bindEditorCommands, busFor, busForDoc, createDocCommandBus, findBlock, touchBus } from './commandBus'
import { slashItemsFor } from './readers'
import { BlockId } from '@/components/minimal-tiptap/extensions/block-id'

// The doc command bus (I17): one per editor, for that editor's doc alone. The
// window events it replaces carried no doc id, so in split view both docs
// took an AI insert (N5).

const editors: Editor[] = []
const offs: Array<() => void> = []
afterEach(() => {
  while (offs.length) offs.pop()?.()
  while (editors.length) editors.pop()?.destroy()
})

/** An editor of a doc, with its bus on it and its own commands bound. */
function docEditor(docId: string, html = '<p>start</p>') {
  const editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit, BlockId], content: html })
  editors.push(editor)
  const bus = createDocCommandBus(docId)
  offs.push(attachBus(editor, bus), bindEditorCommands(editor, bus))
  return { editor, bus }
}

describe('the doc command bus', () => {
  it('gives each editor its own bus, keyed apart even for one doc', () => {
    const left = docEditor('doc-1')
    const right = docEditor('doc-1')
    expect(busFor(left.editor)).toBe(left.bus)
    expect(busFor(right.editor)).toBe(right.bus)
    expect(left.bus.key).not.toBe(right.bus.key)
    expect(left.bus.docId).toBe(right.bus.docId)
  })

  it('lands an insert once in split view: in the editor of that doc used last', () => {
    const left = docEditor('doc-1')
    const right = docEditor('doc-1')
    touchBus(left.bus)
    busForDoc('doc-1')!.emit('insertAt', { at: 'end', content: '<p>from the AI panel</p>' })
    const count = (e: Editor) => e.getHTML().split('from the AI panel').length - 1
    expect(count(left.editor) + count(right.editor)).toBe(1)
    expect(count(left.editor)).toBe(1)
    touchBus(right.bus)
    busForDoc('doc-1')!.emit('insertAt', { at: 'end', content: '<p>again</p>' })
    expect(right.editor.getHTML()).toContain('again')
    expect(left.editor.getHTML()).not.toContain('again')
  })

  it("never lands one doc's command in another doc", () => {
    const one = docEditor('doc-1')
    const two = docEditor('doc-2')
    touchBus(two.bus)
    busForDoc('doc-1')!.emit('insertAt', { at: 'end', content: '<p>for doc one</p>' })
    expect(one.editor.getHTML()).toContain('for doc one')
    expect(two.editor.getHTML()).not.toContain('for doc one')
    expect(busForDoc('doc-3')).toBeUndefined()
  })

  it('replaces a block found by its id', () => {
    const { editor, bus } = docEditor('doc-1', '<p data-block-id="b-1">old text</p><p data-block-id="b-2">stays</p>')
    expect(findBlock(editor, 'b-1')).toEqual({ from: 0, to: 10 })
    bus.emit('replaceRange', { anchor: { kind: 'block', block_id: 'b-1' }, content: '<p>new text</p>' })
    expect(editor.getText()).toContain('new text')
    expect(editor.getText()).not.toContain('old text')
    expect(editor.getText()).toContain('stays')
  })

  it('keeps a failing listener inside it, and stops listening when asked', () => {
    const bus = createDocCommandBus('doc-1')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const seen: string[] = []
    bus.on('openPanel', () => {
      throw new Error('broken listener')
    })
    const off = bus.on('openPanel', ({ kind }) => seen.push(kind))
    bus.emit('openPanel', { kind: 'comments' })
    off()
    bus.emit('openPanel', { kind: 'history' })
    expect(seen).toEqual(['comments'])
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('never offers "/" Write with AI in the AI-free edition', () => {
    // Where it opens, in the AI edition, is components/ai/docAiRegister.test.ts.
    expect(slashItemsFor('doc', { ai: false }).find((i) => i.id === 'ai-write')).toBeUndefined()
  })
})

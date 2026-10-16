import { afterEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { ClipboardMarkdown, loadClipboardWriter } from './clipboardMarkdown'

// The clipboard's Markdown writer is the codec (46 KB): it is fetched on idle
// or at the first selection, never with the doc (docFirstLoad.test.ts), and a
// copy made before it is there is answered at once, as plain text.

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
  vi.useRealTimers()
})

function editorWith(html: string) {
  const editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit.configure({ history: false }), ClipboardMarkdown], content: html })
  editors.push(editor)
  return editor
}

const copied = (editor: Editor) => {
  const slice = editor.state.selection.content()
  return editor.view.someProp('clipboardTextSerializer', (f) => f(slice, editor.view)) || slice.content.textBetween(0, slice.content.size, '\n\n')
}

describe('copying before the writer is there', () => {
  it('waits to be online to fetch it', () => {
    const offline = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const editor = editorWith('<p>Offline</p>')
    editor.commands.selectAll()
    // Nothing fetched: a failed chunk would be taken for a deploy (lib/chunkRecovery.ts).
    expect(copied(editor)).toBe('Offline')
    offline.mockRestore()
  })

  it('is answered at once with the plain text, and the selection fetches the writer', async () => {
    const editor = editorWith('<h1>Plan</h1><p>Ship <strong>soon</strong></p>')
    editor.commands.selectAll()
    // Plain text, as Tiptap writes it: no heading marker, no bold.
    expect(copied(editor)).toBe('Plan\n\nShip soon')
    // The selection asked for the writer; once it is there, Markdown.
    await loadClipboardWriter()
    expect(copied(editor)).toBe('# Plan\n\nShip **soon**')
  })
})

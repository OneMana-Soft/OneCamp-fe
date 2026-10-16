import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { Link } from '@tiptap/extension-link'
import { TextSelection } from '@tiptap/pm/state'
import { ClipboardMarkdown, loadClipboardWriter } from './clipboardMarkdown'

// Copying out of a doc (L17): the clipboard's plain text, as a paste into
// chat, GitHub or an email gets it.

// The writer loads on idle or at the first selection (clipboardMarkdownLazy.test.ts);
// here it is there already, as it is by the time anyone copies.
beforeAll(() => loadClipboardWriter())

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
})

function editorWith(content: JSONContent) {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ history: false }), TaskList, TaskItem.configure({ nested: true }), Link, ClipboardMarkdown],
    content,
  })
  editors.push(editor)
  return editor
}

function copied(editor: Editor): string {
  const slice = editor.state.selection.content()
  return editor.view.someProp('clipboardTextSerializer', (f) => f(slice, editor.view)) ?? ''
}

const text = (t: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text: t, ...(marks ? { marks } : {}) })
const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content })
const item = (type: string, t: string, attrs?: Record<string, unknown>): JSONContent => ({ type, ...(attrs ? { attrs } : {}), content: [p(text(t))] })

const doc: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [text('Plan')] },
    p(text('Ship '), text('soon', [{ type: 'bold' }]), text(', see '), text('the site', [{ type: 'link', attrs: { href: 'https://example.com' } }]), text('.')),
    { type: 'bulletList', content: [item('listItem', 'one'), item('listItem', 'two')] },
    { type: 'orderedList', attrs: { start: 1 }, content: [item('listItem', 'first'), item('listItem', 'second'), item('listItem', 'third')] },
    { type: 'taskList', content: [item('taskItem', 'done', { checked: true }), item('taskItem', 'open', { checked: false })] },
    { type: 'codeBlock', attrs: { language: 'go' }, content: [text('x := 1\ny := 2')] },
  ],
}

describe('copying out of a doc', () => {
  it('gives clean Markdown: headings, marks, links, list markers and task boxes, one blank line between blocks', () => {
    const editor = editorWith(doc)
    editor.commands.selectAll()
    expect(copied(editor)).toBe(
      [
        '# Plan',
        '',
        'Ship **soon**, see [the site](https://example.com).',
        '',
        '- one',
        '- two',
        '',
        '1. first',
        '2. second',
        '3. third',
        '',
        '- [x] done',
        '- [ ] open',
        '',
        '```go',
        'x := 1',
        'y := 2',
        '```',
      ].join('\n'),
    )
  })

  it('copies text inside a code block as the code itself', () => {
    const editor = editorWith(doc)
    let start = 0
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'codeBlock') start = pos + 1
    })
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, start, start + 13)))
    expect(copied(editor)).toBe('x := 1\ny := 2')
  })

  it('keeps items taken from the middle of a numbered list numbered', () => {
    const editor = editorWith(doc)
    const at: number[] = []
    editor.state.doc.descendants((n, pos) => {
      if (n.isText && (n.text === 'first' || n.text === 'second')) at.push(pos)
    })
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at[0] + 2, at[1] + 3)))
    expect(copied(editor)).toBe('1. rst\n2. sec')
  })

  it('copies a phrase from inside a heading as the phrase alone, without its marker', () => {
    const editor = editorWith(doc)
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 4)))
    expect(copied(editor)).toBe('Pla')
  })

  it('copies a few words as just those words', () => {
    const editor = editorWith(doc)
    let from = 0
    editor.state.doc.descendants((n, pos) => {
      if (n.isText && n.text === 'Ship ') from = pos
    })
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, from + 9)))
    expect(copied(editor)).toBe('Ship **soon**')
  })
})
describe('the codec it writes with', () => {
  it('is the writer alone, and never loads with the editor: copying loads no Markdown reader', () => {
    // The extension names the codec's types only; the writer is fetched later.
    const ext = readFileSync(join(__dirname, 'clipboardMarkdown.ts'), 'utf8')
    const runtime = (ext.match(/^import (?!type )[^\n]*$/gm) || []).join('\n')
    expect(runtime).not.toContain('@/lib/codec')
    expect(runtime).not.toContain('clipboardMarkdownWriter')
    const src = readFileSync(join(__dirname, 'clipboardMarkdownWriter.ts'), 'utf8')
    const imports = (src.match(/^import [^\n]*$/gm) || []).join('\n')
    expect(imports).not.toContain('markdownParse')
    expect(imports).not.toContain("'@/lib/codec'")
    expect(imports).not.toContain('"@/lib/codec"')
    const writer = readFileSync(join(__dirname, '../../../../lib/codec/markdown.ts'), 'utf8')
    expect((writer.match(/^import [^\n]*$/gm) || []).join('\n')).not.toContain('markdownParse')
  })
})

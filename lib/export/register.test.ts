import { readFileSync } from 'node:fs'
import { OWN_ERRORS } from '@/lib/axiosInstance'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import type { ActionContext, DocCommandBus } from '@/components/docEditor/registry/types'

const post = vi.fn()
const get = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a), get: (...a: unknown[]) => get(...a) } }))
const toast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({ toast: (...a: unknown[]) => toast(...a) }))
const downloadFile = vi.fn()
vi.mock('./download', async (original) => ({ ...(await original<typeof import('./download')>()), downloadFile: (...a: unknown[]) => downloadFile(...a) }))
// The import dialog, as a button that closes it.
vi.mock('@/components/doc/ImportDocDialog', async () => {
  const { createElement } = await import('react')
  return {
    default: ({ docId, onClose }: { docId: string; onClose(): void }) => createElement('button', { 'data-import-dialog': docId, onClick: onClose }, 'Import files'),
  }
})

import './register'
import { actionsFor } from '@/components/docEditor/registry/registry'
import { forgetCapabilities, knownCapabilities, type ContentIOCapabilities } from './contentIO'

const CAPS: ContentIOCapabilities = { export: true, export_formats: ['md', 'html', 'json'], import_extensions: ['.md'], max_import_bytes: 100 << 20, max_direct_bytes: 7 << 20 }
const EXPORT_IDS = ['doc.export.markdown', 'doc.export.html', 'doc.export.pdf', 'doc.export.word']

const editors: Editor[] = []
function docEditor(title: string, html: string) {
  // As the doc page has it: the title field and the editor in one scroll box.
  const scroll = document.createElement('div')
  scroll.className = 'doc-scroll'
  const field = document.createElement('textarea')
  field.setAttribute('data-doc-title', '')
  field.value = title
  const element = document.createElement('div')
  scroll.append(field, element)
  document.body.append(scroll)
  const editor = new Editor({ element, extensions: [StarterKit.configure({ history: false })], content: html })
  editors.push(editor)
  return editor
}

const bus = { docId: 'doc-1', emit: () => {}, on: () => () => {} } as unknown as DocCommandBus
const ctxFor = (editor: Editor | null, canEdit = true): ActionContext => ({ docId: 'doc-1', editor, canEdit, bus })
const shown = (ctx: ActionContext) =>
  actionsFor('more', { ai: false })
    .filter((a) => a.isEnabled?.(ctx) ?? true)
    .map((a) => a.id)

beforeEach(() => {
  post.mockReset()
  get.mockReset()
  toast.mockReset()
  downloadFile.mockReset()
  forgetCapabilities(CAPS)
})
afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
  document.body.innerHTML = ''
})

describe('export and import in More', () => {
  it('are in More and the command palette, in sentence case', () => {
    const more = actionsFor('more', { ai: false })
    const palette = actionsFor('palette', { ai: false }).map((a) => a.id)
    for (const id of [...EXPORT_IDS, 'doc.import']) {
      const action = more.find((a) => a.id === id)
      expect(action, id).toBeTruthy()
      expect(palette).toContain(id)
      expect(action!.label).toMatch(/^[A-Z][^A-Z]*(?: (?:Markdown|HTML|PDF|Word)[^A-Z]*)?$/)
    }
  })

  it('leave the export items out with the policy off, and keep import for editors', () => {
    const editor = docEditor('Plan', '<p>Hi</p>')
    expect(shown(ctxFor(editor))).toEqual(expect.arrayContaining([...EXPORT_IDS, 'doc.import']))
    forgetCapabilities({ ...CAPS, export: false })
    const items = shown(ctxFor(editor))
    for (const id of EXPORT_IDS) expect(items).not.toContain(id)
    expect(items).toContain('doc.import')
    expect(shown(ctxFor(editor, false))).not.toContain('doc.import')
  })

  it('exports what was typed a moment ago, and records the export first', async () => {
    post.mockResolvedValue({ status: 204 })
    const editor = docEditor('Plan', '<h2>Steps</h2><ul><li><p>one</p></li></ul><p>Draft</p>')
    // Typing at the end of the last paragraph.
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.commands.insertContent(', typed just now')
    const md = actionsFor('more', { ai: false }).find((a) => a.id === 'doc.export.markdown')!
    await md.run(ctxFor(editor))
    expect(post).toHaveBeenCalledWith('/doc/recordExport', { doc_uuid: 'doc-1', format: 'md' }, OWN_ERRORS)
    expect(downloadFile).toHaveBeenCalledTimes(1)
    const [name, text] = downloadFile.mock.calls[0]
    expect(name).toBe('Plan.md')
    expect(text).toBe('# Plan\n\n## Steps\n\n- one\n\nDraft, typed just now\n')
  })

  it('makes no file when the API refuses the export, and leaves the items out from then on', async () => {
    post.mockRejectedValue({ response: { status: 403 } })
    const editor = docEditor('Plan', '<p>Hi</p>')
    const html = actionsFor('more', { ai: false }).find((a) => a.id === 'doc.export.html')!
    await html.run(ctxFor(editor))
    expect(downloadFile).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }))
    expect(knownCapabilities()?.export).toBe(false)
    for (const id of EXPORT_IDS) expect(shown(ctxFor(editor))).not.toContain(id)
  })
})

describe('Import files…', () => {
  it('opens the import dialog for the doc, with no window event, and closing it takes it off the page', async () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent')
    const action = actionsFor('more', { ai: false }).find((a) => a.id === 'doc.import')!
    await action.run(ctxFor(null))
    const dialog = await vi.waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>('[data-import-dialog="doc-1"]')
      expect(el).toBeTruthy()
      return el!
    })
    expect(dispatch).not.toHaveBeenCalled()
    dispatch.mockRestore()
    dialog.click()
    await vi.waitFor(() => expect(document.querySelector('[data-import-dialog]')).toBeNull())
  })
})

describe('what the doc page carries', () => {
  it('is the menu items alone: the exporters and the codec load with the first export', () => {
    const src = readFileSync(join(__dirname, 'register.ts'), 'utf8')
    const statics = src.match(/^import [^\n]*$/gm) || []
    for (const heavy of ['@/lib/codec', './docToMarkdown', './docToHtml', './docToDocx', './exportDoc', "'docx'"]) {
      expect(statics.join('\n'), heavy).not.toContain(heavy)
    }
  })
})

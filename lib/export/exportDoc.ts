/**
 * Making an export from the live doc (A7): Markdown, HTML, PDF or Word. It
 * loads with the first export, so the doc page never carries the codec for
 * it; lib/export/register.ts puts the items in More.
 */

import type { Editor } from '@tiptap/core'
import { blocksFor } from '@/components/docEditor/registry/registry'
import type { ActionContext } from '@/components/docEditor/registry/types'
import { toast } from '@/hooks/use-toast'
import { ExportFormat, recordExport } from './contentIO'
import { docToHtml } from './docToHtml'
import { docToMarkdown } from './docToMarkdown'
import { downloadFile, exportFileName } from './download'
import { printDoc } from './print'

const codecRules = () => blocksFor('doc', { ai: true }).flatMap((b) => b.codec || [])

/** The doc's title as it reads now, from its title field beside the editor. */
export function docTitleOf(editor: Editor): string {
  const field = editor.view.dom.closest('.doc-scroll')?.querySelector<HTMLTextAreaElement>('[data-doc-title]')
  return (field?.value ?? field?.textContent ?? '').trim()
}

/** Exports the doc in the editor as a file the browser makes. */
export async function exportDoc(ctx: ActionContext, format: ExportFormat): Promise<void> {
  const editor = ctx.editor
  if (!editor) return
  // The doc as it is this moment, before anything is awaited.
  const body = editor.getJSON()
  const title = docTitleOf(editor)
  try {
    await recordExport(ctx.docId, format)
  } catch (err) {
    toast({ title: "Couldn't export", description: (err as Error).message, variant: 'destructive' })
    return
  }
  const name = exportFileName(title)
  try {
    switch (format) {
      case 'md':
        downloadFile(name + '.md', docToMarkdown(title, body, { rules: codecRules() }), 'text/markdown;charset=utf-8')
        return
      case 'html':
        downloadFile(name + '.html', docToHtml(title, body, codecRules()), 'text/html;charset=utf-8')
        return
      case 'pdf':
        await printDoc(title)
        return
      case 'docx': {
        // The Word writer loads with its first use.
        const { docToDocx } = await import('./docToDocx')
        downloadFile(name + '.docx', await docToDocx(title, body))
        return
      }
    }
  } catch {
    toast({ title: "Couldn't export", description: 'The file could not be made. Try again.', variant: 'destructive' })
  }
}

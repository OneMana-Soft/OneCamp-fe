/**
 * Export and import, in a doc's More menu and the command palette (A7). The
 * integrator adds this module's line to registry/index.ts.
 *
 * Every export is made from the live doc (the editor's content as the export
 * starts, typing of a moment ago included), and records a doc.export
 * event first. With the docs.export.members policy off a member's export
 * items are disabled (isEnabled is false), so the More menu leaves them out,
 * and the API refuses the record.
 */

import { FileCode2, FileText, FileType2, FileUp, Printer } from 'lucide-react'
import { dialogFor, registerAction, registerDialog } from '@/components/docEditor/registry/registry'
import type { ActionContext } from '@/components/docEditor/registry/types'
import { ExportFormat, knownCapabilities, loadCapabilities } from './contentIO'
import '@/components/minimal-tiptap/styles/partials/print.css'

// The exporters, and the codec they use, load with the first export.
const exporter = () => import('./exportDoc')

// Until the API has answered, the items show: an export a member may not
// make is refused when it is recorded, and from then on they are left out.
const mayExport = (ctx: ActionContext) => !!ctx.editor && knownCapabilities()?.export !== false

// Asked as the signed-in app loads, so the first More menu already knows.
if (typeof window !== 'undefined' && window.location.pathname.startsWith('/app')) void loadCapabilities()

const EXPORTS: { id: string; label: string; icon: typeof FileText; format: ExportFormat }[] = [
  { id: 'doc.export.markdown', label: 'Export as Markdown', icon: FileText, format: 'md' },
  { id: 'doc.export.html', label: 'Export as HTML', icon: FileCode2, format: 'html' },
  { id: 'doc.export.pdf', label: 'Export as PDF', icon: Printer, format: 'pdf' },
  { id: 'doc.export.word', label: 'Export as Word', icon: FileType2, format: 'docx' },
]

for (const e of EXPORTS) {
  registerAction({
    id: e.id,
    label: e.label,
    icon: e.icon,
    group: 'export',
    surfaces: ['more', 'palette', 'phoneSheet'],
    edition: 'both',
    isEnabled: mayExport,
    run: async (ctx) => (await exporter()).exportDoc(ctx, e.format),
  })
}

registerDialog({
  id: 'doc.import',
  edition: 'both',
  load: () => import('@/components/doc/ImportDocDialog'),
})

registerAction({
  id: 'doc.import',
  label: 'Import files…',
  icon: FileUp,
  group: 'import',
  surfaces: ['more', 'palette', 'phoneSheet'],
  edition: 'both',
  isEnabled: (ctx) => ctx.canEdit,
  run: (ctx) => openDocDialog('doc.import', ctx.docId),
})

/**
 * Opens a registered dialog for a doc. The doc shell has no dialogs slot yet:
 * A1 builds it, with a command on the doc's bus to open one. Until then the
 * dialog is put on the page here, in a root of its own (it needs nothing from
 * the app's providers), and when the slot lands this function's body becomes
 * that command. No window event carries it (I17).
 */
async function openDocDialog(id: string, docId: string): Promise<void> {
  if (typeof document === 'undefined') return
  const spec = dialogFor(id, { ai: true })
  if (!spec) return
  const [{ createRoot }, { createElement }, mod] = await Promise.all([import('react-dom/client'), import('react'), spec.load()])
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const close = () => {
    // After the dialog's closing frame.
    setTimeout(() => {
      root.unmount()
      host.remove()
    }, 200)
  }
  root.render(createElement(mod.default, { docId, onClose: close }))
}

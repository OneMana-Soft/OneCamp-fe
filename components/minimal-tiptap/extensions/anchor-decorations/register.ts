/**
 * The anchor decorations' registry entry (docs programme A8). The integrator
 * adds `import '@/components/minimal-tiptap/extensions/anchor-decorations/register'`
 * to components/docEditor/registry/index.ts when A8 merges. It writes nothing
 * to the doc, so it has no schema entries; it rides in the doc editor only.
 * The highlights' styles load with it.
 */
import { registerBlock } from '@/components/docEditor/registry/registry'
import { AnchorDecorations } from './anchorDecorations'
import '@/components/threads/threads.css'

registerBlock({
  id: 'anchor-decorations',
  editors: ['doc'],
  edition: 'both',
  schema: [],
  extensions: [AnchorDecorations],
})

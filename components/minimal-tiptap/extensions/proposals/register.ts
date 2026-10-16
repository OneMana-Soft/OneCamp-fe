"use client"

/**
 * The proposals extension's registry entry (docs programme A9): it draws
 * proposed changes for review in the doc editor and the chat composer. It
 * writes no node or mark (everything it shows is decoration), so its schema
 * is empty and the collaboration server's manifest does not change.
 *
 * The integrator adds `import '@/components/minimal-tiptap/extensions/proposals/register'`
 * to components/docEditor/registry/index.ts when A9 merges.
 */

import '@/components/proposals/proposals.css'
import { registerBlock, registerSlot } from '@/components/docEditor/registry/registry'
import { Proposals } from './proposals'

registerBlock({
  id: 'proposals',
  editors: ['doc', 'chat'],
  edition: 'both',
  extensions: [Proposals],
  schema: [],
})

// The review bar, over a doc's editor, once per editor.
registerSlot({
  slot: 'editorOverlay',
  id: 'proposals.review',
  edition: 'both',
  load: () => import('@/components/proposals/ReviewBarSlot'),
})

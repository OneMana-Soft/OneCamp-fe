/**
 * The clipboard extension's entry in the block registry: the doc editor and
 * the guest viewer copy out as Markdown. It writes no node or mark of its own,
 * and it loads with the doc's editor, never with the chat composer.
 *
 * The extension is small; the Markdown writer it copies with (A7's codec)
 * is fetched on idle or at the first selection (clipboardMarkdown.ts).
 */

import { registerBlock } from '@/components/docEditor/registry/registry'

registerBlock({
  id: 'clipboard-markdown',
  editors: ['doc', 'guest'],
  edition: 'both',
  order: 3700,
  schema: [],
  load: () => import('./clipboardMarkdown').then((m) => [m.ClipboardMarkdown]),
})

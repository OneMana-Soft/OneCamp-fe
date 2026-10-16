import { registerBlock } from '@/components/docEditor/registry/registry'
import { DocPlaceholder } from './placeholder'
import type { Node as PMNode } from '@tiptap/pm/model'

// The doc editor's placeholder as a registry contribution (docs programme A2).
// The integrator adds this module to components/docEditor/registry/index.ts,
// and the editor factory (A1) loads it for the doc editor in place of Tiptap's
// Placeholder. It writes nothing into the doc: no schema.

/** The doc editor's texts, as use-minimal-tiptap.ts gives them today (A0 may add more). */
export function docPlaceholderText({ node }: { node: PMNode }): string {
  if (node.type.name === 'heading') return `Heading ${node.attrs.level}`
  if (node.type.name === 'paragraph') return 'Type / for blocks, @ for people'
  if (node.type.name === 'blockquote') return 'Empty quote'
  return ''
}

registerBlock({
  id: 'placeholder',
  editors: ['doc', 'guest'],
  edition: 'both',
  extensions: [DocPlaceholder.configure({ placeholder: docPlaceholderText, showOnlyWhenEditable: true, showOnlyCurrent: true, includeChildren: false })],
  schema: [],
})

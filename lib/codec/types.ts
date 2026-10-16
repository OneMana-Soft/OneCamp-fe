/**
 * The Content Codec: Markdown ⇄ editor JSON ⇄ HTML (docs programme, PROGRAM.md
 * §4 #16; A7 builds it, here in TypeScript and in Go in the API, the two held to
 * the same golden fixtures). Paste, AI, export, import, the API and agents all go
 * through it, and each block's rules come from its spec in the block registry.
 *
 * lib/codec/index.ts builds it (createCodec); exports are lib/export/*.
 */

import type { JSONContent } from '@tiptap/core'

export type CodecFormat = 'markdown' | 'html' | 'json'

export interface Codec {
  toMarkdown(doc: JSONContent): string
  fromMarkdown(markdown: string): JSONContent
  toHTML(doc: JSONContent): string
  fromHTML(html: string): JSONContent
}

/** A block's own codec rule, from its BlockSpec. */
export interface CodecRule {
  /** The node or mark it writes. */
  name: string
  /** Its Markdown, given its children already written. Absent: the block's text alone. */
  toMarkdown?(node: JSONContent, children: string): string
}

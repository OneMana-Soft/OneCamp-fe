/**
 * A doc as Markdown, its title as the first heading (which an import reads
 * back as the title). The API writes the same file (business/ContentIO,
 * exporters.go docMarkdown); both are held to testdata/codec/export.
 */

import type { JSONContent } from '@tiptap/core'
import type { CodecRule } from '@/lib/codec/types'
import type { CNode } from '@/lib/codec/doc'
import { normalize } from '@/lib/codec/normalize'
import { toMarkdown } from '@/lib/codec/markdown'
import { readTable } from '@/lib/codec/markdownParse'
import { SHIPPED } from '@/lib/codec/schema'

const pageOrigin = () => (typeof window !== 'undefined' && window.location ? window.location.origin : '')

export function docToMarkdown(title: string, body: JSONContent, opts: { appURL?: string; rules?: CodecRule[] } = {}): string {
  const rules = opts.rules || []
  // As the API has it: the body in canonical form, the title as written.
  const canon = normalize(body as CNode, SHIPPED, new Set(rules.map((r) => r.name)))
  const content: CNode[] = []
  if (title.trim() !== '') content.push({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] })
  content.push(...(canon.content || []))
  return toMarkdown({ type: 'doc', content }, { appURL: opts.appURL ?? pageOrigin(), rules, readTable })
}

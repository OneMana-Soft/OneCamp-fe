/**
 * The Content Codec (docs programme A7): Markdown ⇄ the editor's JSON ⇄ HTML.
 * The API has the same codec in Go (business/ContentCodec); both are held to
 * the golden fixtures in testdata/codec, byte for byte, so a doc written as
 * Markdown in the browser and on the server is the same file.
 *
 * Paste, AI, export, import and agents go through it. A block with no rule
 * here gives its own in its spec (BlockSpec.codec), and the codec built from
 * the registry uses it.
 */

import type { JSONContent } from '@tiptap/core'
import type { Codec, CodecRule } from './types'
import { CNode } from './doc'
import { normalize } from './normalize'
import { toMarkdown, MarkdownOptions } from './markdown'
import { fromMarkdown, readTable } from './markdownParse'
import { fromHTML, toHTML } from './html'
import { SHIPPED } from './schema'

interface CodecOptions {
  /** The web app's origin, for links to channels, docs and tables; the page's own when absent. */
  appURL?: string
  /** Rules from block specs, for nodes the codec has none of its own for. */
  rules?: CodecRule[]
}

const pageOrigin = () => (typeof window !== 'undefined' && window.location ? window.location.origin : '')

/** A codec: the four directions, with the rules of the blocks it is given. */
export function createCodec(opts: CodecOptions = {}): Codec & {
  /** Markdown for copying out: no <u>, which chat and email show as text. */
  toClipboardMarkdown(doc: JSONContent): string
  /** A doc in canonical form: what two equal docs have in common. */
  normalize(doc: JSONContent): JSONContent
} {
  const rules = opts.rules || []
  const keep = new Set(rules.map((r) => r.name))
  // Copying out writes no kept table back as a table: the clipboard
  // extension loads no parser (MarkdownOptions.readTable).
  const md = (clipboard: boolean): MarkdownOptions => ({ appURL: opts.appURL ?? pageOrigin(), clipboard, rules, ...(clipboard ? {} : { readTable }) })
  const canon = (doc: JSONContent) => normalize(doc as CNode, SHIPPED, keep)
  return {
    toMarkdown: (doc) => toMarkdown(canon(doc), md(false)),
    toClipboardMarkdown: (doc) => toMarkdown(canon(doc), md(true)),
    fromMarkdown: (src) => fromMarkdown(src) as JSONContent,
    toHTML: (doc) => toHTML(canon(doc)),
    // HTML handed to the codec is from outside the editor (a paste, a file):
    // read as untrusted.
    fromHTML: (html) => fromHTML(html, { foreign: true }) as JSONContent,
    normalize: (doc) => canon(doc) as JSONContent,
  }
}

/** The codec with the codec's own rules. */
export const codec = createCodec()

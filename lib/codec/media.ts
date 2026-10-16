/**
 * The codec's rules for what a link or a file becomes in a doc (docs programme
 * B4): a bookmark, an embed, a file block (a video, audio, a PDF or any file)
 * and a link mention, plus an image's alignment, crop and link. The same rules,
 * in the same order, as the API's business/ContentCodec/media.go; the golden
 * fixture testdata/codec/media.* holds the two to the same bytes.
 *
 * In HTML each block is the div the editor renders, its attributes as data-*,
 * holding a plain link to what it points at (mediaLink.ts), so a reader that
 * knows nothing of it (another editor, a search index, an email) still has the
 * link and its words. In Markdown each is that link.
 */

import { CNode, attrString, node, setAttr } from './doc'
import { escapeAttr, escapeText } from './htmlEscape'
import { FILE_KINDS, fileHref, mediaLinkOf, webHref } from './mediaLink'
import type { NodeSpec } from './schema'

const none = (name: string) => ({ name, def: null })

export const MEDIA_NODE_SPECS: Record<string, NodeSpec> = {
  bookmark: { name: 'bookmark', content: 'nothing', attrs: ['href', 'title', 'description', 'siteName', 'icon', 'image'].map(none) },
  webEmbed: { name: 'webEmbed', content: 'nothing', attrs: ['src', 'height'].map(none) },
  fileBlock: { name: 'fileBlock', content: 'nothing', attrs: [{ name: 'kind', def: 'file' }, ...['src', 'id', 'name', 'size', 'mime', 'caption'].map(none)] },
  linkMention: { name: 'linkMention', inline: true, content: 'nothing', attrs: ['href', 'title', 'icon', 'siteName'].map(none) },
}

/** An image's own attributes beyond Tiptap's, as data-* after its others. */
export const IMAGE_MEDIA_ATTRS: [string, string][] = [
  ['align', 'data-align'],
  ['crop', 'data-crop'],
  ['href', 'data-href'],
]

const ALIGNS = ['left', 'center', 'full']
/** Four fractions of the picture: left, top, width, height. */
const CROP = /^(0|1|0\.\d{1,4})(,(0|1|0\.\d{1,4})){3}$/

/** Each block's data-type, and its attributes in order. */
const BLOCKS: Record<string, { dataType: string; attrs: [string, string][] }> = {
  bookmark: {
    dataType: 'bookmark',
    attrs: [
      ['href', 'data-href'],
      ['title', 'data-title'],
      ['description', 'data-description'],
      ['siteName', 'data-site'],
      ['icon', 'data-icon'],
      ['image', 'data-image'],
    ],
  },
  webEmbed: {
    dataType: 'web-embed',
    attrs: [
      ['src', 'data-src'],
      ['height', 'data-height'],
    ],
  },
  fileBlock: {
    dataType: 'file',
    attrs: [
      ['kind', 'data-kind'],
      ['src', 'data-src'],
      ['id', 'data-id'],
      ['name', 'data-name'],
      ['size', 'data-size'],
      ['mime', 'data-mime'],
      ['caption', 'data-caption'],
    ],
  },
}

const MENTION_ATTRS: [string, string][] = [
  ['title', 'data-title'],
  ['icon', 'data-icon'],
  ['siteName', 'data-site'],
]

/** The link a block or a mention stands for, as a linked text node, or null. */
export function mediaLink(n: CNode): CNode | null {
  const link = BLOCKS[n.type] || n.type === 'linkMention' ? mediaLinkOf(n.type, n.attrs) : null
  return link ? { type: 'text', text: link.text, marks: [...(n.marks || []), { type: 'link', attrs: { href: link.href } }] } : null
}

/** Writes a block's HTML; false when n isn't one of these. */
export function writeMediaBlock(out: string[], n: CNode): boolean {
  const b = BLOCKS[n.type]
  if (!b) return false
  out.push('<div data-type="' + b.dataType + '"')
  for (const [a, key] of b.attrs) {
    const v = attrString(n, a)
    if (v) out.push(' ' + key + '="' + escapeAttr(v) + '"')
  }
  out.push('>')
  const link = mediaLinkOf(n.type, n.attrs)
  if (link) out.push('<a href="' + escapeAttr(link.href) + '">' + escapeText(link.text) + '</a>')
  out.push('</div>')
  return true
}

/** A link mention's HTML: the link itself, with what the chip shows as data-*. */
export function writeLinkMention(out: string[], n: CNode) {
  const link = mediaLinkOf(n.type, n.attrs)
  out.push('<a data-type="link-mention"')
  if (link) out.push(' href="' + escapeAttr(link.href) + '"')
  for (const [a, key] of MENTION_ATTRS) {
    const v = attrString(n, a)
    if (v) out.push(' ' + key + '="' + escapeAttr(v) + '"')
  }
  out.push('>' + escapeText(link ? link.text : attrString(n, 'title')) + '</a>')
}

/**
 * Reads a block from its div, or null when it can't be one (no safe address),
 * and the div is read as any other. Foreign HTML keeps no picture: an icon or
 * an image there is another site's address, never one kept with the doc.
 */
export function readMediaBlock(dataType: string, el: Element, foreign: boolean): CNode | null {
  const type = Object.keys(BLOCKS).find((k) => BLOCKS[k].dataType === dataType)
  if (!type) return null
  const n = node(type, { attrs: {} })
  for (const [a, key] of BLOCKS[type].attrs) {
    const v = el.getAttribute(key)
    if (v) setAttr(n, a, v)
  }
  if (type === 'fileBlock') {
    if (attrString(n, 'src') && !fileHref(attrString(n, 'src'))) delete n.attrs!.src
    if (foreign && !attrString(n, 'src')) return null
  } else if (!webHref(attrString(n, type === 'bookmark' ? 'href' : 'src'))) return null
  for (const a of ['icon', 'image']) if (n.attrs![a] !== undefined && (foreign || !fileHref(attrString(n, a)))) delete n.attrs![a]
  return n
}

/** Reads a link mention, or null to read the element as a link. */
export function readLinkMention(el: Element, foreign: boolean): CNode | null {
  const href = el.getAttribute('href') || ''
  if (!webHref(href)) return null
  const n = node('linkMention', { attrs: { href } })
  for (const [a, key] of MENTION_ATTRS) {
    const v = el.getAttribute(key)
    if (v && !(a === 'icon' && (foreign || !fileHref(v)))) setAttr(n, a, v)
  }
  return n
}

/** An image's alignment, crop and link from its element, when they are sound. */
export function readImageMedia(el: Element, img: CNode) {
  const align = el.getAttribute('data-align')
  if (align && ALIGNS.includes(align)) setAttr(img, 'align', align)
  const crop = el.getAttribute('data-crop')
  if (crop && CROP.test(crop)) setAttr(img, 'crop', crop)
  const href = el.getAttribute('data-href')
  if (href && webHref(href)) setAttr(img, 'href', href)
}

/** An attribute of these blocks as the editor types it; undefined when it isn't one of theirs. */
export function typedMediaAttr(typ: string, name: string, v: unknown): unknown {
  if ((typ === 'webEmbed' && name === 'height') || (typ === 'fileBlock' && name === 'size')) {
    const i = typeof v === 'number' ? Math.trunc(v) : typeof v === 'string' && /^\d+$/.test(v) ? parseInt(v, 10) : null
    return i === null || i < 0 ? null : typ === 'webEmbed' ? Math.min(i, 4000) : i
  }
  if (typ === 'fileBlock' && name === 'kind') return typeof v === 'string' && FILE_KINDS.includes(v) ? v : 'file'
  return undefined
}

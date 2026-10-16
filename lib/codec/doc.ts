/**
 * The codec's doc model: the editor's JSON (ProseMirror's, as Tiptap writes
 * it), and the helpers every direction shares with the API's Go codec.
 */

import { specOf } from './schema'
import { dateWords } from './connectedValues'

export interface CMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface CNode {
  type: string
  attrs?: Record<string, unknown>
  content?: CNode[]
  marks?: CMark[]
  text?: string
}

export const node = (type: string, extra: Partial<CNode> = {}): CNode => ({ type, ...extra })

/** An attribute as a string: '' when missing, not a string, or empty. */
export function attrString(n: { attrs?: Record<string, unknown> } | undefined, name: string): string {
  return stringOf(n?.attrs?.[name])
}

export function stringOf(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return ''
}

/** A whole-number attribute, or def. */
export function attrInt(n: CNode, name: string, def: number): number {
  const v = n.attrs?.[name]
  if (typeof v === 'number') return Math.trunc(v)
  if (typeof v === 'string') {
    if (v === '' || !/^[0-9]+$/.test(v)) return def
    const i = parseInt(v, 10)
    return i > 1 << 30 ? def : i
  }
  return def
}

export function attrBool(n: CNode, name: string, def: boolean): boolean {
  const v = n.attrs?.[name]
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v === 'true'
  return def
}

export function setAttr(n: CNode, name: string, v: unknown) {
  n.attrs = { ...(n.attrs || {}), [name]: v }
}

export const firstNonEmpty = (...vs: string[]) => vs.find((v) => v !== '') ?? ''

/** Whitespace as both codecs count it (Go's unicode.IsSpace and JavaScript's trim differ). */
export function isSpaceChar(c: number): boolean {
  return (
    c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0b || c === 0x0c || c === 0x0d || c === 0x85 || c === 0xa0 ||
    c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f ||
    c === 0x3000 || c === 0xfeff
  )
}

export function trimSpace(s: string): string {
  let a = 0
  let b = s.length
  while (a < b && isSpaceChar(s.charCodeAt(a))) a++
  while (b > a && isSpaceChar(s.charCodeAt(b - 1))) b--
  return s.slice(a, b)
}

export const trimLeftSpace = (s: string) => {
  let a = 0
  while (a < s.length && isSpaceChar(s.charCodeAt(a))) a++
  return s.slice(a)
}

export const trimRightSpace = (s: string) => {
  let b = s.length
  while (b > 0 && isSpaceChar(s.charCodeAt(b - 1))) b--
  return s.slice(0, b)
}

export const blank = (s: string) => trimSpace(s) === ''

/** The doc's text: blocks on lines of their own, inline atoms by their label. */
export function plainText(n: CNode | undefined): string {
  const out: string[] = []
  const len = () => out.reduce((a, s) => a + s.length, 0)
  const endsWithNewline = () => {
    for (let i = out.length - 1; i >= 0; i--) if (out[i] !== '') return out[i].endsWith('\n')
    return false
  }
  const walk = (x: CNode | undefined) => {
    if (!x) return
    switch (x.type) {
      case 'text':
        out.push(x.text || '')
        return
      case 'hardBreak':
        out.push('\n')
        return
      case 'mention':
        out.push('@' + firstNonEmpty(attrString(x, 'label'), attrString(x, 'id')))
        return
      case 'channelMention':
        out.push('#' + firstNonEmpty(attrString(x, 'label'), attrString(x, 'id')))
        return
      case 'entityMention':
        out.push(firstNonEmpty(attrString(x, 'label'), attrString(x, 'id')))
        return
      case 'inlineMath':
        out.push('$' + attrString(x, 'latex') + '$')
        return
      case 'blockMath':
        out.push(attrString(x, 'latex'))
        break
      case 'linkMention':
        out.push(firstNonEmpty(attrString(x, 'title'), attrString(x, 'href')))
        return
      case 'dateMention':
        out.push(dateWords(x.attrs?.date))
        return
    }
    for (const c of x.content || []) walk(c)
    const spec = specOf(x.type)
    if (!spec || !spec.inline) {
      if (len() > 0 && !endsWithNewline()) out.push('\n')
    }
  }
  walk(n)
  return trimSpace(out.join(''))
}

/** A doc's JSON as the fixtures hold it: keys sorted at every level, two-space indent, a final newline. */
export function canonicalJSON(n: CNode): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort)
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      return Object.fromEntries(
        Object.keys(o)
          .filter((k) => o[k] !== undefined)
          .sort()
          .map((k) => [k, sort(o[k])]),
      )
    }
    return v
  }
  return JSON.stringify(sort(n), null, 2) + '\n'
}

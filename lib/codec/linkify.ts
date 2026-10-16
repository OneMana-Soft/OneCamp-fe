/**
 * Bare web addresses in text become links, as GitHub's "extended autolinks"
 * (http://…, https://…, www.…), by the codec's own rules: the same as the
 * API's business/ContentCodec/linkify.go, rather than markdown-it's or
 * goldmark's, so the two codecs agree on every address.
 */

import type { CMark, CNode } from './doc'

const isAutolinkSpace = (c: number) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0x0c || c === 0x0b

export function linkify(n: CNode) {
  if (!n || n.type === 'codeBlock' || !n.content?.length) return
  const out: CNode[] = []
  let changed = false
  for (const c of n.content) {
    const marks = c.marks || []
    if (c.type !== 'text' || marks.some((m) => m.type === 'link' || m.type === 'code')) {
      linkify(c)
      out.push(c)
      continue
    }
    const parts = autolinks(c.text || '')
    if (parts.length === 1 && !parts[0].href) {
      out.push(c)
      continue
    }
    changed = true
    for (const p of parts) {
      const m: CMark[] = [...marks]
      if (p.href) m.push({ type: 'link', attrs: { href: p.href } })
      out.push(m.length ? { type: 'text', text: p.text, marks: m } : { type: 'text', text: p.text })
    }
  }
  if (changed) n.content = out
}

interface Part {
  text: string
  href?: string
}

export function autolinks(s: string): Part[] {
  const parts: Part[] = []
  let last = 0
  for (let i = 0; i < s.length; i++) {
    if (i > 0) {
      const prev = s.charCodeAt(i - 1)
      if (!(isAutolinkSpace(prev) || prev === 0x2a || prev === 0x5f || prev === 0x7e || prev === 0x28)) continue
    }
    const rest = s.slice(i)
    const low = rest.slice(0, 8).toLowerCase()
    let prefix: string
    if (low.startsWith('https://')) prefix = rest.slice(0, 8)
    else if (low.startsWith('http://')) prefix = rest.slice(0, 7)
    else if (low.startsWith('www.')) prefix = ''
    else continue
    let end = i
    while (end < s.length) {
      const c = s.charCodeAt(end)
      if (isAutolinkSpace(c) || c === 0x3c || c < 0x20 || c === 0x7f) break
      end++
    }
    const cand = trimAutolink(s.slice(i, end))
    if (!validDomain(cand.slice(prefix.length))) continue
    if (prefix !== '' && cand.length === prefix.length) continue
    if (i > last) parts.push({ text: s.slice(last, i) })
    parts.push({ text: cand, href: prefix === '' ? 'http://' + cand : cand })
    last = i + cand.length
    i = last - 1
  }
  if (last < s.length || parts.length === 0) parts.push({ text: s.slice(last) })
  return parts
}

const count = (s: string, ch: string) => s.split(ch).length - 1

function trimAutolink(input: string): string {
  let s = input
  for (;;) {
    if (s === '') return s
    const c = s[s.length - 1]
    if ('?!.,:*_~\'"'.includes(c)) {
      s = s.slice(0, -1)
      continue
    }
    if (c === ')' && count(s, ')') > count(s, '(')) {
      s = s.slice(0, -1)
      continue
    }
    if (c === ';') {
      const amp = s.lastIndexOf('&')
      if (amp >= 0 && /^[A-Za-z0-9]+$/.test(s.slice(amp + 1, s.length - 1))) {
        s = s.slice(0, amp)
        continue
      }
    }
    return s
  }
}

function validDomain(s: string): boolean {
  let end = s.length
  for (let i = 0; i < s.length; i++) {
    if ('/?#:'.includes(s[i])) {
      end = i
      break
    }
  }
  const domain = s.slice(0, end)
  if (domain === '') return false
  const segs = domain.split('.')
  if (segs.length < 2) return false
  return segs.every((seg, i) => {
    if (seg === '') return false
    for (let j = 0; j < seg.length; j++) {
      const c = seg.charCodeAt(j)
      const ok = (c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a) || (c >= 0x30 && c <= 0x39) || c === 0x2d || c === 0x5f || c >= 0x80
      if (!ok) return false
      if (c === 0x5f && i >= segs.length - 2) return false
    }
    return true
  })
}

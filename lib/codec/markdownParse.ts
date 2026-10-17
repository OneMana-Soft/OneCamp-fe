/**
 * Reading GitHub-flavoured Markdown as a doc, with markdown-it: the same doc
 * as the API's business/ContentCodec/md_in.go reads with goldmark. Both
 * readers are CommonMark; where the two libraries differ, both codecs pin the
 * behaviour themselves: strikethrough takes two tildes, bare web addresses
 * become links by the codec's own rules (linkify.ts), task boxes are read as
 * goldmark reads them, link destinations are kept as written (not
 * percent-encoded).
 */

import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import { CMark, CNode, blank, node, plainText, trimLeftSpace, trimRightSpace, trimSpace } from './doc'
import { fromHTML, safeImageSrc } from './html'
import { linkify } from './linkify'
import { normalize, isInlineNode, sameMarks } from './normalize'
import { EVERYTHING, Schema, SHIPPED } from './schema'
import { cleanLanguage } from './markdown'
import { isTocLine } from './docFormat'
import { isSafeHref } from '@/lib/utils/safeHref'

let md: MarkdownIt | null = null

function parser(): MarkdownIt {
  if (md) return md
  const m = new MarkdownIt('default', { html: true, linkify: false, typographer: false, breaks: false })
  // Destinations as written, as goldmark keeps them: no percent-encoding.
  m.normalizeLink = (url: string) => url
  m.normalizeLinkText = (url: string) => url
  m.validateLink = () => true
  pinDelimiters(m)
  pinEscapes(m)
  pinStrikethrough(m)
  m.inline.ruler.before('backticks', 'math_inline', mathInline)
  md = m
  return m
}

/**
 * GitHub's inline maths, as the Go codec's dollarMath reads it: $, a code
 * span on one line, then $ straight after it ($`x^2`$). Its TeX is the span's
 * text, a space either side dropped when both are there. An escaped \$ is
 * text before this rule sees it.
 */
function mathInline(state: { src: string; pos: number; posMax: number; push(type: string, tag: string, nesting: number): Token }, silent: boolean): boolean {
  const src = state.src
  const start = state.pos
  if (src.charCodeAt(start) !== 0x24 || src.charCodeAt(start + 1) !== 0x60) return false
  let p = start + 1
  while (p < state.posMax && src.charCodeAt(p) === 0x60) p++
  const ticks = p - start - 1
  for (let q = p; q < state.posMax; ) {
    const c = src.charCodeAt(q)
    if (c === 0x0a) return false
    if (c !== 0x60) {
      q++
      continue
    }
    let e = q
    while (e < state.posMax && src.charCodeAt(e) === 0x60) e++
    if (e - q === ticks) {
      if (src.charCodeAt(e) !== 0x24) return false
      let latex = src.slice(p, q)
      if (latex.length > 2 && latex.startsWith(' ') && latex.endsWith(' ') && latex.replace(/^ +/, '') !== '') latex = latex.slice(1, -1)
      if (!silent) state.push('math_inline', '', 0).content = latex
      state.pos = e + 1
      return true
    }
    q = e
  }
  return false
}

/**
 * Emphasis opens and closes by the characters either side of its delimiters,
 * read as whole code points and with Unicode's whitespace, as goldmark reads
 * them. markdown-it reads UTF-16 units, so an emoji beside "**" counted as a
 * letter where CommonMark (and goldmark) counts it as punctuation.
 */
function pinDelimiters(m: MarkdownIt) {
  const { isWhiteSpace, isPunctChar, isMdAsciiPunct } = m.utils
  const space = (c: number) => isWhiteSpace(c) || c === 0x85 || c === 0x2028 || c === 0x2029
  const punct = (c: number) => isMdAsciiPunct(c) || isPunctChar(String.fromCodePoint(c))
  class State extends m.inline.State {
    scanDelims(start: number, canSplitWord: boolean) {
      const src = this.src
      const max = this.posMax
      const marker = src.charCodeAt(start)
      let last = 0x20
      if (start > 0) {
        last = src.charCodeAt(start - 1)
        const high = start > 1 ? src.charCodeAt(start - 2) : 0
        if (last >= 0xdc00 && last <= 0xdfff && high >= 0xd800 && high <= 0xdbff) last = (high - 0xd800) * 0x400 + (last - 0xdc00) + 0x10000
      }
      let pos = start
      while (pos < max && src.charCodeAt(pos) === marker) pos++
      const next = pos < max ? (src.codePointAt(pos) as number) : 0x20
      const lastPunct = punct(last)
      const nextPunct = punct(next)
      const lastSpace = space(last)
      const nextSpace = space(next)
      const left = !nextSpace && (!nextPunct || lastSpace || lastPunct)
      const right = !lastSpace && (!lastPunct || nextSpace || nextPunct)
      return {
        can_open: left && (canSplitWord || !right || lastPunct),
        can_close: right && (canSplitWord || !left || nextPunct),
        length: pos - start,
      }
    }
  }
  m.inline.State = State
}

/**
 * A backslash escapes ASCII punctuation and a line end; before anything else
 * it is a backslash, and what follows it is read as usual (CommonMark,
 * goldmark). markdown-it took the next character with it, so a backslash
 * before the two spaces of a line break lost the break.
 */
function pinEscapes(m: MarkdownIt) {
  const escapable = '\\!"#$%&\'()*+,./:;<=>?@[]^_`{|}~-'
  const { isSpace } = m.utils
  m.inline.ruler.at('escape', (state, silent) => {
    let pos = state.pos
    const max = state.posMax
    if (state.src.charCodeAt(pos) !== 0x5c || pos + 1 >= max) return false
    pos++
    const ch = state.src[pos]
    if (ch === '\n') {
      if (!silent) state.push('hardbreak', 'br', 0).markup = '\\\n'
      pos++
      while (pos < max && isSpace(state.src.charCodeAt(pos))) pos++
      state.pos = pos
      return true
    }
    if (!escapable.includes(ch)) return false
    if (!silent) {
      const t = state.push('text_special', '', 0)
      t.content = ch
      t.markup = '\\' + ch
      t.info = 'escape'
    }
    state.pos = pos + 1
    return true
  })
}

/**
 * Strikethrough takes exactly two tildes, not straight after another (an
 * escaped one included), as the Go codec's goldmark extension reads them;
 * markdown-it split longer runs into pairs.
 */
function pinStrikethrough(m: MarkdownIt) {
  m.inline.ruler.at('strikethrough', (state, silent) => {
    const start = state.pos
    if (silent || state.src.charCodeAt(start) !== 0x7e) return false
    const scanned = state.scanDelims(start, true)
    if (scanned.length !== 2 || (start > 0 && state.src.charCodeAt(start - 1) === 0x7e)) {
      state.pending += state.src.slice(start, start + scanned.length)
      state.pos += scanned.length
      return true
    }
    const token = state.push('text', '', 0)
    token.content = '~~'
    state.delimiters.push({ marker: 0x7e, length: 0, token: state.tokens.length - 1, end: -1, open: scanned.can_open, close: scanned.can_close })
    state.pos += 2
    return true
  })
}

export function fromMarkdown(src: string, schema: Schema = SHIPPED): CNode {
  // A last line of only spaces or tabs is dropped, as markdown-it drops it and
  // goldmark keeps it in a code block left open.
  const text = src
    .replace(/\r\n?/g, '\n')
    .split(String.fromCharCode(0))
    .join(String.fromCharCode(0xfffd))
    .replace(/\n[ \t]+$/, '\n')
  const tokens = parser().parse(text, {})
  const r = new Reader(tokens)
  const doc = node('doc', { content: r.blocks(0, tokens.length) })
  trimTextblocks(doc)
  joinText(doc)
  linkify(doc)
  dropEmptyParagraphs(doc)
  return normalize(doc, schema)
}

/** A Markdown table as a table node, when the text is exactly one table (MarkdownOptions.readTable). */
export function readTable(src: string): CNode | null {
  const doc = fromMarkdown(src, EVERYTHING)
  return doc.content?.length === 1 && doc.content[0].type === 'table' ? doc.content[0] : null
}

/** Joins neighbouring text with the same marks before addresses are looked for, as the Go codec does. */
function joinText(n: CNode) {
  if (!n.content?.length) return
  n.content = mergeText(n.content)
  for (const c of n.content) joinText(c)
}

/** Trims the whitespace a paragraph or heading starts and ends with, as the Go codec does. */
function trimTextblocks(n: CNode) {
  if (n.type === 'paragraph' || n.type === 'heading') {
    n.content = trimInlineEdges(n.content || [])
    return
  }
  for (const c of n.content || []) trimTextblocks(c)
}

/**
 * Drops the whitespace and line breaks (which write nothing in Markdown
 * either) inline content starts and ends with, through as many nodes as that
 * takes.
 */
function trimInlineEdges(content: CNode[]): CNode[] {
  let c = content
  const isCode = (x: CNode) => (x.marks || []).some((m) => m.type === 'code')
  while (c.length) {
    let first = c[0]
    if (first.type === 'text' && !isCode(first)) first = c[0] = { ...first, text: trimLeftSpace(first.text || '') }
    if (first.type !== 'hardBreak' && (first.type !== 'text' || first.text !== '')) break
    c = c.slice(1)
  }
  while (c.length) {
    let last = c[c.length - 1]
    if (last.type === 'text' && !isCode(last)) last = c[c.length - 1] = { ...last, text: trimRightSpace(last.text || '') }
    if (last.type !== 'hardBreak' && (last.type !== 'text' || last.text !== '')) break
    c = c.slice(0, -1)
  }
  return c
}

function blankInline(content: CNode[] | undefined): boolean {
  return (content || []).every((c) => c.type === 'text' && blank(c.text || ''))
}

/**
 * Removes paragraphs with nothing in them (Markdown has no way to write one).
 * A toggle's first line stays, empty or not: it is its <summary>, and without
 * it the toggle's first block would take its place.
 */
function dropEmptyParagraphs(n: CNode) {
  if (!n.content?.length) return
  n.content = n.content.filter((c, i) => !(c.type === 'paragraph' && blankInline(c.content) && !(n.type === 'collapsible' && i === 0)))
  for (const c of n.content) dropEmptyParagraphs(c)
}

const ALERT_COLOR: Record<string, string> = {
  NOTE: 'blue',
  TIP: 'green',
  IMPORTANT: 'purple',
  WARNING: 'yellow',
  CAUTION: 'red',
  REMARK: 'gray',
  AI: 'agent',
}

class Reader {
  constructor(private t: Token[]) {}

  /** The index just after the token that closes the one at i. */
  close(i: number): number {
    let depth = 0
    for (let j = i; j < this.t.length; j++) {
      depth += this.t[j].nesting
      if (depth === 0) return j + 1
    }
    return this.t.length
  }

  /** Reads the blocks from tokens [i, end), folding <details> … </details> into toggles. */
  blocks(i: number, end: number): CNode[] {
    const out: CNode[] = []
    const stack: CNode[] = []
    const emit = (...ns: CNode[]) => {
      if (stack.length) {
        const top = stack[stack.length - 1]
        top.content = [...(top.content || []), ...ns]
      } else out.push(...ns)
    }
    while (i < end) {
      const tok = this.t[i]
      if (tok.type === 'html_block') {
        const raw = tok.content
        const open = detailsOpen(raw)
        if (open) {
          stack.push(node('collapsible', { content: open.summary }))
          if (trimSpace(open.rest) !== '') emit(...rawHTMLBlocks(open.rest))
          i++
          continue
        }
        const before = detailsClose(raw)
        if (before !== null && stack.length) {
          if (trimSpace(before) !== '') emit(...rawHTMLBlocks(before))
          const toggle = stack.pop()!
          emit(toggle)
          i++
          continue
        }
        emit(...rawHTMLBlocks(raw))
        i++
        continue
      }
      const next = tok.nesting === 1 ? this.close(i) : i + 1
      emit(...this.block(i, next))
      i = next
    }
    while (stack.length) {
      const toggle = stack.pop()!
      emit(toggle)
    }
    return out
  }

  block(i: number, end: number): CNode[] {
    const tok = this.t[i]
    switch (tok.type) {
      case 'paragraph_open':
        if (isTocLine(trimSpace(this.t[i + 1].content))) return [node('toc')]
        return this.paragraph(this.t[i + 1])
      case 'heading_open':
        return [node('heading', { attrs: { level: Number(tok.tag.slice(1)) }, content: this.inline(this.t[i + 1].children || []) })]
      case 'hr':
        return [node('horizontalRule')]
      case 'code_block':
        return [codeBlock(tok.content.replace(/\n$/, ''), '')]
      case 'fence': {
        const lang = (tok.info || '').trim().split(/\s+/)[0] || ''
        const body = tok.content.replace(/\n$/, '')
        if (lang.toLowerCase() === 'chart') {
          const spec = trimSpace(body)
          if (spec.startsWith('{') && validJSON(spec)) return [node('chartEmbed', { attrs: { spec } })]
        }
        if (lang.toLowerCase() === 'math') return [node('blockMath', body ? { attrs: { latex: body } } : {})]
        return [codeBlock(body, lang)]
      }
      case 'blockquote_open': {
        const inner = this.blocks(i + 1, end - 1)
        const callout = asCallout(inner)
        return [callout || node('blockquote', { content: inner })]
      }
      case 'bullet_list_open':
      case 'ordered_list_open':
        return this.list(i, end)
      case 'table_open':
        return [this.table(i, end)]
    }
    return []
  }

  paragraph(inlineTok: Token): CNode[] {
    const inline = this.inline(inlineTok.children || [])
    const out: CNode[] = []
    let run: CNode[] = []
    const flush = () => {
      run = trimRun(run)
      if (run.length) out.push(node('paragraph', { content: run }))
      run = []
    }
    for (const k of inline) {
      if (isInlineNode(k)) {
        run.push(k)
        continue
      }
      flush()
      out.push(k)
    }
    flush()
    return out.length ? out : [node('paragraph')]
  }

  list(i: number, end: number): CNode[] {
    const open = this.t[i]
    const ordered = open.type === 'ordered_list_open'
    const start = ordered ? Number(open.attrGet('start') ?? 1) : 1
    const out: CNode[] = []
    let cur: CNode | null = null
    let j = i + 1
    while (j < end - 1) {
      const itemEnd = this.close(j)
      const { checked, isTask } = this.taskBox(j, itemEnd)
      const kind = isTask ? 'taskList' : ordered ? 'orderedList' : 'bulletList'
      if (!cur || cur.type !== kind) {
        cur = node(kind)
        if (kind === 'orderedList') cur.attrs = { start }
        out.push(cur)
      }
      const item = isTask ? node('taskItem', { attrs: { checked } }) : node('listItem')
      item.content = this.blocks(j + 1, itemEnd - 1)
      cur.content = [...(cur.content || []), item]
      j = itemEnd
    }
    return out
  }

  /** A task box at the start of an item's first paragraph, as goldmark reads one; it is taken out of the text. */
  taskBox(i: number, end: number): { checked: boolean; isTask: boolean } {
    const first = this.t[i + 1]
    if (!first || i + 1 >= end || first.type !== 'paragraph_open') return { checked: false, isTask: false }
    const inline = this.t[i + 2]
    const kids = inline?.children || []
    if (!kids.length || kids[0].type !== 'text') return { checked: false, isTask: false }
    const m = /^\[([\t\n\f\r xX])\][\t\n\f\r ]*/.exec(kids[0].content)
    if (!m) return { checked: false, isTask: false }
    kids[0].content = kids[0].content.slice(m[0].length)
    if (kids[0].content === '') {
      kids.shift()
      // The line break after a bare box is not part of the item's text.
      if ((kids[0] as Token | undefined)?.type === 'softbreak') kids.shift()
    }
    return { checked: m[1] === 'x' || m[1] === 'X', isTask: true }
  }

  table(i: number, end: number): CNode {
    const table = node('table', { content: [] })
    let row: CNode | null = null
    let header = false
    for (let j = i + 1; j < end; j++) {
      const tok = this.t[j]
      if (tok.type === 'thead_open') header = true
      if (tok.type === 'tbody_open') header = false
      if (tok.type === 'tr_open') row = node('tableRow', { content: [] })
      if (tok.type === 'tr_close' && row) {
        table.content!.push(row)
        row = null
      }
      if ((tok.type === 'th_open' || tok.type === 'td_open') && row) {
        const cell = node(header ? 'tableHeader' : 'tableCell')
        cell.content = [node('paragraph', { content: this.inline(this.t[j + 1].children || []) })]
        row.content!.push(cell)
      }
    }
    return table
  }

  /** A block's inline tokens as a flat run of text and inline nodes, each with its marks; images come back as image nodes. */
  inline(tokens: Token[]): CNode[] {
    const out: CNode[] = []
    // As the Go codec reads goldmark's tree: an emphasis, strikethrough or
    // link opens a frame, and the marks inline HTML opens inside it (<u>,
    // <b>, <a href>) close with it.
    const marks: CMark[] = []
    const frames: CMark[][] = [[]]
    const cur = () => {
      const all: CMark[] = [...frames[0]]
      marks.forEach((m, i) => all.push(m, ...frames[i + 1]))
      return all
    }
    const open = (m: CMark) => {
      marks.push(m)
      frames.push([])
    }
    const text = (s: string, extra?: CMark) => {
      const m = extra ? [...cur(), extra] : cur()
      out.push(m.length ? { type: 'text', text: s, marks: m } : { type: 'text', text: s })
    }
    // Spaces and tabs before a line end are dropped from the text that ends
    // the line, as goldmark (and cmark) drops them; markdown-it keeps tabs.
    const trimLineEnd = (k: number) => {
      const last = out[out.length - 1]
      if (k === 0 || tokens[k - 1].type !== 'text' || !tokens[k - 1].content || last?.type !== 'text') return
      last.text = (last.text || '').replace(/[ \t]+$/, '')
      if (!last.text) out.pop()
    }
    for (let k = 0; k < tokens.length; k++) {
      const tok = tokens[k]
      switch (tok.type) {
        case 'text':
          if (tok.content) text(tok.content)
          break
        case 'softbreak':
          trimLineEnd(k)
          text(' ')
          break
        case 'hardbreak': {
          if (tok.markup !== '\\\n') trimLineEnd(k)
          const m = cur()
          out.push(m.length ? { type: 'hardBreak', marks: m } : { type: 'hardBreak' })
          break
        }
        case 'code_inline':
          text(tok.content, { type: 'code' })
          break
        case 'math_inline': {
          const m = cur()
          const eq: CNode = { type: 'inlineMath', attrs: { latex: tok.content } }
          out.push(m.length ? { ...eq, marks: m } : eq)
          break
        }
        case 'em_open':
          open({ type: 'italic' })
          break
        case 'strong_open':
          open({ type: 'bold' })
          break
        case 's_open':
          open({ type: 'strike' })
          break
        case 'em_close':
        case 'strong_close':
        case 's_close':
        case 'link_close':
          if (marks.length) {
            marks.pop()
            frames.pop()
          }
          break
        case 'link_open': {
          let href = tok.attrGet('href') || ''
          if (tok.markup === 'autolink' && tok.info === 'auto') {
            // An e-mail autolink: markdown-it already prefixed mailto:.
            href = href
          }
          open(isSafeHref(href) ? { type: 'link', attrs: { href } } : { type: 'unsafe-link' })
          break
        }
        case 'image': {
          const src = tok.attrGet('src') || ''
          const alt = plainText(node('paragraph', { content: this.inline(tok.children || []) }))
          const img = node('image', { attrs: { src } })
          if (alt) img.attrs!.alt = alt
          const title = tok.attrGet('title')
          if (title) img.attrs!.title = title
          if (safeImageSrc(src, true)) out.push(img)
          else if (alt) text(alt)
          break
        }
        case 'html_inline':
          out.push(...inlineHTML(tok.content, cur(), frames[frames.length - 1]))
          break
        default:
          if (tok.children) out.push(...this.inline(tok.children))
      }
    }
    // An unsafe link keeps its text, unlinked.
    for (const n of out) if (n.marks) n.marks = n.marks.filter((m) => m.type !== 'unsafe-link')
    return out.map((n) => (n.marks && !n.marks.length ? { ...n, marks: undefined } : n))
  }
}

function codeBlock(body: string, lang: string): CNode {
  const cb = node('codeBlock')
  const l = cleanLanguage(lang)
  if (l) cb.attrs = { language: l }
  if (body) cb.content = [{ type: 'text', text: body }]
  return cb
}

function validJSON(s: string): boolean {
  try {
    JSON.parse(s)
    return true
  } catch {
    return false
  }
}

function trimRun(input: CNode[]): CNode[] {
  let run = [...input]
  while (run.length) {
    const first = run[0]
    if (first.type === 'hardBreak') {
      run = run.slice(1)
      continue
    }
    if (first.type === 'text' && !(first.marks || []).some((m) => m.type === 'code')) {
      const t = (first.text || '').replace(/^[ \t\n]+/, '')
      if (t === '') {
        run = run.slice(1)
        continue
      }
      run[0] = { ...first, text: t }
    }
    break
  }
  while (run.length) {
    const last = run[run.length - 1]
    if (last.type === 'hardBreak') {
      run = run.slice(0, -1)
      continue
    }
    if (last.type === 'text' && !(last.marks || []).some((m) => m.type === 'code')) {
      const t = (last.text || '').replace(/[ \t\n]+$/, '')
      if (t === '') {
        run = run.slice(0, -1)
        continue
      }
      run[run.length - 1] = { ...last, text: t }
    }
    break
  }
  return run
}

function mergeText(nodes: CNode[]): CNode[] {
  const out: CNode[] = []
  for (const n of nodes) {
    const prev = out[out.length - 1]
    if (n.type === 'text' && prev && prev.type === 'text' && sameMarks(prev.marks, n.marks)) {
      out[out.length - 1] = { ...prev, text: (prev.text || '') + (n.text || '') }
      continue
    }
    out.push(n)
  }
  return out
}

/** A quote that starts with an alert ([!NOTE]) is a callout. */
function asCallout(inner: CNode[]): CNode | null {
  if (!inner.length || inner[0].type !== 'paragraph' || !inner[0].content?.length) return null
  inner[0].content = mergeText(inner[0].content)
  const first = inner[0].content[0]
  if (first.type !== 'text' || first.marks?.length || !(first.text || '').startsWith('[!')) return null
  const t = first.text || ''
  const end = t.indexOf(']')
  if (end < 0) return null
  const color = ALERT_COLOR[t.slice(2, end).toUpperCase()]
  if (!color) return null
  const rest = t.slice(end + 1).replace(/^ +/, '')
  let content: CNode[]
  if (rest !== '') content = [{ type: 'text', text: rest }, ...inner[0].content.slice(1)]
  else {
    content = inner[0].content.slice(1)
    while (content.length && content[0].type === 'hardBreak') content = content.slice(1)
    if (content.length && content[0].type === 'text' && !content[0].marks?.length) {
      content[0] = { type: 'text', text: (content[0].text || '').replace(/^ +/, '') }
    }
  }
  const body = inner.slice(1)
  if (content.length) body.unshift(node('paragraph', { content }))
  return node('callout', { attrs: { color }, content: body })
}

/**
 * An HTML block that opens a toggle: <details> with its <summary>, and no
 * closing </details> in the same block. The summary is the toggle's first
 * line, and whether it was open is each reader's own.
 */
function detailsOpen(raw: string): { summary: CNode[]; rest: string } | null {
  const t = trimSpace(raw)
  const low = t.toLowerCase()
  if (!low.startsWith('<details')) return null
  const end = t.indexOf('>')
  if (end < 0 || low.includes('</details>')) return null
  let rest = t.slice(end + 1)
  let inner = ''
  const lowRest = rest.toLowerCase()
  const s = lowRest.indexOf('<summary')
  if (s >= 0) {
    const gt = rest.indexOf('>', s)
    const ce = lowRest.indexOf('</summary>')
    if (gt >= 0 && ce > gt) {
      inner = rest.slice(gt + 1, ce)
      rest = rest.slice(ce + '</summary>'.length)
    }
  }
  return { summary: summaryBlocks(inner), rest }
}

/** A <summary>'s HTML as a toggle's first line: a heading when it holds one (a toggle heading), else a paragraph, then anything else it held. */
function summaryBlocks(inner: string): CNode[] {
  const out = fromHTML(inner, { foreign: true, schema: EVERYTHING }).content || []
  if (!out.length || (out[0].type !== 'paragraph' && out[0].type !== 'heading')) out.unshift(node('paragraph'))
  return out
}

function detailsClose(raw: string): string | null {
  const i = raw.toLowerCase().indexOf('</details>')
  if (i < 0) return null
  if (trimSpace(raw.slice(i + '</details>'.length)) !== '') return null
  return raw.slice(0, i)
}

function rawHTMLBlocks(raw: string): CNode[] {
  const doc = fromHTML(raw, { foreign: true, schema: EVERYTHING })
  const c = doc.content || []
  if (c.length === 1 && c[0].type === 'paragraph' && !c[0].content?.length) return []
  return c
}

const TAG_MARK: Record<string, string> = { u: 'underline', mark: 'highlight', b: 'bold', strong: 'bold', i: 'italic', em: 'italic', s: 'strike', del: 'strike', strike: 'strike', code: 'code', kbd: 'code', a: 'link' }

/** One inline HTML tag: a mark opening or closing, a line break, an image. Any other tag is left out. */
function inlineHTML(raw: string, marks: CMark[], open: CMark[]): CNode[] {
  const t = trimSpace(raw)
  const low = t.toLowerCase()
  if (low.startsWith('<!--')) return []
  const closing = low.startsWith('</')
  let name = low.replace(/^<\/?/, '')
  const cut = name.search(/[ \t\n/>]/)
  if (cut >= 0) name = name.slice(0, cut)
  const mark = TAG_MARK[name] || ''
  if (name === 'br') return [marks.length ? { type: 'hardBreak', marks } : { type: 'hardBreak' }]
  if (name === 'img' && !closing) {
    const doc = fromHTML(t, { foreign: true, schema: EVERYTHING })
    const img = (doc.content || []).find((b) => b.type === 'image')
    return img ? [img] : []
  }
  if (mark && closing) {
    for (let i = open.length - 1; i >= 0; i--) {
      if (open[i].type === mark) {
        open.splice(i, 1)
        break
      }
    }
    return []
  }
  if (mark) {
    const m: CMark = { type: mark }
    if (mark === 'link') {
      const href = tagAttr(t, 'href')
      if (!isSafeHref(href)) return []
      m.attrs = { href }
    }
    open.push(m)
  }
  return []
}

/** One attribute of a single HTML tag, its references decoded. */
function tagAttr(tag: string, name: string): string {
  const el = new DOMParser().parseFromString(tag, 'text/html').body.firstElementChild
  return el?.getAttribute(name) ?? ''
}

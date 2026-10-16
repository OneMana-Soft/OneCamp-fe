/**
 * Writing a doc as GitHub-flavoured Markdown: the same bytes as the API's
 * business/ContentCodec/md_out.go, line for line (the fixtures in
 * testdata/codec hold both to that).
 *
 * Everything Markdown has syntax for is written in it: headings h1–h6, marks,
 * links, nested lists, task lists, quotes, code blocks, rules, images, tables.
 * A callout is a quote that starts with an alert (> [!NOTE]), a toggle is
 * <details> with its first line as the <summary>, an underline <u>, a
 * highlight <mark>, a table of contents [TOC], a chart its ```chart block (as
 * agents write one). Mentions are names (@Sam) or links (#channel, docs,
 * tasks), embeds links. Equations are GitHub's: $`x`$ in a line, a ```math
 * block on their own. What Markdown cannot say is left out: colours, image
 * sizes and captions, an item's list style, a quote's size, a code block's
 * wrap and caption, a block's indent and direction; columns are their blocks,
 * in order.
 */

import type { CodecRule } from './types'
import { CMark, CNode, attrBool, attrInt, attrString, firstNonEmpty, isSpaceChar, plainText, trimLeftSpace, trimRightSpace, blank } from './doc'
import { MARK_SPECS, specOf } from './schema'
import { escapeAttr, escapeText } from './htmlEscape'
import { mediaLink } from './media'
import { connectedLinkOf } from './connectedValues' // C1
import { dateWords } from './connectedValues'
import { isSafeHref } from '@/lib/utils/safeHref'

export interface MarkdownOptions {
  /** The web app's origin: links to channels, docs, tasks and tables are made under it; empty, they are paths. */
  appURL?: string
  /** The flavour for copying out of a doc: underline is left out rather than written as <u>. */
  clipboard?: boolean
  /** Rules for blocks the codec has none of its own for (a BlockSpec's codec). */
  rules?: CodecRule[]
  /**
   * Reads a Markdown table (markdownParse's readTable). With it, a code block
   * holding a table the codec kept is written as the table again, as the
   * API's writer always does; without it (copying out, which loads no
   * parser) the block stays a code block.
   */
  readTable?: (markdown: string) => CNode | null
}

const isInline = (c: CNode) => c.type === 'text' || !!specOf(c.type)?.inline

export function toMarkdown(doc: CNode | undefined, opts: MarkdownOptions = {}): string {
  if (!doc) return ''
  const w = new Writer(opts)
  let lines = doc.type === 'doc' ? w.blocks(doc.content || []) : w.blocks([doc])
  while (lines.length && lines[0] === '') lines = lines.slice(1)
  while (lines.length && lines[lines.length - 1] === '') lines = lines.slice(0, -1)
  return lines.length ? lines.join('\n') + '\n' : ''
}

/** One block's lines, as a table degraded to a code block writes it. */
export function markdownBlockLines(n: CNode, opts: MarkdownOptions): string[] {
  return new Writer(opts).block(n, false) || []
}

interface InlineCtx {
  heading?: boolean
  cell?: boolean
}

class Writer {
  constructor(private opts: MarkdownOptions) {}

  appURL(path: string) {
    return (this.opts.appURL || '').replace(/\/+$/, '') + path
  }

  blocks(nodes: CNode[]): string[] {
    const out: string[] = []
    for (const lines of this.sequence(nodes)) {
      if (!lines) continue
      if (out.length) out.push('')
      out.push(...lines)
    }
    return out
  }

  sequence(nodes: CNode[], prevKindIn = '', prevAltIn = false): (string[] | null)[] {
    let prevKind = prevKindIn
    let prevAlt = prevAltIn
    return nodes.map((n) => {
      const kind = listKind(n.type)
      const alt = kind !== '' && kind === prevKind && !prevAlt
      const lines = this.block(n, alt)
      if (lines) {
        prevKind = kind
        prevAlt = alt
      }
      return lines
    })
  }

  block(n: CNode, alt: boolean): string[] | null {
    switch (n.type) {
      case 'paragraph': {
        const text = this.inline(n.content || [], {})
        if (blank(text)) return null
        return text.split('\n').map((l) => l.replace(/^[ \t]+/, ''))
      }
      case 'heading': {
        const marker = '#'.repeat(Math.min(6, Math.max(1, attrInt(n, 'level', 1))))
        const text = this.inline(n.content || [], { heading: true })
        return [text === '' ? marker : marker + ' ' + text]
      }
      case 'blockquote':
        return quote(this.blocks(n.content || []), '')
      case 'callout':
        return quote(this.blocks(n.content || []), '[!' + calloutAlert(attrString(n, 'color')) + ']')
      case 'bulletList':
      case 'taskList': {
        const marker = alt ? '*' : '-'
        return this.list(n, () => marker)
      }
      case 'orderedList': {
        let start = attrInt(n, 'start', 1)
        if (start < 0 || start > 999999999) start = 1
        const delim = alt ? ')' : '.'
        return this.list(n, (i) => String(start + i) + delim)
      }
      case 'codeBlock':
        // A table the editor has no node for was kept as its Markdown in a
        // code block (normalize's degrade): it is written as the table again,
        // so Markdown that went in comes out the same.
        return (this.opts.readTable && keptTable(n, this.opts.readTable)) || fence(codeText(n), attrString(n, 'language'))
      case 'horizontalRule':
        return ['---']
      case 'blockMath':
        return fence(attrString(n, 'latex'), 'math')
      case 'image':
        return [this.image(n)]
      case 'bookmark':
      case 'webEmbed':
      case 'fileBlock': {
        // The link it stands for, written as a paragraph holding it is.
        const link = mediaLink(n)
        const text = link ? this.inline([link], {}) : escapeMarkdownText(attrString(n, 'name'), true)
        return blank(text) ? null : text.split('\n').map((l) => l.replace(/^[ \t]+/, ''))
      }
      case 'collapsible': {
        // Its first line is the <summary>. Open or closed is each reader's own, so none is written open.
        let body = n.content || []
        let summary = ''
        if (body.length && (body[0].type === 'paragraph' || body[0].type === 'heading')) {
          summary = this.summaryHTML(body[0])
          body = body.slice(1)
        }
        const out = ['<details>', '<summary>' + summary + '</summary>', '']
        const inner = this.blocks(body)
        if (inner.length) out.push(...inner, '')
        out.push('</details>')
        return out
      }
      case 'table':
        return this.table(n)
      case 'toc':
        return ['[TOC]']
      case 'tableEmbed': {
        const id = attrString(n, 'tableId')
        return [id ? '[Table](' + linkDest(this.appURL('/app/tables/' + id)) + ')' : 'Table']
      }
      case 'poll':
        return ['*Poll*']
      case 'chartEmbed':
        return fence(attrString(n, 'spec'), 'chart')
      case 'diffEmbed':
        return fence(attrString(n, 'diff'), 'diff')
      case 'recordingEmbed':
        return ['[Call recording](' + linkDest(this.appURL('/app/recordings')) + ')']
      case 'subpage':
      case 'taskListEmbed':
      case 'boardEmbed': {
        const { path, words } = connectedLinkOf(n.type, n.attrs)
        return [path ? '[' + escapeLinkText(words) + '](' + linkDest(this.appURL(path)) + ')' : escapeMarkdownText(words, true)]
      }
      case 'columnList':
        // Markdown has no columns: their blocks, column after column, in order.
        return this.blocks((n.content || []).flatMap((c) => (c.type === 'column' ? c.content || [] : [c])))
      case 'doc':
        return this.blocks(n.content || [])
    }
    const rule = this.opts.rules?.find((r) => r.name === n.type && r.toMarkdown)
    if (rule) {
      const children = this.blocks(n.content || []).join('\n')
      const md = rule.toMarkdown!(n, children)
      return md === '' ? null : md.split('\n')
    }
    if (isInline(n)) {
      const text = this.inline([n], {})
      return text === '' ? null : text.split('\n')
    }
    return this.blocks(n.content || [])
  }

  list(n: CNode, marker: (i: number) => string): string[] {
    const tight = isTightList(n)
    const out: string[] = []
    ;(n.content || []).forEach((item, i) => {
      const m = marker(i)
      let prefix = m + ' '
      if (item.type === 'taskItem') prefix += attrBool(item, 'checked', false) ? '[x] ' : '[ ] '
      const indent = ' '.repeat(m.length + 1)
      let content = item.content || []
      let prevKind = ''
      if (content.length > 1 && content[0].type === 'paragraph' && this.block(content[0], false) === null) {
        content = content.slice(1)
        if (m === '-') prevKind = 'bullet'
      }
      let body: string[] = []
      this.sequence(content, prevKind, false).forEach((lines, k) => {
        if (!lines) return
        if (!tight && k > 0 && body.length) body.push('')
        body.push(...lines)
      })
      if (!body.length) body = ['']
      if (!tight && i > 0) out.push('')
      body.forEach((l, j) => {
        if (j === 0) out.push((prefix + l).replace(/ +$/, ''))
        else if (l === '') out.push('')
        else out.push(indent + l)
      })
    })
    return out
  }

  image(n: CNode): string {
    const title = attrString(n, 'title')
    let out = '![' + escapeLinkText(attrString(n, 'alt')) + '](' + linkDest(attrString(n, 'src'))
    if (title) out += ' "' + escapeEntityAmp(title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')) + '"'
    // Its alignment, crop and link stay in HTML: Markdown reads a linked
    // picture back as a picture alone.
    return out + ')'
  }

  table(n: CNode): string[] | null {
    const rows: string[][] = []
    let cols = 0
    for (const r of n.content || []) {
      const cells: string[] = []
      for (const c of r.content || []) {
        const parts: string[] = []
        for (const b of c.content || []) {
          const text =
            b.type === 'paragraph' || b.type === 'heading'
              ? this.inline(b.content || [], { cell: true })
              : escapeCell(escapeMarkdownText(plainText(b), false))
          if (text !== '') parts.push(text)
        }
        cells.push(parts.join('<br>'))
      }
      cols = Math.max(cols, cells.length)
      rows.push(cells)
    }
    if (!rows.length || !cols) return null
    const line = (cells: string[]) => {
      const all = [...cells]
      while (all.length < cols) all.push('')
      return ('|' + all.map((c) => ' ' + c + ' |').join('')).split('  |').join(' |')
    }
    return [line(rows[0]), line(new Array(cols).fill('---')), ...rows.slice(1).map(line)]
  }

  mdMarks(n: CNode): CMark[] {
    return (n.marks || []).filter((m) => {
      switch (m.type) {
        case 'bold':
        case 'italic':
        case 'strike':
        case 'code':
        case 'link':
          return true
        case 'underline':
        case 'highlight':
          return !this.opts.clipboard
      }
      return false
    })
  }

  /**
   * A toggle's first line as its <summary> holds it: HTML, which is all a
   * <details> block holds, so Markdown inside it would be read as text. It
   * keeps what Markdown keeps (the marks it writes, a link's address, a
   * mention as its name or its link) and a heading is <hN>, so a toggle
   * heading stays one.
   */
  summaryHTML(line: CNode): string {
    const content: CNode[] = []
    for (const c of line.content || []) {
      let marks = this.mdMarks(c)
      const linked = (text: string, path: string): CNode => {
        if (path !== '' && !hasMark(marks, 'link')) marks = [{ type: 'link', attrs: { href: this.appURL(path) } }, ...marks]
        return { type: 'text', text, marks }
      }
      const label = firstNonEmpty(attrString(c, 'label'), attrString(c, 'id'))
      switch (c.type) {
        case 'text':
          content.push({ type: 'text', text: (c.text || '').split('\n').join(' '), marks })
          break
        case 'hardBreak':
          content.push({ type: 'hardBreak', marks })
          break
        case 'mention':
          content.push(linked('@' + label, ''))
          break
        case 'channelMention': {
          const id = attrString(c, 'id').replace(/^channel:/, '')
          content.push(linked('#' + label, id !== '' ? '/app/channel/' + id : ''))
          break
        }
        case 'entityMention':
          content.push(linked(label, entityHref(attrString(c, 'id'))))
          break
        default: {
          const t = plainText(c)
          if (t !== '') content.push({ type: 'text', text: t.split('\n').join(' '), marks })
        }
      }
    }
    // Each mark kept open over neighbours that share it, as the HTML writer does.
    let out = ''
    const active: CMark[] = []
    const closeTo = (keep: number) => {
      while (active.length > keep) out += summaryTag(active.pop()!, false)
    }
    for (const n of mergeSummaryText(content)) {
      const marks = n.marks || []
      let keep = 0
      while (keep < active.length && keep < marks.length && markEqual(active[keep], marks[keep])) keep++
      closeTo(keep)
      for (const m of marks.slice(keep)) {
        out += summaryTag(m, true)
        active.push(m)
      }
      out += n.type === 'hardBreak' ? '<br>' : escapeText(n.text || '')
    }
    closeTo(0)
    if (line.type === 'heading') {
      const tag = 'h' + Math.min(6, Math.max(1, attrInt(line, 'level', 1)))
      return '<' + tag + '>' + out + '</' + tag + '>'
    }
    return out
  }

  inline(input: CNode[], ctx: InlineCtx): string {
    // A link mention is written as the link it stands for.
    const all = input.map((n) =>
      n.type === 'linkMention' ? mediaLink(n) || { type: 'text', text: firstNonEmpty(attrString(n, 'title'), attrString(n, 'href')), marks: n.marks } : n,
    )
    let start = 0
    let end = all.length
    while (start < end && all[start].type === 'hardBreak') start++
    while (end > start && all[end - 1].type === 'hardBreak') end--
    const nodes = all.slice(start, end)

    const toks: Tok[] = []
    const active: { mark: CMark; span: Span }[] = []
    let atLineStart = !ctx.heading && !ctx.cell
    const text = (s: string, plain = false) => {
      if (s === '') return
      toks.push(plain ? { text: s, plain } : { text: s })
      if (s.replace(/^[ \t]+/, '') !== '') atLineStart = false
    }
    const closeTo = (keep: number) => {
      while (active.length > keep) {
        const a = active.pop()!
        toks.push({ close: true, span: a.span })
      }
    }
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      let marks = this.mdMarks(n)
      if (n.type === 'text' && hasMark(marks, 'code')) marks = [findMark(marks, 'code')!]

      if (
        n.type === 'text' &&
        marks.length === 1 &&
        marks[0].type === 'link' &&
        isAutolinkable(n.text || '', attrString(marks[0], 'href')) &&
        !(i + 1 < nodes.length && hasMarkEq(this.mdMarks(nodes[i + 1]), marks[0])) &&
        !(i > 0 && hasMarkEq(this.mdMarks(nodes[i - 1]), marks[0]))
      ) {
        closeTo(0)
        text('<' + n.text + '>')
        continue
      }

      let body = ''
      let lead = ''
      let trail = ''
      if (n.type === 'text') {
        body = n.text || ''
        if (!hasMark(marks, 'code')) body = body.split('\n').join(' ')
      }

      let keep = 0
      while (keep < active.length && hasMarkEq(marks, active[keep].mark)) keep++
      const kept = (m: CMark) => active.slice(0, keep).some((a) => markEqual(a.mark, m))
      const adds = marks.filter((m) => !kept(m))
      const runs = new Map(adds.map((m) => [m, runLength(this, nodes, i, m)]))
      adds.sort((a, c) => {
        const ra = runs.get(a)!
        const rc = runs.get(c)!
        if (ra !== rc) return rc - ra
        return MARK_SPECS[a.type].rank - MARK_SPECS[c.type].rank
      })
      if (n.type === 'text' && !hasMark(marks, 'code')) {
        if (adds.length > 0 || keep < active.length) {
          const trimmed = trimLeftSpace(body)
          lead = body.slice(0, body.length - trimmed.length)
          body = trimmed
        }
        let closing = i + 1 >= nodes.length
        if (!closing) {
          const next = this.mdMarks(nodes[i + 1])
          closing = marks.some((m) => !hasMarkEq(next, m))
        }
        if (closing && marks.length > 0) {
          const trimmed = trimRightSpace(body)
          trail = body.slice(trimmed.length)
          body = trimmed
        }
      }
      closeTo(keep)
      if (lead !== '') text(lead)
      if (n.type === 'text' && body === '' && !hasMark(marks, 'code')) {
        if (trail !== '') text(trail)
        continue
      }
      for (const m of adds) {
        if (m.type === 'code') continue
        const span: Span = { mark: m, html: false }
        toks.push({ open: true, span })
        active.push({ mark: m, span })
      }
      switch (n.type) {
        case 'text':
          if (hasMark(marks, 'code')) text(codeSpan(body))
          else {
            let esc = escapeMarkdownText(body, atLineStart)
            if (ctx.cell) esc = escapeCell(esc)
            text(esc, true)
          }
          break
        case 'dateMention':
          text(escapeMarkdownText(dateWords(n.attrs?.date), atLineStart))
          break
        case 'inlineMath': {
          // GitHub's inline maths: a code span between dollars, on one line.
          const latex = attrString(n, 'latex').split('\n').join(' ')
          if (latex) text('$' + codeSpan(latex) + '$')
          break
        }
        case 'hardBreak':
          if (ctx.heading || ctx.cell) text('<br>')
          else {
            toks.push({ text: '\\\n' })
            atLineStart = true
          }
          break
        case 'mention':
          text(escapeMarkdownText('@' + firstNonEmpty(attrString(n, 'label'), attrString(n, 'id')), atLineStart))
          break
        case 'channelMention': {
          const label = '#' + firstNonEmpty(attrString(n, 'label'), attrString(n, 'id'))
          const id = attrString(n, 'id').replace(/^channel:/, '')
          if (id === '' || hasMark(marks, 'link')) text(escapeMarkdownText(label, atLineStart))
          else text('[' + escapeLinkText(label) + '](' + linkDest(this.appURL('/app/channel/' + id)) + ')')
          break
        }
        case 'entityMention': {
          const label = firstNonEmpty(attrString(n, 'label'), attrString(n, 'id'))
          const href = entityHref(attrString(n, 'id'))
          if (href === '' || hasMark(marks, 'link')) text(escapeMarkdownText(label, atLineStart))
          else text('[' + escapeLinkText(label) + '](' + linkDest(this.appURL(href)) + ')')
          break
        }
      }
      if (trail !== '') {
        const nextMarks = i + 1 < nodes.length ? this.mdMarks(nodes[i + 1]) : []
        let k = 0
        while (k < active.length && hasMarkEq(nextMarks, active[k].mark)) k++
        closeTo(k)
        text(trail)
      }
    }
    closeTo(0)
    escapeMathEnds(toks)
    chooseEmphasis(toks)
    let out = toks.map(render).join('')
    if (ctx.heading && out.endsWith('#')) out = out.slice(0, -1) + '\\#'
    return out
  }
}

interface Span {
  mark: CMark
  html: boolean
}

interface Tok {
  open?: boolean
  close?: boolean
  span?: Span
  text?: string
  /** Text of the doc's own (not a code span or an equation). */
  plain?: boolean
}

/**
 * Text that starts with $ straight after a code span would read back as the
 * end of an equation ($`x`$): its $ is escaped.
 */
function escapeMathEnds(toks: Tok[]) {
  toks.forEach((t, i) => {
    if (!t.plain || !(t.text || '').startsWith('$')) return
    let j = i - 1
    while (j >= 0 && render(toks[j]) === '') j--
    if (j >= 0 && render(toks[j]).endsWith('`')) t.text = '\\' + t.text
  })
}

function render(t: Tok): string {
  if (!t.open && !t.close) return t.text || ''
  const [op, cl] = t.span!.html ? htmlDelims(t.span!.mark) : markDelims(t.span!.mark)
  return t.open ? op : cl
}

function markDelims(m: CMark): [string, string] {
  switch (m.type) {
    case 'bold':
      return ['**', '**']
    case 'italic':
      return ['*', '*']
    case 'strike':
      return ['~~', '~~']
    case 'underline':
      return ['<u>', '</u>']
    case 'highlight':
      // Its colour is left out, as every colour is.
      return ['<mark>', '</mark>']
    case 'link':
      return ['[', '](' + linkDest(attrString(m, 'href')) + ')']
  }
  return ['', '']
}

/** The tags of the marks Markdown writes, in a <summary>. */
const SUMMARY_TAGS: Record<string, string> = { bold: 'strong', italic: 'em', strike: 's', code: 'code', underline: 'u', highlight: 'mark', link: 'a' }

/** Opens or closes a mark in a <summary>: a link by its address alone, a highlight without its colour. */
function summaryTag(m: CMark, open: boolean): string {
  const tag = SUMMARY_TAGS[m.type]
  if (!open) return '</' + tag + '>'
  if (m.type === 'link') return '<a href="' + escapeAttr(attrString(m, 'href')) + '">'
  return '<' + tag + '>'
}

/** Neighbouring text with the same marks as one, as the Go codec's mergeText. */
function mergeSummaryText(nodes: CNode[]): CNode[] {
  const out: CNode[] = []
  for (const n of nodes) {
    const prev = out[out.length - 1]
    if (n.type === 'text' && prev && prev.type === 'text' && sameMarkList(prev.marks || [], n.marks || [])) {
      out[out.length - 1] = { ...prev, text: (prev.text || '') + (n.text || '') }
      continue
    }
    out.push(n)
  }
  return out
}

const sameMarkList = (a: CMark[], b: CMark[]) => a.length === b.length && a.every((m, i) => markEqual(m, b[i]))

function htmlDelims(m: CMark): [string, string] {
  switch (m.type) {
    case 'bold':
      return ['<strong>', '</strong>']
    case 'italic':
      return ['<em>', '</em>']
    case 'strike':
      return ['<s>', '</s>']
  }
  return markDelims(m)
}

function delimChar(m: CMark): string {
  if (m.type === 'bold' || m.type === 'italic') return '*'
  if (m.type === 'strike') return '~'
  return ''
}

/** Writes as HTML each emphasis whose ** * ~~ Markdown would not read as one (CommonMark's flanking rules). */
function chooseEmphasis(toks: Tok[]) {
  const isRun = (t: Tok, c: string) => (t.open || t.close) && delimChar(t.span!.mark) === c && !t.span!.html
  const around = (i: number, c: string): [number, number] => {
    let before = 0x0a
    let after = 0x0a
    let j = i
    while (j >= 0 && isRun(toks[j], c)) j--
    for (; j >= 0; j--) {
      const s = render(toks[j])
      if (s !== '') {
        before = lastCodePoint(s)
        break
      }
    }
    let k = i
    while (k < toks.length && isRun(toks[k], c)) k++
    for (; k < toks.length; k++) {
      const s = render(toks[k])
      if (s !== '') {
        after = s.codePointAt(0)!
        break
      }
    }
    return [before, after]
  }
  toks.forEach((t, i) => {
    if (!t.open && !t.close) return
    const c = delimChar(t.span!.mark)
    if (c === '' || t.span!.html) return
    const [before, after] = around(i, c)
    const [left, right] = flanking(before, after)
    if ((t.open && !left) || (t.close && !right)) t.span!.html = true
  })
}

function lastCodePoint(s: string): number {
  const last = s.charCodeAt(s.length - 1)
  if (last >= 0xdc00 && last <= 0xdfff && s.length > 1) return s.codePointAt(s.length - 2)!
  return last
}

const PUNCT = /[\p{P}\p{S}]/u
const ZS = /\p{Zs}/u

function flanking(before: number, after: number): [boolean, boolean] {
  const bs = mdSpace(before)
  const as = mdSpace(after)
  const bp = PUNCT.test(String.fromCodePoint(before))
  const ap = PUNCT.test(String.fromCodePoint(after))
  return [!as && (!ap || bs || bp), !bs && (!bp || as || ap)]
}

const mdSpace = (c: number) => isSpaceChar(c) || ZS.test(String.fromCodePoint(c))

function markEqual(a: CMark, b: CMark): boolean {
  if (a.type !== b.type) return false
  const ka = Object.keys(a.attrs || {})
  if (ka.length !== Object.keys(b.attrs || {}).length) return false
  return ka.every((k) => String(a.attrs?.[k] ?? '') === String(b.attrs?.[k] ?? ''))
}

const findMark = (marks: CMark[], type: string) => marks.find((m) => m.type === type)
const hasMark = (marks: CMark[], type: string) => !!findMark(marks, type)
const hasMarkEq = (marks: CMark[], m: CMark) => marks.some((o) => markEqual(o, m))

function runLength(w: Writer, nodes: CNode[], i: number, m: CMark): number {
  let n = 0
  for (let j = i; j < nodes.length; j++) {
    if (!hasMarkEq(w.mdMarks(nodes[j]), m)) break
    n++
  }
  return n
}

function listKind(type: string): string {
  if (type === 'bulletList' || type === 'taskList') return 'bullet'
  if (type === 'orderedList') return 'ordered'
  return ''
}

function calloutAlert(color: string): string {
  switch (color) {
    case 'green':
      return 'TIP'
    case 'purple':
      return 'IMPORTANT'
    case 'yellow':
      return 'WARNING'
    case 'red':
      return 'CAUTION'
    case 'gray':
      return 'REMARK'
    case 'agent':
      return 'AI'
  }
  return 'NOTE'
}

function quote(lines: string[], first: string): string[] {
  const out: string[] = []
  if (first) out.push('> ' + first)
  for (const l of lines) out.push(l === '' ? '>' : '> ' + l)
  return out.length ? out : ['>']
}

function isTightList(n: CNode): boolean {
  return (n.content || []).every((item) =>
    (item.content || []).every((c, j) =>
      j === 0 ? c.type === 'paragraph' : c.type === 'bulletList' || c.type === 'orderedList' || c.type === 'taskList',
    ),
  )
}

function longestRun(text: string, ch: string): number {
  let longest = 0
  let run = 0
  for (const c of text) {
    if (c === ch) {
      run++
      longest = Math.max(longest, run)
    } else run = 0
  }
  return longest
}

function fence(text: string, lang: string): string[] {
  const f = '`'.repeat(Math.max(3, longestRun(text, '`') + 1))
  const out = [f + cleanLanguage(lang)]
  if (text !== '') out.push(...text.split('\n'))
  out.push(f)
  return out
}

export const cleanLanguage = (lang: string) => lang.replace(/[^A-Za-z0-9_+#.-]/g, '')

/**
 * The table a code block holds when the codec kept it there: a Markdown code
 * block that is exactly one table, written as the codec writes tables. Any
 * other code block, a table someone wrote by hand among them, stays one.
 */
export function keptTableNode(n: CNode, readTable: (markdown: string) => CNode | null): CNode | null {
  const text = codeText(n)
  if (n.type !== 'codeBlock' || attrString(n, 'language') !== 'markdown' || !text.startsWith('|')) return null
  const table = readTable(text)
  const lines = table ? new Writer({}).table(table) : null
  return lines && lines.join('\n') === text ? table : null
}

const keptTable = (n: CNode, readTable: (markdown: string) => CNode | null): string[] | null =>
  keptTableNode(n, readTable) ? codeText(n).split('\n') : null

const codeText = (n: CNode) => (n.content || []).filter((c) => c.type === 'text').map((c) => c.text || '').join('')

const escapeCell = (s: string) => s.split('|').join('\\|')

export function entityHref(id: string): string {
  const i = id.indexOf(':')
  if (i < 0) return ''
  const typ = id.slice(0, i)
  const rest = id.slice(i + 1)
  if (!rest) return ''
  return ['doc', 'board', 'task', 'project', 'channel'].includes(typ) ? '/app/' + typ + '/' + rest : ''
}

function isAutolinkable(text: string, href: string): boolean {
  if (text !== href || href === '') return false
  const low = href.toLowerCase()
  if (!(low.startsWith('http://') || low.startsWith('https://') || low.startsWith('mailto:'))) return false
  for (let i = 0; i < href.length; i++) {
    const c = href.charCodeAt(i)
    if (c <= 0x20 || c === 0x7f || c === 0x3c || c === 0x3e) return false
  }
  return isSafeHref(href)
}

function codeSpan(text: string): string {
  const f = '`'.repeat(longestRun(text, '`') + 1)
  const pad =
    text.startsWith('`') || text.endsWith('`') || (text.startsWith(' ') && text.endsWith(' ') && text.replace(/^ +| +$/g, '') !== '')
  return pad ? f + ' ' + text + ' ' + f : f + text + f
}

/** A link's destination, in <> when it holds what a bare one cannot. */
export function linkDest(href: string): string {
  let needsAngle = false
  let depth = 0
  for (const ch of href) {
    const c = ch.codePointAt(0)!
    if (ch === ' ' || ch === '\t' || ch === '<' || ch === '>' || c < 0x20) needsAngle = true
    else if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth < 0) needsAngle = true
    }
  }
  if (depth !== 0) needsAngle = true
  if (href === '') return '<>'
  let esc = escapeEntityAmp(href.split('\\').join('\\\\'))
  if (needsAngle) {
    esc = esc.split('<').join('\\<').split('>').join('\\>').split('\n').join(' ')
    return '<' + esc + '>'
  }
  return esc
}

const ENTITY_LIKE = /^&(#[0-9]{1,7};|#[xX][0-9a-fA-F]{1,6};|[A-Za-z][A-Za-z0-9]{1,31};)/

function escapeEntityAmp(s: string): string {
  if (!s.includes('&')) return s
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '&' && ENTITY_LIKE.test(s.slice(i))) out += '\\'
    out += s[i]
  }
  return out
}

function escapeLinkText(s: string): string {
  return s.replace(/[\\[\]`*_~<]/g, (c) => '\\' + c)
}

const isAlnum = (c: number) => (c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a) || (c >= 0x30 && c <= 0x39)

/** Escapes text so Markdown reads it back as the same text. */
export function escapeMarkdownText(s: string, atLineStart: boolean): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    switch (c) {
      case '\\':
      case '`':
      case '*':
      case '~':
      case '[':
      case ']':
        out += '\\'
        break
      case '_':
        if (!(i > 0 && i + 1 < s.length && isAlnum(s.charCodeAt(i - 1)) && isAlnum(s.charCodeAt(i + 1)))) out += '\\'
        break
      case '<':
        if (i + 1 < s.length && /[a-zA-Z/!?]/.test(s[i + 1])) out += '\\'
        break
      case '&':
        if (ENTITY_LIKE.test(s.slice(i))) out += '\\'
        break
    }
    out += c
  }
  return atLineStart ? escapeLineStart(out) : out
}

function escapeLineStart(s: string): string {
  const t = s.replace(/^[ \t]+/, '')
  const lead = s.slice(0, s.length - t.length)
  if (t === '') return s
  if (/^(#{1,6})([ \t]|$)/.test(t)) return lead + '\\' + t
  if (t.startsWith('-') || t.startsWith('>')) return lead + '\\' + t
  if (t.startsWith('+ ') || t === '+' || t.startsWith('+\t')) return lead + '\\' + t
  if (/^=+[ \t]*$/.test(t)) return lead + '\\' + t
  const m = /^(\d{1,9})([.)])([ \t]|$)/.exec(t)
  if (m) return lead + m[1] + '\\' + t.slice(m[1].length)
  return s
}

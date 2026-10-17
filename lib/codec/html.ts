/**
 * HTML, both ways: the same bytes out, and the same doc in, as the API's
 * business/ContentCodec/html_out.go and html_in.go.
 *
 * Written as the editor's schema renders it (as the collaboration service
 * saves a body, without its XML namespace and with HTML void elements), so
 * the editor and the service read it back as the same doc. Read the way
 * ProseMirror's DOM parser reads it with the editor's parse rules: block
 * elements with no node are boundaries between paragraphs, inline ones pass
 * through, whitespace outside <pre> collapses, and scripts, styles, frames and
 * form controls go with everything inside them. Foreign HTML (an imported file,
 * another tool's clipboard) keeps no classes and no colour but ours by name
 * (data-color), and only safe links and images.
 */

import { CMark, CNode, attrBool, attrInt, attrString, firstNonEmpty, node, setAttr, trimSpace } from './doc'
import { escapeAttr, escapeText } from './htmlEscape'
import { CELL_COLOURS, NodeSpec, Schema, SHIPPED, specOf } from './schema'
import { isInlineNode, markEq, normalize } from './normalize'
import { isSafeHref } from '@/lib/utils/safeHref'
import { contentClasses } from '@/lib/contentClasses'
import { globalHTMLAttrs, globalsOn } from './globalAttrs'
import { colourName, highlightColour } from './docFormat'
import { IMAGE_MEDIA_ATTRS, readImageMedia, readLinkMention, readMediaBlock, writeLinkMention, writeMediaBlock } from './media'
import { readConnectedBlock, readDateMention, writeConnectedBlock, writeDateMention } from './connected' // C1

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export function toHTML(doc: CNode | undefined): string {
  if (!doc) return ''
  const out: string[] = []
  writeBlocks(out, doc.type === 'doc' ? doc.content || [] : [doc])
  return out.join('')
}

const attr = (name: string, value: string) => ' ' + name + '="' + escapeAttr(value) + '"'

/** A node's global attributes (an indent, a direction), after its own. */
const globals = (n: CNode) => globalHTMLAttrs(n.type, n.attrs, attr)

function writeBlocks(out: string[], nodes: CNode[]) {
  for (const n of nodes) writeNode(out, n)
}

function writeEmbed(out: string[], n: CNode, dataType: string, attrs: [string, string][]) {
  out.push('<div data-type="' + dataType + '"')
  for (const [a, key] of attrs) {
    const v = attrString(n, a)
    if (v) out.push(attr(key, v))
  }
  out.push(globals(n) + '></div>')
}

function writeNode(out: string[], n: CNode) {
  switch (n.type) {
    case 'paragraph':
      out.push('<p' + globals(n) + '>')
      writeInline(out, n.content || [])
      out.push('</p>')
      return
    case 'heading': {
      const tag = 'h' + Math.min(6, Math.max(1, attrInt(n, 'level', 1)))
      out.push('<' + tag + globals(n) + '>')
      writeInline(out, n.content || [])
      out.push('</' + tag + '>')
      return
    }
    case 'blockquote':
      out.push('<blockquote' + globals(n) + '>')
      writeBlocks(out, n.content || [])
      out.push('</blockquote>')
      return
    case 'bulletList':
      out.push('<ul' + globals(n) + '>')
      writeBlocks(out, n.content || [])
      out.push('</ul>')
      return
    case 'orderedList': {
      out.push('<ol')
      const start = attrInt(n, 'start', 1)
      if (start !== 1) out.push(attr('start', String(start)))
      const t = attrString(n, 'type')
      if (t) out.push(attr('type', t))
      out.push(globals(n) + '>')
      writeBlocks(out, n.content || [])
      out.push('</ol>')
      return
    }
    case 'listItem':
      out.push('<li' + globals(n) + '>')
      writeBlocks(out, n.content || [])
      out.push('</li>')
      return
    case 'taskList':
      out.push('<ul class="task-list" data-type="taskList"' + globals(n) + '>')
      writeBlocks(out, n.content || [])
      out.push('</ul>')
      return
    case 'taskItem': {
      const checked = attrBool(n, 'checked', false)
      out.push('<li class="task-item"' + attr('data-checked', checked ? 'true' : 'false') + ' data-type="taskItem"' + globals(n) + '><label><input type="checkbox"')
      if (checked) out.push(' checked="checked"')
      out.push('><span></span></label><div>')
      writeBlocks(out, n.content || [])
      out.push('</div></li>')
      return
    }
    case 'codeBlock': {
      out.push('<pre' + globals(n))
      if (attrBool(n, 'wrap', false)) out.push(attr('data-wrap', 'true'))
      const caption = attrString(n, 'caption')
      if (caption) out.push(attr('data-caption', caption))
      out.push('><code')
      const lang = attrString(n, 'language')
      if (lang) out.push(attr('class', 'language-' + lang))
      out.push('>')
      for (const c of n.content || []) if (c.type === 'text') out.push(escapeText(c.text || ''))
      out.push('</code></pre>')
      return
    }
    case 'horizontalRule':
      out.push('<hr' + globals(n) + '>')
      return
    case 'blockMath': {
      // The TeX as the element's text too, as the editor writes it.
      const latex = attrString(n, 'latex')
      out.push('<div data-type="block-math"' + (latex ? attr('data-latex', latex) : '') + '>' + escapeText(latex) + '</div>')
      return
    }
    case 'image':
      out.push('<img')
      for (const [a, key] of [
        ['src', 'src'],
        ['alt', 'alt'],
        ['title', 'title'],
        ['width', 'width'],
        ['height', 'height'],
        ['id', 'id'],
        ['caption', 'caption'],
        ['fileName', 'filename'],
        ...IMAGE_MEDIA_ATTRS,
      ]) {
        const v = attrString(n, a)
        if (v) out.push(attr(key, v))
      }
      out.push(globals(n) + '>')
      return
    case 'callout': {
      out.push('<div data-type="callout"')
      const emoji = attrString(n, 'emoji')
      if (emoji) out.push(attr('data-emoji', emoji))
      const color = attrString(n, 'color')
      if (color) out.push(attr('data-color', color))
      const icon = attrString(n, 'icon')
      if (icon) out.push(attr('data-icon', icon))
      out.push(globals(n) + '>')
      writeBlocks(out, n.content || [])
      out.push('</div>')
      return
    }
    case 'collapsible':
      // Its first line is its summary; open or closed is each reader's own (B2).
      out.push('<div data-type="collapsible"' + globals(n) + '>')
      writeBlocks(out, n.content || [])
      out.push('</div>')
      return
    case 'toc':
      out.push('<div data-type="toc"' + globals(n) + '></div>')
      return
    case 'tableEmbed':
      return writeEmbed(out, n, 'table-embed', [['tableId', 'data-table-id'], ['viewId', 'data-view-id']])
    case 'poll':
      return writeEmbed(out, n, 'poll', [['id', 'data-id']])
    case 'chartEmbed':
      return writeEmbed(out, n, 'chart', [['spec', 'data-spec']])
    case 'diffEmbed':
      return writeEmbed(out, n, 'diff', [['diff', 'data-diff']])
    case 'recordingEmbed':
      return writeEmbed(out, n, 'recording-embed', [
        ['egress', 'data-egress'],
        ['kind', 'data-kind'],
        ['sid', 'data-sid'],
        ['u1', 'data-u1'],
        ['u2', 'data-u2'],
      ])
    case 'table':
      out.push('<table><tbody>')
      writeBlocks(out, n.content || [])
      out.push('</tbody></table>')
      return
    case 'tableRow':
      out.push('<tr>')
      writeBlocks(out, n.content || [])
      out.push('</tr>')
      return
    case 'tableHeader':
    case 'tableCell': {
      const tag = n.type === 'tableHeader' ? 'th' : 'td'
      out.push('<' + tag)
      const c = attrInt(n, 'colspan', 1)
      if (c !== 1) out.push(attr('colspan', String(c)))
      const r = attrInt(n, 'rowspan', 1)
      if (r !== 1) out.push(attr('rowspan', String(r)))
      const widths = n.attrs?.colwidth
      if (Array.isArray(widths) && widths.length) out.push(attr('colwidth', widths.join(',')))
      const bg = attrString(n, 'background')
      if (bg) out.push(attr('data-background', bg))
      out.push('>')
      writeBlocks(out, n.content || [])
      out.push('</' + tag + '>')
      return
    }
    case 'columnList':
      out.push('<div data-type="column-list"' + globals(n) + '>')
      writeBlocks(out, n.content || [])
      out.push('</div>')
      return
    case 'column': {
      out.push('<div data-type="column"')
      const w = attrInt(n, 'width', 0)
      if (w > 0) out.push(attr('data-width', String(w)))
      out.push(globals(n) + '>')
      writeBlocks(out, n.content || [])
      out.push('</div>')
      return
    }
    case 'doc':
      writeBlocks(out, n.content || [])
      return
  }
  if (writeMediaBlock(out, n) || writeConnectedBlock(out, n)) return
  if (isInlineNode(n)) {
    out.push('<p>')
    writeInline(out, [n])
    out.push('</p>')
    return
  }
  writeBlocks(out, n.content || [])
}

/** Inline content, a mark kept open over neighbours that share it, as ProseMirror's serializer does. */
function writeInline(out: string[], nodes: CNode[]) {
  const active: CMark[] = []
  const closeTo = (keep: number) => {
    while (active.length > keep) out.push(markClose(active.pop()!))
  }
  for (const n of nodes) {
    if (!n) continue
    const marks = n.marks || []
    let keep = 0
    while (keep < active.length && keep < marks.length && markEq(active[keep], marks[keep])) keep++
    closeTo(keep)
    for (const m of marks.slice(keep)) {
      out.push(markOpen(m))
      active.push(m)
    }
    writeInlineNode(out, n)
  }
  closeTo(0)
}

function mentionAttrs(n: CNode): string {
  let s = ''
  const id = attrString(n, 'id')
  if (id) s += attr('data-id', id)
  const label = attrString(n, 'label')
  if (label) s += attr('data-label', label)
  return s + attr('data-mention-suggestion-char', attrString(n, 'mentionSuggestionChar') || '@')
}

function writeInlineNode(out: string[], n: CNode) {
  const label = firstNonEmpty(attrString(n, 'label'), attrString(n, 'id'))
  switch (n.type) {
    case 'text':
      out.push(escapeText(n.text || ''))
      return
    case 'hardBreak':
      out.push('<br>')
      return
    case 'mention':
      out.push('<span data-type="mention"' + mentionAttrs(n) + '>' + escapeText('@' + label) + '</span>')
      return
    case 'channelMention':
      out.push('<span data-type="channelMention" class="channel-mention"' + mentionAttrs(n) + '>' + escapeText('#' + label) + '</span>')
      return
    case 'entityMention':
      out.push('<span data-type="entityMention" class="entity-mention"' + mentionAttrs(n) + '>' + escapeText(label) + '</span>')
      return
    case 'inlineMath': {
      const latex = attrString(n, 'latex')
      out.push('<span data-type="inline-math"' + (latex ? attr('data-latex', latex) : '') + '>' + escapeText(latex) + '</span>')
      return
    }
    case 'linkMention':
      return writeLinkMention(out, n)
    case 'dateMention':
      return writeDateMention(out, n)
  }
  for (const c of n.content || []) writeInlineNode(out, c)
}

function markOpen(m: CMark): string {
  switch (m.type) {
    case 'bold':
      return '<strong>'
    case 'italic':
      return '<em>'
    case 'strike':
      return '<s>'
    case 'code':
      return '<code>'
    case 'underline':
      return '<u>'
    case 'link':
      return '<a' + ['target', 'rel', 'class', 'href'].map((a) => (attrString(m, a) ? attr(a, attrString(m, a)) : '')).join('') + '>'
    case 'textStyle': {
      // By name (B2, N15): the colour means the same in either theme and anywhere the doc goes.
      const c = colourName(attrString(m, 'color'))
      return c ? '<span' + attr('data-color', c) + '>' : '<span>'
    }
    case 'highlight':
      return '<mark' + attr('data-color', highlightColour(attrString(m, 'color'))) + '>'
  }
  return ''
}

function markClose(m: CMark): string {
  switch (m.type) {
    case 'bold':
      return '</strong>'
    case 'italic':
      return '</em>'
    case 'strike':
      return '</s>'
    case 'code':
      return '</code>'
    case 'underline':
      return '</u>'
    case 'link':
      return '</a>'
    case 'textStyle':
      return '</span>'
    case 'highlight':
      return '</mark>'
  }
  return ''
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

interface HTMLOptions {
  /** HTML from outside the editor, read as untrusted. */
  foreign?: boolean
  schema?: Schema
}

const BLOCK_TAGS = new Set(
  'address article aside blockquote canvas dd div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr li main nav noscript ol output p pre section table tfoot ul center summary details'.split(
    ' ',
  ),
)

const IGNORED_TAGS = new Set(
  'head script style title template noscript iframe frame frameset object embed applet svg math canvas audio video source track select option optgroup textarea button input meta link base colgroup col map area picture dialog slot'.split(
    ' ',
  ),
)

const LANGUAGE_CLASS = /^language-[a-z0-9+#._-]{1,32}$/i
const BOLD_WEIGHT = /^(bold(er)?|[5-9]\d{2,})$/

interface PNode {
  node: CNode
  spec: NodeSpec | undefined
  preserve?: boolean
  implicit?: boolean
  /** A column opened for blocks loose in a row. */
  loose?: boolean
}

/** Reads HTML as a doc, in canonical form. */
export function fromHTML(src: string, opts: HTMLOptions = {}): CNode {
  // Parsed as a fragment of <body>, as the Go codec parses it: a document
  // parse sends what comes before the body (a stray </p>) elsewhere. A
  // document made this way runs no script and loads nothing.
  const body = document.implementation.createHTMLDocument('').body
  body.innerHTML = src
  const p = new Parser(!!opts.foreign)
  for (const child of Array.from(body.childNodes)) p.add(child)
  while (p.stack.length > 1) p.pop()
  return normalize(p.stack[0].node, opts.schema || SHIPPED)
}

/** Whether an image source may stay in a doc: a web address, a path, or (until the asset pass uploads it) a data: image. */
export function safeImageSrc(src: string, allowData: boolean): boolean {
  const s = trimSpace(src)
  if (!s) return false
  const low = s.toLowerCase()
  if (low.startsWith('data:')) return allowData && low.startsWith('data:image/') && !low.startsWith('data:image/svg')
  if (low.startsWith('blob:')) return false
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(s.replace(/[\x00-\x20\x7f-\xa0\xad]/g, ''))
  if (!m) return true
  const scheme = m[1].toLowerCase()
  return scheme === 'http' || scheme === 'https'
}

function styleOf(el: Element): Record<string, string> | null {
  const raw = el.getAttribute('style')
  if (raw === null) return null
  const out: Record<string, string> = {}
  for (const decl of raw.split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const k = decl.slice(0, i).trim().toLowerCase()
    let v = decl.slice(i + 1).trim()
    if (v.endsWith('!important')) v = v.slice(0, -'!important'.length)
    if (v.endsWith(' ')) v = v.slice(0, -1)
    out[k] = v.trim()
  }
  return out
}

const collapseSpace = (s: string) => s.replace(/[ \t\n\r\f]+/g, ' ')

function textContent(el: Element): string {
  let s = ''
  for (const c of Array.from(el.childNodes)) {
    if (c.nodeType === 3) s += c.nodeValue || ''
    else if (c.nodeType === 1 && !IGNORED_TAGS.has((c as Element).tagName.toLowerCase())) s += textContent(c as Element)
  }
  return s
}

function findFirst(el: Element, tag: string): Element | null {
  for (const c of Array.from(el.children)) {
    if (c.tagName.toLowerCase() === tag) return c
    const f = findFirst(c, tag)
    if (f) return f
  }
  return null
}

const findChild = (el: Element, tag: string) => Array.from(el.children).find((c) => c.tagName.toLowerCase() === tag) || null

function leadingCheckbox(el: Element): Element | null {
  for (const c of Array.from(el.childNodes)) {
    if (c.nodeType === 3) {
      if (trimSpace(c.nodeValue || '') !== '') return null
      continue
    }
    if (c.nodeType !== 1) continue
    const e = c as Element
    const tag = e.tagName.toLowerCase()
    if (tag === 'input') return (e.getAttribute('type') || '').toLowerCase() === 'checkbox' ? e : null
    if (tag === 'p' || tag === 'label' || tag === 'span') return leadingCheckbox(e)
    return null
  }
  return null
}

function codeLanguage(pre: Element): string {
  const pick = (cls: string | null) => {
    for (const c of (cls || '').split(/\s+/)) {
      if (c.startsWith('language-') && LANGUAGE_CLASS.test(c)) return c.slice('language-'.length)
    }
    return ''
  }
  const dl = pre.getAttribute('data-language')
  if (dl && LANGUAGE_CLASS.test('language-' + dl)) return dl
  const own = pick(pre.getAttribute('class'))
  if (own) return own
  const code = Array.from(pre.children).find((c) => c.tagName.toLowerCase() === 'code')
  return code ? pick(code.getAttribute('class')) : ''
}

function preText(el: Element): string {
  let s = ''
  for (const c of Array.from(el.childNodes)) {
    if (c.nodeType === 3) s += c.nodeValue || ''
    else if (c.nodeType === 1) {
      const tag = (c as Element).tagName.toLowerCase()
      if (tag === 'br') s += '\n'
      else if (!IGNORED_TAGS.has(tag)) s += preText(c as Element)
    }
  }
  return s
}

class Parser {
  stack: PNode[] = [{ node: node('doc'), spec: specOf('doc') }]
  marks: CMark[] = []

  constructor(private foreign: boolean) {}

  top() {
    return this.stack[this.stack.length - 1]
  }

  pop() {
    const t = this.stack.pop()!
    if (t.spec?.content === 'inline' && !t.preserve) stripTrailingSpace(t.node)
    const parent = this.top()
    parent.node.content = [...(parent.node.content || []), t.node]
  }

  inInline() {
    const c = this.top().spec?.content
    return c === 'inline' || c === 'text'
  }

  closeInline() {
    while (this.stack.length > 1 && this.inInline()) this.pop()
  }

  push(n: CNode, preserve = false) {
    const pn: PNode = { node: n, spec: specOf(n.type), preserve }
    this.stack.push(pn)
    return pn
  }

  ensureInline() {
    if (this.inInline()) return
    const t = this.top()
    if (t.spec?.content === 'listItems' || t.spec?.content === 'taskItems') this.push(node(t.spec.content === 'taskItems' ? 'taskItem' : 'listItem'))
    if (this.top().spec?.content === 'rows') this.push(node('tableRow'))
    if (this.top().spec?.content === 'cells') this.push(node('tableCell'))
    if (this.top().spec?.content === 'columns') this.push(node('column')).loose = true
    this.stack.push({ node: node('paragraph'), spec: specOf('paragraph'), implicit: true })
  }

  openBlock(n: CNode, preserve = false) {
    this.closeInline()
    // A column after blocks loose in its row: theirs closes, and it stands beside it.
    if (n.type === 'column') while (this.stack.length > 1 && this.top().loose) this.pop()
    const t = this.top()
    const c = t.spec?.content
    if ((c === 'listItems' || c === 'taskItems') && n.type !== 'listItem' && n.type !== 'taskItem') {
      this.push(node(c === 'taskItems' ? 'taskItem' : 'listItem'))
    } else if (c === 'rows' && n.type !== 'tableRow') {
      this.push(node('tableRow'))
    } else if (c === 'columns' && n.type !== 'column') {
      this.push(node('column')).loose = true
    }
    if (this.top().spec?.content === 'cells' && n.type !== 'tableCell' && n.type !== 'tableHeader') this.push(node('tableCell'))
    const body = this.top()
    if (body.spec?.content === 'itemBody' && !(body.node.content || []).length && n.type !== 'paragraph') {
      body.node.content = [node('paragraph')]
    }
    this.push(n, preserve)
  }

  closeTo(pn: PNode) {
    while (this.stack.length > 1) {
      const t = this.top()
      this.pop()
      if (t === pn) return
    }
  }

  closeImplicit() {
    while (this.stack.length > 1 && this.top().implicit) this.pop()
  }

  inLink() {
    return this.marks.some((m) => m.type === 'link')
  }

  currentMarks(): CMark[] | undefined {
    return this.marks.length ? [...this.marks] : undefined
  }

  add(dom: Node) {
    if (dom.nodeType === 3) {
      this.addText(dom.nodeValue || '')
      return
    }
    if (dom.nodeType !== 1) return
    const el = dom as Element
    const tag = el.tagName.toLowerCase()
    if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml' || IGNORED_TAGS.has(tag)) return
    const style = styleOf(el) || {}
    if (tag === 'a' && el.getAttribute('data-type') === 'link-mention') {
      const m = readLinkMention(el, this.foreign)
      if (m) return this.addInline(m)
    }

    let pushed = 0
    const pushMark = (m: CMark) => {
      this.marks.push(m)
      pushed++
    }
    let clearBold = false
    switch (tag) {
      case 'strong':
        pushMark({ type: 'bold' })
        break
      case 'b':
        if (style['font-weight'] !== 'normal' && style['font-weight'] !== '400') pushMark({ type: 'bold' })
        break
      case 'em':
        pushMark({ type: 'italic' })
        break
      case 'i':
        if (style['font-style'] !== 'normal') pushMark({ type: 'italic' })
        break
      case 's':
      case 'del':
      case 'strike':
        pushMark({ type: 'strike' })
        break
      case 'u':
        pushMark({ type: 'underline' })
        break
      case 'code':
      case 'kbd':
      case 'samp':
      case 'tt':
        pushMark({ type: 'code' })
        break
      case 'mark':
        // A highlight by colour name, yellow when it names none of ours (B2).
        pushMark({ type: 'highlight', attrs: { color: highlightColour(el.getAttribute('data-color')) } })
        break
      case 'a': {
        const href = el.getAttribute('href')
        if (href !== null && isSafeHref(href)) {
          const m: CMark = { type: 'link', attrs: { href } }
          if (!this.foreign) {
            for (const a of ['target', 'rel']) {
              const v = el.getAttribute(a)
              if (v !== null) m.attrs![a] = v
            }
            const c = contentClasses(el.getAttribute('class') || '')
            if (c) m.attrs!.class = c
          }
          pushMark(m)
        }
        break
      }
    }
    if (tag !== 'b' && tag !== 'strong' && 'font-weight' in style) {
      const fw = style['font-weight']
      if (BOLD_WEIGHT.test(fw)) pushMark({ type: 'bold' })
      else if (fw === '400' || fw === 'normal') clearBold = true
    }
    if (style['font-style'] === 'italic' && tag !== 'em' && tag !== 'i') pushMark({ type: 'italic' })
    const deco = (style['text-decoration'] || '') + ' ' + (style['text-decoration-line'] || '')
    if (deco.includes('line-through') && tag !== 's' && tag !== 'del' && tag !== 'strike') pushMark({ type: 'strike' })
    if (deco.includes('underline') && tag !== 'u' && !(this.foreign && (tag === 'a' || this.inLink()))) pushMark({ type: 'underline' })
    // A text colour is one of ours by name (B2, N15): data-color, or an old
    // doc's style="color: var(--camp-sky-ink)". Any other is none.
    if (tag === 'span') {
      let c = colourName(el.getAttribute('data-color'))
      if (!c && !this.foreign) c = colourName(style.color)
      if (c) pushMark({ type: 'textStyle', attrs: { color: c } })
    }
    let saved: CMark[] | null = null
    if (clearBold) {
      saved = this.marks
      this.marks = this.marks.filter((m) => m.type !== 'bold')
    }
    try {
      if (this.addNode(el, tag)) return
      if (BLOCK_TAGS.has(tag)) {
        this.closeImplicit()
        this.addChildren(el)
        this.closeImplicit()
        return
      }
      this.addChildren(el)
    } finally {
      if (saved) this.marks = saved
      this.marks = this.marks.slice(0, this.marks.length - pushed)
    }
  }

  addChildren(el: Element) {
    for (const c of Array.from(el.childNodes)) this.add(c)
  }

  addText(text: string) {
    let value = collapseSpace(text)
    if (!this.inInline()) {
      if (value.replace(/ /g, '') === '') return
      this.ensureInline()
    }
    const t = this.top()
    if (value.startsWith(' ')) {
      const content = t.node.content || []
      const before = content[content.length - 1]
      if (!before || before.type === 'hardBreak' || (before.type === 'text' && (before.text || '').endsWith(' '))) value = value.slice(1)
    }
    if (value === '') return
    const n: CNode = { type: 'text', text: value }
    const marks = this.currentMarks()
    if (marks) n.marks = marks
    t.node.content = [...(t.node.content || []), n]
  }

  addInline(n: CNode) {
    this.ensureInline()
    const t = this.top()
    if (t.node.type === 'codeBlock') {
      if (n.type === 'hardBreak') t.node.content = [...(t.node.content || []), { type: 'text', text: '\n' }]
      return
    }
    const marks = this.currentMarks()
    if (marks) n.marks = marks
    t.node.content = [...(t.node.content || []), n]
  }

  /** The element's global attributes (an indent, a direction) onto its node. */
  globals(n: CNode, el: Element): CNode {
    for (const g of globalsOn(n.type)) {
      const raw = el.getAttribute(g.html)
      if (raw === null) continue
      const v = g.read(raw, this.foreign)
      if (v !== null && v !== undefined && v !== '' && v !== g.def) setAttr(n, g.name, v)
    }
    return n
  }

  block(el: Element, n: CNode) {
    this.globals(n, el)
    this.closeInline()
    this.openBlock(n)
    const pn = this.top()
    this.addChildren(el)
    this.closeTo(pn)
  }

  /**
   * A toggle's <summary> as its first line: a heading when it holds one (a
   * toggle heading), else a paragraph, then anything else it held. No summary
   * is an empty first line.
   */
  summary(s: Element | null): CNode[] {
    if (!s) return [node('paragraph')]
    const sub = new Parser(this.foreign)
    sub.marks = [...this.marks]
    sub.addChildren(s)
    while (sub.stack.length > 1) sub.pop()
    const out = sub.stack[0].node.content || []
    if (!out.length || (out[0].type !== 'paragraph' && out[0].type !== 'heading')) out.unshift(node('paragraph'))
    return out
  }

  atom(n: CNode) {
    this.closeInline()
    this.openBlock(n)
    this.closeTo(this.top())
  }

  image(el: Element, caption: string) {
    const src = trimSpace(el.getAttribute('src') || '')
    if (!safeImageSrc(src, true)) {
      const alt = trimSpace(el.getAttribute('alt') || '')
      if (alt) {
        this.ensureInline()
        const n: CNode = { type: 'text', text: alt }
        const marks = this.currentMarks()
        if (marks) n.marks = marks
        this.top().node.content = [...(this.top().node.content || []), n]
      }
      return
    }
    const img = node('image', { attrs: { src } })
    for (const a of ['alt', 'title']) {
      const v = el.getAttribute(a)
      if (v !== null) img.attrs![a] = v
    }
    for (const a of ['width', 'height']) {
      const v = el.getAttribute(a)
      if (v) img.attrs![a] = v
    }
    if (!this.foreign) {
      for (const [a, key] of [
        ['id', 'id'],
        ['caption', 'caption'],
        ['fileName', 'filename'],
      ]) {
        const v = el.getAttribute(key)
        if (v) img.attrs![a] = v
      }
      readImageMedia(el, img)
    }
    if (caption) img.attrs!.caption = caption
    this.atom(this.globals(img, el))
  }

  isTaskList(el: Element): boolean {
    const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li')
    return items.length > 0 && items.every((c) => c.getAttribute('data-type') === 'taskItem' || leadingCheckbox(c) !== null)
  }

  embed(type: string, el: Element, attrs: [string, string][]) {
    const e = node(type)
    for (const [a, key] of attrs) {
      const v = el.getAttribute(key)
      if (v) setAttr(e, a, v)
    }
    this.atom(this.globals(e, el))
  }

  addNode(el: Element, tag: string): boolean {
    const dataType = el.getAttribute('data-type') || ''
    switch (tag) {
      case 'p':
        this.block(el, node('paragraph'))
        return true
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        this.block(el, node('heading', { attrs: { level: Number(tag[1]) } }))
        return true
      case 'blockquote':
        this.block(el, node('blockquote'))
        return true
      case 'ul':
        this.block(el, node(dataType === 'taskList' || this.isTaskList(el) ? 'taskList' : 'bulletList'))
        return true
      case 'ol': {
        let ol = node('orderedList', { attrs: {} })
        const s = el.getAttribute('start')
        if (s !== null && /^\s*[+-]?\d+\s*$/.test(s)) ol.attrs!.start = parseInt(s, 10)
        const t = el.getAttribute('type')
        if (t) ol.attrs!.type = t
        if (this.isTaskList(el)) ol = node('taskList')
        this.block(el, ol)
        return true
      }
      case 'li': {
        if (this.top().spec?.content === 'taskItems') {
          let checked = el.getAttribute('data-checked') === 'true'
          if (!checked) {
            const box = leadingCheckbox(el)
            if (box) checked = box.hasAttribute('checked')
          }
          this.block(el, node('taskItem', { attrs: { checked } }))
        } else this.block(el, node('listItem'))
        return true
      }
      case 'pre': {
        const cb = node('codeBlock', { attrs: {} })
        const lang = codeLanguage(el)
        if (lang) cb.attrs!.language = lang
        if (el.getAttribute('data-wrap') === 'true') cb.attrs!.wrap = true
        const caption = el.getAttribute('data-caption')
        if (caption) cb.attrs!.caption = caption
        this.globals(cb, el)
        this.closeInline()
        this.openBlock(cb, true)
        const pn = this.top()
        const text = preText(el)
        if (text) cb.content = [{ type: 'text', text }]
        this.closeTo(pn)
        return true
      }
      case 'hr':
        this.atom(this.globals(node('horizontalRule'), el))
        return true
      case 'br':
        this.addInline(node('hardBreak'))
        return true
      case 'img':
        this.image(el, '')
        return true
      case 'figure': {
        const img = findFirst(el, 'img')
        if (!img) return false
        const fc = findFirst(el, 'figcaption')
        this.image(img, fc ? trimSpace(collapseSpace(textContent(fc))) : '')
        return true
      }
      case 'details': {
        // A toggle: its <summary> is its first line, and open or closed is
        // each reader's own (B2).
        const c = this.globals(node('collapsible'), el)
        this.closeInline()
        this.openBlock(c)
        const pn = this.top()
        pn.node.content = [...(pn.node.content || []), ...this.summary(findChild(el, 'summary'))]
        for (const k of Array.from(el.childNodes)) {
          if (k.nodeType === 1 && (k as Element).tagName.toLowerCase() === 'summary') continue
          this.add(k)
        }
        this.closeTo(pn)
        return true
      }
      case 'aside':
        this.block(el, node('callout'))
        return true
      case 'table':
        this.block(el, node('table'))
        return true
      case 'tr':
        this.block(el, node('tableRow'))
        return true
      case 'th':
      case 'td': {
        const cell = node(tag === 'th' ? 'tableHeader' : 'tableCell', { attrs: {} })
        for (const a of ['colspan', 'rowspan']) {
          const v = el.getAttribute(a)
          if (v !== null && /^\s*[+-]?\d+\s*$/.test(v) && parseInt(v, 10) > 1) cell.attrs![a] = parseInt(v, 10)
        }
        const widths = el.getAttribute('colwidth')
        if (widths !== null && /^\d{1,5}(,\d{1,5})*$/.test(widths.trim())) cell.attrs!.colwidth = widths.trim().split(',').map(Number)
        const bg = el.getAttribute('data-background')
        if (!this.foreign && bg !== null && CELL_COLOURS.has(bg)) cell.attrs!.background = bg
        this.block(el, cell)
        return true
      }
      case 'thead':
      case 'tbody':
      case 'tfoot':
        this.addChildren(el)
        return true
      case 'nav':
        if (dataType !== 'toc') return false
        this.atom(this.globals(node('toc'), el))
        return true
      case 'time':
        if (dataType !== 'date-mention') return false
        this.addInline(readDateMention(el))
        return true
      case 'span':
        if (dataType === 'inline-math') {
          this.addInline(node('inlineMath', { attrs: { latex: mathSource(el) } }))
          return true
        }
        if (dataType === 'mention' || dataType === 'channelMention' || dataType === 'entityMention') {
          const m = node(dataType, { attrs: {} })
          const id = el.getAttribute('data-id')
          if (id !== null) m.attrs!.id = id
          const label = el.getAttribute('data-label')
          if (label !== null) m.attrs!.label = label
          const ch = el.getAttribute('data-mention-suggestion-char')
          if (ch) m.attrs!.mentionSuggestionChar = ch
          this.addInline(m)
          return true
        }
        return false
      case 'div':
        switch (dataType) {
          case 'callout': {
            const c = node('callout', { attrs: {} })
            const emoji = el.getAttribute('data-emoji')
            if (emoji) c.attrs!.emoji = emoji
            const color = el.getAttribute('data-color')
            if (color) c.attrs!.color = color
            const icon = el.getAttribute('data-icon')
            if (icon) c.attrs!.icon = icon
            this.block(el, c)
            return true
          }
          case 'collapsible': {
            const c = node('collapsible')
            // An old toggle's title (data-title, with its data-open): the
            // normaliser makes it the first line.
            const title = el.getAttribute('data-title')
            if (title !== null || el.hasAttribute('data-open')) c.attrs = { title: title ?? '' }
            this.block(el, c)
            return true
          }
          case 'toc':
            this.atom(this.globals(node('toc'), el))
            return true
          case 'table-embed':
            this.embed('tableEmbed', el, [['tableId', 'data-table-id'], ['viewId', 'data-view-id']])
            return true
          case 'block-math':
            this.atom(node('blockMath', { attrs: { latex: mathSource(el) } }))
            return true
          case 'poll':
            this.embed('poll', el, [['id', 'data-id']])
            return true
          case 'chart':
            this.embed('chartEmbed', el, [['spec', 'data-spec']])
            return true
          case 'diff':
            this.embed('diffEmbed', el, [['diff', 'data-diff']])
            return true
          case 'recording-embed':
            this.embed('recordingEmbed', el, [
              ['egress', 'data-egress'],
              ['kind', 'data-kind'],
              ['sid', 'data-sid'],
              ['u1', 'data-u1'],
              ['u2', 'data-u2'],
            ])
            return true
          case 'column-list':
            this.block(el, node('columnList'))
            return true
          case 'column': {
            const c = node('column')
            const w = el.getAttribute('data-width')
            if (w !== null && /^\s*\d+\s*$/.test(w) && parseInt(w, 10) >= 1 && parseInt(w, 10) <= 99) c.attrs = { width: parseInt(w, 10) }
            // A column outside a row is its blocks (normalize lifts them out).
            this.block(el, c)
            return true
          }
        }
        {
          const m = readConnectedBlock(dataType, el) || readMediaBlock(dataType, el, this.foreign)
          if (m) {
            this.atom(m)
            return true
          }
        }
        return false
    }
    return false
  }
}

/** An equation's TeX: its data-latex, or (written by hand) its text. */
function mathSource(el: Element): string {
  const latex = el.getAttribute('data-latex')
  return latex !== null ? latex : trimSpace(textContent(el))
}

function stripTrailingSpace(n: CNode) {
  const content = n.content || []
  const last = content[content.length - 1]
  if (!last || last.type !== 'text') return
  const trimmed = (last.text || '').replace(/[ \t\r\n\f]+$/, '')
  if (trimmed === '') n.content = content.slice(0, -1)
  else last.text = trimmed
}

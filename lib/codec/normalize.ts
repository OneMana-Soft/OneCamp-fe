/**
 * A doc in the codec's canonical form, valid for a schema: the same rules, in
 * the same order, as the API's business/ContentCodec/normalize.go.
 *
 * - every node holds what its type may hold (a list holds items, an item starts
 *   with a paragraph, a paragraph holds no blocks, a code block holds unmarked
 *   text, a container is never empty);
 * - a node or mark the schema lacks is kept as well as it can be (a table as its
 *   Markdown in a code block, a mention as its text, anything else by its content);
 * - attributes are the type's own, defaults filled in, null and empty ones left out;
 * - marks are in the schema's order, once each, and code excludes the rest;
 * - neighbouring text with the same marks is one text node.
 */

import { CMark, CNode, attrString, node, plainText, stringOf } from './doc'
import { AttrSpec, CELL_COLOURS, MARK_SPECS, NodeSpec, Schema, SHIPPED, EVERYTHING, specOf } from './schema'
import { markdownBlockLines } from './markdown'
import { globalsOn } from './globalAttrs'
import { calloutIcon, colourName, highlightColour } from './docFormat'
import { typedMediaAttr } from './media'
import { typedConnectedAttr } from './connected' // C1

/**
 * keep names node types the codec has no rule of its own for, but a block's
 * spec does (BlockSpec.codec): they pass through as they are.
 */
export function normalize(doc: CNode | undefined | null, schema: Schema = SHIPPED, keep: ReadonlySet<string> = NONE): CNode {
  const n = new Normalizer(schema, keep)
  const root = doc || node('doc')
  const content = root.type === 'doc' ? n.blocks(root.content || []) : n.blocks([root])
  return node('doc', { content: content.length ? content : [node('paragraph')] })
}

export const isInlineNode = (c: CNode) => c.type === 'text' || !!specOf(c.type)?.inline

export function sameMarks(a: CMark[] | undefined, b: CMark[] | undefined): boolean {
  const x = a || []
  const y = b || []
  if (x.length !== y.length) return false
  return x.every((m, i) => markEq(m, y[i]))
}

export function markEq(a: CMark, b: CMark): boolean {
  if (a.type !== b.type) return false
  const ka = Object.keys(a.attrs || {})
  const kb = Object.keys(b.attrs || {})
  if (ka.length !== kb.length) return false
  return ka.every((k) => stringOf(a.attrs?.[k]) === stringOf(b.attrs?.[k]))
}

const NONE: ReadonlySet<string> = new Set()

class Normalizer {
  constructor(
    private schema: Schema,
    private keep: ReadonlySet<string>,
  ) {}

  has(type: string) {
    return this.schema.nodes.has(type)
  }

  blocks(input: CNode[]): CNode[] {
    const out: CNode[] = []
    let inline: CNode[] = []
    const flush = () => {
      if (!inline.length) return
      const content = this.inline(inline)
      inline = []
      if (content.length) out.push(node('paragraph', { content }))
    }
    for (const c of input) {
      if (!c) continue
      if (isInlineNode(c)) {
        inline.push(c)
        continue
      }
      flush()
      out.push(...this.block(c))
    }
    flush()
    return out
  }

  block(c: CNode, inColumns = false): CNode[] {
    const spec = specOf(c.type)
    if (!spec) return this.keep.has(c.type) ? [c] : this.blocks(c.content || [])
    if (!this.has(c.type)) return this.degrade(c)
    switch (c.type) {
      case 'doc':
        return this.blocks(c.content || [])
      case 'column':
        // A column outside a row of columns is its blocks.
        if (!inColumns) return this.blocks(c.content || [])
        break
      case 'listItem':
      case 'taskItem':
        return this.block(node(c.type === 'taskItem' ? 'taskList' : 'bulletList', { content: [c] }))
      case 'tableRow':
      case 'tableCell':
      case 'tableHeader':
        return this.blocks(c.content || [])
      case 'collapsible':
        // An old toggle kept its title in an attribute, beside a shared open:
        // the title becomes the toggle's first line, its summary (B2,
        // docFormat.ts).
        if (c.attrs && ('title' in c.attrs || 'open' in c.attrs)) {
          const title = typeof c.attrs.title === 'string' ? c.attrs.title : ''
          c = { ...c, content: [node('paragraph', title ? { content: [{ type: 'text', text: title }] } : {}), ...(c.content || [])] }
        }
    }
    const attrs = this.attrs(spec, c.attrs)
    const out = node(c.type, attrs ? { attrs } : {})
    switch (spec.content) {
      case 'nothing':
        return [out]
      case 'inline': {
        const res: CNode[] = []
        let run: CNode[] = []
        const emit = () => {
          const content = this.inline(run)
          run = []
          res.push(node(c.type, { ...(attrs ? { attrs } : {}), ...(content.length ? { content } : {}) }))
        }
        for (const k of c.content || []) {
          if (!k) continue
          if (isInlineNode(k) || (!specOf(k.type) && !(k.content || []).length && !!k.text)) {
            run.push(k)
            continue
          }
          if (run.length) emit()
          res.push(...this.block(k))
        }
        if (run.length || !res.length) emit()
        return res
      }
      case 'text': {
        const content = this.codeText(c.content || [])
        return [content.length ? { ...out, content } : out]
      }
      case 'blocks': {
        const content = this.blocks(c.content || [])
        return [{ ...out, content: content.length ? content : [node('paragraph')] }]
      }
      case 'summaryBody': {
        const content = this.blocks(c.content || [])
        if (!content.length || (content[0].type !== 'paragraph' && content[0].type !== 'heading')) content.unshift(node('paragraph'))
        return [{ ...out, content }]
      }
      case 'listItems':
      case 'taskItems': {
        const content = this.items(c.content || [], spec.content === 'taskItems' ? 'taskItem' : 'listItem')
        return content.length ? [{ ...out, content }] : []
      }
      case 'rows': {
        const rows: CNode[] = []
        for (const r of c.content || []) {
          if (!r) continue
          const cells = r.type === 'tableRow' ? r.content || [] : [r]
          const row: CNode[] = []
          for (let cell of cells) {
            if (!cell) continue
            let typ = cell.type
            if (typ !== 'tableCell' && typ !== 'tableHeader') {
              cell = node('tableCell', { content: [cell] })
              typ = 'tableCell'
            }
            const ca = this.attrs(specOf(typ)!, cell.attrs)
            const content = this.blocks(cell.content || [])
            row.push(node(typ, { ...(ca ? { attrs: ca } : {}), content: content.length ? content : [node('paragraph')] }))
          }
          if (row.length) rows.push(node('tableRow', { content: row }))
        }
        return rows.length ? [{ ...out, content: rows }] : []
      }
      case 'columns': {
        const content = this.columns(c.content || [])
        return content.length ? [{ ...out, content }] : []
      }
    }
    return [out]
  }

  /** A row's columns: blocks found loose in a row make a column of their own. */
  columns(input: CNode[]): CNode[] {
    const out: CNode[] = []
    let loose: CNode[] = []
    const flush = () => {
      if (loose.length) out.push(...this.block(node('column', { content: loose }), true))
      loose = []
    }
    for (const c of input) {
      if (!c) continue
      if (c.type === 'column') {
        flush()
        out.push(...this.block(c, true))
        continue
      }
      loose.push(c)
    }
    flush()
    return out
  }

  items(input: CNode[], item: 'listItem' | 'taskItem'): CNode[] {
    const out: CNode[] = []
    const loose: CNode[] = []
    const make = (attrs: Record<string, unknown> | undefined, body: CNode[]) => {
      const it = node(item)
      // Its own attributes (a task's check) and any another package puts on it (a colour).
      const a = this.attrs(specOf(item)!, attrs)
      if (a) it.attrs = a
      it.content = this.itemBody(body)
      return it
    }
    for (const c of input) {
      if (!c) continue
      if (c.type === 'listItem' || c.type === 'taskItem') {
        out.push(make(c.attrs, c.content || []))
        continue
      }
      if (!out.length) {
        loose.push(c)
        continue
      }
      const last = out[out.length - 1]
      last.content = this.itemBody([...(last.content || []), c])
    }
    if (loose.length) out.unshift(make(undefined, loose))
    return out
  }

  itemBody(input: CNode[]): CNode[] {
    const body = this.blocks(input)
    if (!body.length || body[0].type !== 'paragraph') body.unshift(node('paragraph'))
    return body
  }

  codeText(input: CNode[]): CNode[] {
    let text = ''
    const walk = (ns: CNode[]) => {
      for (const c of ns) {
        if (!c) continue
        if (c.type === 'text') text += c.text || ''
        else if (c.type === 'hardBreak') text += '\n'
        else if (isInlineNode(c)) text += plainText(c)
        else {
          if (text.length) text += '\n'
          walk(c.content || [])
        }
      }
    }
    walk(input)
    return text ? [{ type: 'text', text }] : []
  }

  inline(input: CNode[]): CNode[] {
    const out: CNode[] = []
    for (const c of input) {
      if (!c) continue
      let k: CNode
      if (c.type === 'text') {
        if (!c.text) continue
        k = this.withMarks({ type: 'text', text: c.text }, c.marks)
      } else if (specOf(c.type)?.inline) {
        if (!this.has(c.type)) {
          const t = plainText(c)
          if (!t) continue
          k = this.withMarks({ type: 'text', text: t }, c.marks)
        } else {
          const attrs = this.attrs(specOf(c.type)!, c.attrs)
          k = this.withMarks({ type: c.type, ...(attrs ? { attrs } : {}) }, c.marks)
        }
      } else {
        const t = plainText(c)
        if (!t) continue
        k = { type: 'text', text: t }
      }
      const prev = out[out.length - 1]
      if (k.type === 'text' && prev && prev.type === 'text' && sameMarks(prev.marks, k.marks)) {
        prev.text = (prev.text || '') + k.text
        continue
      }
      out.push(k)
    }
    return out
  }

  withMarks(n: CNode, marks: CMark[] | undefined): CNode {
    const m = this.marks(marks)
    if (m) n.marks = m
    return n
  }

  marks(input: CMark[] | undefined): CMark[] | undefined {
    const byType = new Map<string, CMark>()
    for (const m of input || []) {
      if (!m) continue
      const spec = MARK_SPECS[m.type]
      if (!spec || !this.schema.marks.has(m.type)) continue
      const attrs = this.attrs(undefined, m.attrs, spec.attrs || [])
      const nm: CMark = attrs ? { type: m.type, attrs } : { type: m.type }
      if (m.type === 'link' && !attrString(nm, 'href')) continue
      // Colours are names (B2, N15): a text colour that isn't one of ours
      // goes, and a highlight is yellow unless it names another.
      if (m.type === 'textStyle' && nm.attrs) {
        const c = colourName(nm.attrs.color)
        if (c) nm.attrs.color = c
        else delete nm.attrs.color
      } else if (m.type === 'highlight') nm.attrs = { color: highlightColour(nm.attrs?.color) }
      if (m.type === 'textStyle' && !Object.keys(nm.attrs || {}).length) continue
      byType.set(m.type, nm)
    }
    const code = byType.get('code')
    if (code) return [code]
    const out = [...byType.values()].sort((a, b) => MARK_SPECS[a.type].rank - MARK_SPECS[b.type].rank)
    return out.length ? out : undefined
  }

  attrs(spec: NodeSpec | undefined, input: Record<string, unknown> | undefined, markAttrs: AttrSpec[] = []) {
    const specs = spec ? spec.attrs || [] : markAttrs
    const globals = spec ? globalsOn(spec.name) : []
    if (!specs.length && !globals.length) return undefined
    const out: Record<string, unknown> = {}
    for (const a of specs) {
      let v = input?.[a.name]
      if (v === undefined || v === null) v = a.def
      v = typedAttr(spec?.name || '', a.name, v)
      if (v === null || v === undefined || v === '') continue
      out[a.name] = v
    }
    // Another package's attributes on this block (an indent, a direction), left out at their default.
    for (const g of globals) {
      const v = g.typed(input?.[g.name])
      if (v === null || v === undefined || v === '' || v === g.def) continue
      out[g.name] = v
    }
    return Object.keys(out).length ? out : undefined
  }

  /** A block the schema has no node for, kept as well as it can be. */
  degrade(c: CNode): CNode[] {
    switch (c.type) {
      case 'table': {
        const table = normalize(node('doc', { content: [c] }), EVERYTHING).content![0]
        const text = markdownBlockLines(table, {}).join('\n')
        return this.block(node('codeBlock', { attrs: { language: 'markdown' }, ...(text ? { content: [{ type: 'text', text }] } : {}) }))
      }
      case 'callout':
        return this.block(node('blockquote', { content: c.content }))
      case 'collapsible': {
        const title = attrString(c, 'title')
        const head = title ? [node('paragraph', { content: [{ type: 'text', text: title, marks: [{ type: 'bold' }] }] })] : []
        return [...this.blocks(head), ...this.blocks(c.content || [])]
      }
      case 'taskList':
        return this.block(node('bulletList', { content: c.content }))
      case 'toc':
        // What it lists is worked out where it is shown: nothing to keep.
        return []
      case 'blockMath': {
        const latex = attrString(c, 'latex')
        return this.block(node('codeBlock', { attrs: { language: 'math' }, ...(latex ? { content: [{ type: 'text', text: latex }] } : {}) }))
      }
    }
    return this.blocks(c.content || [])
  }
}

const toInt = (v: unknown, def: number) => {
  if (typeof v === 'number') return Math.trunc(v)
  if (typeof v === 'string' && /^\s*[+-]?[0-9]+\s*$/.test(v)) return parseInt(v, 10)
  return def
}

/** Tiptap's fromString: "300" is 300, "true" true. */
function fromString(s: string): unknown {
  if (s === 'true') return true
  if (s === 'false') return false
  if (/^[+-]?(?:\d*\.)?\d+$/.test(s)) return Number(s)
  return s
}

/** An attribute's value as the editor's schema types it. */
function typedAttr(typ: string, name: string, v: unknown): unknown {
  if (typ === 'heading' && name === 'level') return Math.min(6, Math.max(1, toInt(v, 1)))
  if (typ === 'orderedList' && name === 'start') {
    const s = toInt(v, 1)
    return s < 0 ? 1 : s
  }
  if (typ === 'taskItem' && name === 'checked') {
    if (typeof v === 'boolean') return v
    if (typeof v === 'string') return v !== 'false' && v !== ''
    return v !== null && v !== undefined
  }
  if ((typ === 'tableCell' || typ === 'tableHeader') && (name === 'colspan' || name === 'rowspan')) {
    return Math.max(1, toInt(v, 1))
  }
  if (typ === 'tableCell' || typ === 'tableHeader') {
    // A column's width in px, one for each column the cell spans; a colour by name.
    if (name === 'colwidth') return Array.isArray(v) && v.length && v.every((w) => typeof w === 'number' && Number.isInteger(w) && w > 0) ? v : null
    if (name === 'background') return typeof v === 'string' && CELL_COLOURS.has(v) ? v : null
  }
  if (typ === 'codeBlock' && name === 'wrap') return v === true || v === 'true' ? true : null
  if ((typ === 'codeBlock' && name === 'caption') || name === 'latex') return typeof v === 'string' ? v : null
  if (typ === 'image') return typeof v === 'string' ? fromString(v) : v
  if (typ === 'callout' && name === 'icon') return calloutIcon(v) || null
  const media = typedMediaAttr(typ, name, v)
  if (media !== undefined) return media
  const connected = typedConnectedAttr(typ, name, v)
  if (connected !== undefined) return connected
  if (typ === 'column' && name === 'width') {
    const w = toInt(v, 0)
    return w >= 1 && w <= 99 ? w : null
  }
  if ((typ === 'orderedList' && name === 'type') || (typ === 'codeBlock' && name === 'language')) {
    return typeof v === 'string' ? v : null
  }
  return v
}

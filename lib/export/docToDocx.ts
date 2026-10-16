/**
 * A doc as a Word file, made in the browser. The docx library (MIT) loads
 * only when someone exports, so the editor never carries it. Headings use
 * Word's own styles (Title, Heading 1 to 6), so the file opens with an
 * outline and a table of contents can be made from it; lists are Word lists,
 * a kept table a Word table, and pictures are in the file.
 */

import type { JSONContent } from '@tiptap/core'
import type { CMark, CNode } from '@/lib/codec/doc'
import { attrString, firstNonEmpty, plainText } from '@/lib/codec/doc'
import { normalize } from '@/lib/codec/normalize'
import { SHIPPED } from '@/lib/codec/schema'
import { entityHref, keptTableNode } from '@/lib/codec/markdown'
import { readTable } from '@/lib/codec/markdownParse'
import { isSafeHref } from '@/lib/utils/safeHref'

type Docx = typeof import('docx')
type Block = InstanceType<Docx['Paragraph']> | InstanceType<Docx['Table']>
type Inline = InstanceType<Docx['TextRun']> | InstanceType<Docx['ExternalHyperlink']> | InstanceType<Docx['ImageRun']>

export interface LoadedImage {
  data: ArrayBuffer | Uint8Array
  type: 'png' | 'jpg' | 'gif' | 'bmp'
  width: number
  height: number
}

export interface DocxOptions {
  /** The web app's origin, for links to channels, docs and tasks. */
  appURL?: string
  /** Fetches a picture for the file; by default with the person's session when it is the API's. */
  loadImage?: (src: string) => Promise<LoadedImage | null>
}

export async function docToDocx(title: string, body: JSONContent, opts: DocxOptions = {}): Promise<Blob> {
  const docx = await import('docx')
  return docx.Packer.toBlob(await buildDocx(docx, title, body, opts))
}

/** The Word document itself, for docToDocx and its tests. */
export async function buildDocx(docx: Docx, title: string, body: JSONContent, opts: DocxOptions = {}) {
  const w = new WordWriter(docx, opts)
  const children: Block[] = []
  if (title.trim() !== '') children.push(new docx.Paragraph({ heading: docx.HeadingLevel.TITLE, children: [new docx.TextRun(title)] }))
  children.push(...(await w.blocks(normalize(body as CNode, SHIPPED).content || [], { indent: 0, level: 0 })))
  return new docx.Document({
    title,
    creator: 'OneCamp',
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    numbering: { config: w.numberingConfig() },
    sections: [{ children }],
  })
}

/** Where a block sits: how far in, and in what. */
interface Place {
  indent: number
  level: number
  quote?: boolean
  fill?: string
}

const TWIPS_PER_LEVEL = 360
const MAX_IMAGE_WIDTH = 600
const CODE_FONT = 'Consolas'
const BULLETS = ['•', '◦', '▪']
const CHECKED = '☑'
const UNCHECKED = '☐'

// A callout's tint, by its colour.
const CALLOUT_FILL: Record<string, string> = {
  blue: 'EAF2FF',
  green: 'E8F5EC',
  purple: 'F1ECFF',
  yellow: 'FFF6DB',
  red: 'FDECEC',
  gray: 'F2F3F5',
  agent: 'F1ECFF',
}

// What an embed says in a file: it lives in OneCamp.
const EMBED_TEXT: Record<string, string> = {
  tableEmbed: 'A table: open the doc in OneCamp to see it',
  poll: 'A poll: open the doc in OneCamp to vote',
  chartEmbed: 'A chart: open the doc in OneCamp to see it',
  diffEmbed: 'A change set: open the doc in OneCamp to see it',
  recordingEmbed: 'A call recording: open the doc in OneCamp to play it',
}

const ORDERED_FORMAT: Record<string, keyof Docx['LevelFormat']> = {
  '1': 'DECIMAL',
  a: 'LOWER_LETTER',
  A: 'UPPER_LETTER',
  i: 'LOWER_ROMAN',
  I: 'UPPER_ROMAN',
}

class WordWriter {
  private ordered = new Map<string, { format: keyof Docx['LevelFormat']; start: number }>()
  private instance = 0

  constructor(
    private d: Docx,
    private opts: DocxOptions,
  ) {}

  numberingConfig() {
    const { LevelFormat, AlignmentType } = this.d
    const levels = (format: (typeof LevelFormat)[keyof typeof LevelFormat], text: (i: number) => string, start = 1) =>
      Array.from({ length: 9 }, (_, i) => ({
        level: i,
        format,
        text: text(i),
        start,
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: TWIPS_PER_LEVEL * 2 * (i + 1), hanging: TWIPS_PER_LEVEL } } },
      }))
    const config = [{ reference: 'bullets', levels: levels(LevelFormat.BULLET, (i) => BULLETS[i % BULLETS.length]) }]
    for (const [reference, o] of this.ordered) {
      config.push({ reference, levels: levels(LevelFormat[o.format], (i) => `%${i + 1}.`, o.start) })
    }
    return config
  }

  async blocks(nodes: CNode[], at: Place): Promise<Block[]> {
    const out: Block[] = []
    for (const n of nodes) out.push(...(await this.block(n, at)))
    return out
  }

  private paragraph(children: Inline[], at: Place, extra: Record<string, unknown> = {}) {
    const { BorderStyle, ShadingType } = this.d
    return new this.d.Paragraph({
      children,
      ...(at.indent ? { indent: { left: at.indent } } : {}),
      ...(at.quote ? { border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'D0D7DE', space: 8 } } } : {}),
      ...(at.fill ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: at.fill } } : {}),
      ...extra,
    })
  }

  private async block(n: CNode, at: Place): Promise<Block[]> {
    const d = this.d
    switch (n.type) {
      case 'paragraph':
        return [this.paragraph(await this.inline(n.content || []), at)]
      case 'heading': {
        const level = Math.min(6, Math.max(1, Number(n.attrs?.level) || 1))
        const heading = [d.HeadingLevel.HEADING_1, d.HeadingLevel.HEADING_2, d.HeadingLevel.HEADING_3, d.HeadingLevel.HEADING_4, d.HeadingLevel.HEADING_5, d.HeadingLevel.HEADING_6][level - 1]
        return [this.paragraph(await this.inline(n.content || []), at, { heading, outlineLevel: level - 1 })]
      }
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        return this.list(n, at)
      case 'blockquote':
        return this.blocks(n.content || [], { ...at, indent: at.indent + TWIPS_PER_LEVEL, quote: true })
      case 'callout': {
        const inner = { ...at, indent: at.indent + TWIPS_PER_LEVEL, fill: CALLOUT_FILL[attrString(n, 'color')] || CALLOUT_FILL.blue }
        const emoji = attrString(n, 'emoji')
        const content = n.content || []
        const out: Block[] = []
        if (emoji && content[0]?.type === 'paragraph') {
          out.push(this.paragraph([new d.TextRun(emoji + ' '), ...(await this.inline(content[0].content || []))], inner))
          out.push(...(await this.blocks(content.slice(1), inner)))
        } else {
          out.push(...(await this.blocks(content, inner)))
        }
        return out
      }
      case 'collapsible': {
        const title = attrString(n, 'title')
        const out: Block[] = title ? [this.paragraph([new d.TextRun({ text: title, bold: true })], at)] : []
        out.push(...(await this.blocks(n.content || [], { ...at, indent: at.indent + TWIPS_PER_LEVEL })))
        return out
      }
      case 'codeBlock': {
        const table = keptTableNode(n, readTable)
        if (table) return [await this.table(table)]
        const lines = (n.content || []).map((c) => c.text || '').join('').split('\n')
        const runs = lines.map((line, i) => new d.TextRun({ text: line, font: CODE_FONT, size: 20, ...(i > 0 ? { break: 1 } : {}) }))
        return [this.paragraph(runs, { ...at, fill: at.fill || 'F6F8FA' })]
      }
      case 'horizontalRule':
        return [this.paragraph([], at, { thematicBreak: true })]
      case 'image':
        return [this.paragraph([await this.image(n)], at)]
      case 'table':
        return [await this.table(n)]
      default: {
        const text = EMBED_TEXT[n.type]
        if (text) return [this.paragraph([new d.TextRun({ text, italics: true, color: '59636E' })], at)]
        // Anything else keeps its text.
        const t = plainText(n)
        return t ? [this.paragraph([new d.TextRun(t)], at)] : []
      }
    }
  }

  private async list(n: CNode, at: Place): Promise<Block[]> {
    const d = this.d
    let reference = 'bullets'
    if (n.type === 'orderedList') {
      const format = ORDERED_FORMAT[attrString(n, 'type')] || 'DECIMAL'
      const start = Math.max(0, Math.floor(Number(n.attrs?.start ?? 1)) || 1)
      reference = `ordered-${format}-${start}`
      this.ordered.set(reference, { format, start })
    }
    // Each list counts from its own start.
    const instance = ++this.instance
    const out: Block[] = []
    for (const item of n.content || []) {
      const [first, ...rest] = item.content || []
      const inner: Place = { ...at, indent: 0, level: at.level + 1 }
      if (first?.type === 'paragraph') {
        let runs = await this.inline(first.content || [])
        if (n.type === 'taskList') {
          const box = item.attrs?.checked === true ? CHECKED : UNCHECKED
          runs = [new d.TextRun(box + ' '), ...runs]
          out.push(this.paragraph(runs, { ...at, indent: at.indent + TWIPS_PER_LEVEL * 2 * (at.level + 1) }))
        } else {
          out.push(this.paragraph(runs, { ...at, indent: 0 }, { numbering: { reference, level: Math.min(8, at.level), instance } }))
        }
      } else if (first) {
        rest.unshift(first)
      }
      for (const c of rest) {
        if (c.type === 'bulletList' || c.type === 'orderedList' || c.type === 'taskList') out.push(...(await this.list(c, { ...inner, indent: at.indent })))
        else out.push(...(await this.block(c, { ...at, indent: at.indent + TWIPS_PER_LEVEL * 2 * (at.level + 1) })))
      }
    }
    return out
  }

  private async table(n: CNode) {
    const d = this.d
    const header = { type: d.ShadingType.CLEAR, color: 'auto', fill: 'F6F8FA' }
    const rows = await Promise.all(
      (n.content || []).map(
        async (r, i) =>
          new d.TableRow({
            tableHeader: i === 0,
            children: await Promise.all(
              (r.content || []).map(async (cell) => {
                const blocks = await this.blocks(cell.content || [], { indent: 0, level: 0 })
                return new d.TableCell({
                  children: blocks.length ? blocks : [new d.Paragraph('')],
                  ...(cell.type === 'tableHeader' ? { shading: header } : {}),
                })
              }),
            ),
          }),
      ),
    )
    return new d.Table({ rows, width: { size: 100, type: d.WidthType.PERCENTAGE } })
  }

  private async image(n: CNode): Promise<Inline> {
    const d = this.d
    const src = attrString(n, 'src')
    const alt = attrString(n, 'alt')
    const loaded = src ? await (this.opts.loadImage || fetchImage)(src).catch(() => null) : null
    if (!loaded || !loaded.width || !loaded.height) return new d.TextRun({ text: alt || 'A picture', italics: true, color: '59636E' })
    const scale = Math.min(1, MAX_IMAGE_WIDTH / loaded.width)
    return new d.ImageRun({
      type: loaded.type,
      data: loaded.data,
      transformation: { width: Math.round(loaded.width * scale), height: Math.round(loaded.height * scale) },
      ...(alt ? { altText: { name: alt, description: alt, title: alt } } : {}),
    })
  }

  private appURL(path: string) {
    const base = this.opts.appURL ?? (typeof window !== 'undefined' ? window.location.origin : '')
    return base.replace(/\/+$/, '') + path
  }

  private async inline(nodes: CNode[]): Promise<Inline[]> {
    const d = this.d
    const out: Inline[] = []
    // Neighbouring text with one link is one hyperlink.
    let link: { href: string; runs: InstanceType<Docx['TextRun']>[] } | null = null
    const flush = () => {
      if (link) out.push(new d.ExternalHyperlink({ link: link.href, children: link.runs }))
      link = null
    }
    for (const n of nodes) {
      const marks = n.marks || []
      const linkMark = marks.find((m) => m.type === 'link')
      let href = linkMark ? attrString(linkMark as CNode, 'href') : ''
      let text = ''
      switch (n.type) {
        case 'text':
          text = n.text || ''
          break
        case 'hardBreak':
          flush()
          out.push(new d.TextRun({ break: 1 }))
          continue
        case 'mention':
          text = '@' + firstNonEmpty(attrString(n, 'label'), attrString(n, 'id'))
          break
        case 'channelMention': {
          text = '#' + firstNonEmpty(attrString(n, 'label'), attrString(n, 'id'))
          const id = attrString(n, 'id').replace(/^channel:/, '')
          if (!href && id) href = this.appURL('/app/channel/' + id)
          break
        }
        case 'entityMention': {
          text = firstNonEmpty(attrString(n, 'label'), attrString(n, 'id'))
          const path = entityHref(attrString(n, 'id'))
          if (!href && path) href = this.appURL(path)
          break
        }
        default:
          text = plainText(n)
      }
      if (!text) continue
      if (href.startsWith('/')) href = this.appURL(href)
      const run = this.run(text, marks, !!href && isSafeHref(href))
      if (href && isSafeHref(href)) {
        if (link && (link as { href: string }).href !== href) flush()
        if (!link) link = { href, runs: [] }
        ;(link as { runs: InstanceType<Docx['TextRun']>[] }).runs.push(run)
      } else {
        flush()
        out.push(run)
      }
    }
    flush()
    return out
  }

  private run(text: string, marks: CMark[], linked: boolean) {
    const has = (t: string) => marks.some((m) => m.type === t)
    const color = marks.find((m) => m.type === 'textStyle')?.attrs?.color
    const hex = typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1).toUpperCase() : undefined
    return new this.d.TextRun({
      text,
      ...(has('bold') ? { bold: true } : {}),
      ...(has('italic') ? { italics: true } : {}),
      ...(has('underline') ? { underline: {} } : {}),
      ...(has('strike') ? { strike: true } : {}),
      ...(has('code') ? { font: CODE_FONT, shading: { type: this.d.ShadingType.CLEAR, color: 'auto', fill: 'F6F8FA' } } : {}),
      ...(linked ? { style: 'Hyperlink' } : hex ? { color: hex } : {}),
    })
  }
}

const backendOrigin = () => {
  try {
    return new URL(process.env.NEXT_PUBLIC_BACKEND_URL || '').origin
  } catch {
    return ''
  }
}

/** A picture for the file: as it is when Word takes it, drawn again as PNG when not (WebP, SVG). */
async function fetchImage(src: string): Promise<LoadedImage | null> {
  if (!/^https?:\/\//i.test(src) && !src.startsWith('/')) return null
  const url = new URL(src, window.location.href)
  const ours = url.origin === backendOrigin() || url.origin === window.location.origin
  const res = await fetch(url.href, { credentials: ours ? 'include' : 'omit' })
  if (!res.ok) return null
  const blob = await res.blob()
  const kind = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' } as const)[blob.type as 'image/png']
  const object = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = object
    await img.decode()
    const width = img.naturalWidth
    const height = img.naturalHeight
    if (!width || !height) return null
    if (kind) return { data: await blob.arrayBuffer(), type: kind, width, height }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')?.drawImage(img, 0, 0)
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    return png ? { data: await png.arrayBuffer(), type: 'png', width, height } : null
  } finally {
    URL.revokeObjectURL(object)
  }
}

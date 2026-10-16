import { inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import * as docx from 'docx'
import type { JSONContent } from '@tiptap/core'
import { buildDocx, type LoadedImage } from './docToDocx'

// A Word file is a zip of XML parts; read the parts by the zip's central directory.
function unzip(buf: Buffer): Map<string, string> {
  const files = new Map<string, string>()
  let eocd = buf.length - 22
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--
  const count = buf.readUInt16LE(eocd + 10)
  let at = buf.readUInt32LE(eocd + 16)
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(at + 10)
    const size = buf.readUInt32LE(at + 20)
    const nameLen = buf.readUInt16LE(at + 28)
    const extraLen = buf.readUInt16LE(at + 30)
    const commentLen = buf.readUInt16LE(at + 32)
    const local = buf.readUInt32LE(at + 42)
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen)
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const raw = buf.subarray(start, start + size)
    files.set(name, (method === 8 ? inflateRawSync(raw) : raw).toString('utf8'))
    at += 46 + nameLen + extraLen + commentLen
  }
  return files
}

const p = (text: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] })
const h = (level: number, text: string): JSONContent => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] })

const body: JSONContent = {
  type: 'doc',
  content: [
    h(1, 'Goals'),
    p('Ship the beta.', [{ type: 'bold' }]),
    h(2, 'Steps'),
    { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p('Draft')] }, { type: 'listItem', content: [p('Review')] }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [p('One'), { type: 'bulletList', content: [{ type: 'listItem', content: [p('Nested')] }] }] }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p('Done thing')] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'the site', marks: [{ type: 'link', attrs: { href: 'https://example.com/' } }] }] },
    { type: 'codeBlock', attrs: { language: 'markdown' }, content: [{ type: 'text', text: '| a | b |\n| --- | --- |\n| 1 | 2 |' }] },
    { type: 'image', attrs: { src: 'https://files.example/logo.png', alt: 'Logo' } },
    h(6, 'Notes'),
  ],
}

// A 1×1 PNG.
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c63f8cfc0f01f0005000201a5d7d3a20000000049454e44ae426082', 'hex')

async function wordFile(json: JSONContent, title: string) {
  const loadImage = async (): Promise<LoadedImage> => ({ data: Uint8Array.from(PNG), type: 'png', width: 1, height: 1 })
  const doc = await buildDocx(docx, title, json, { appURL: 'https://app.example.test', loadImage })
  return unzip(await docx.Packer.toBuffer(doc))
}

describe('a doc as a Word file', () => {
  it('opens with Word’s heading styles: the title, then Heading 1 to 6', async () => {
    const files = await wordFile(body, 'Launch plan')
    const xml = files.get('word/document.xml') || ''
    expect(xml).toContain('<w:pStyle w:val="Title"/>')
    expect(xml).toContain('<w:pStyle w:val="Heading1"/>')
    expect(xml).toContain('<w:pStyle w:val="Heading2"/>')
    expect(xml).toContain('<w:pStyle w:val="Heading6"/>')
    const styles = files.get('word/styles.xml') || ''
    for (const id of ['Title', 'Heading1', 'Heading2', 'Heading6']) expect(styles).toContain(`w:styleId="${id}"`)
    expect(styles).toContain('<w:name w:val="Heading 1"/>')
    // In the outline, and so in a table of contents.
    expect(xml).toContain('<w:outlineLvl w:val="0"/>')
    expect(xml).toContain('<w:outlineLvl w:val="5"/>')
    expect(xml).toContain('Launch plan')
  })

  it('keeps lists as Word lists, task boxes, links, a kept table as a table, and pictures', async () => {
    const files = await wordFile(body, 'Launch plan')
    const xml = files.get('word/document.xml') || ''
    expect(xml).toContain('<w:numPr>')
    expect(files.get('word/numbering.xml')).toContain('w:val="decimal"')
    expect(files.get('word/numbering.xml')).toContain('<w:start w:val="3"/>')
    expect(xml).toContain('☑ ')
    expect(xml).toContain('<w:hyperlink')
    expect(files.get('word/_rels/document.xml.rels')).toContain('https://example.com/')
    expect(xml).toContain('<w:tbl>')
    expect(xml).not.toContain('| --- |')
    expect([...files.keys()].some((f) => f.startsWith('word/media/'))).toBe(true)
  })

  it('writes a picture it cannot load as its description', async () => {
    const doc = await buildDocx(docx, '', { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://files.example/x.png', alt: 'A chart of sales' } }] }, { loadImage: async () => null })
    const files = unzip(await docx.Packer.toBuffer(doc))
    expect(files.get('word/document.xml')).toContain('A chart of sales')
  })
})

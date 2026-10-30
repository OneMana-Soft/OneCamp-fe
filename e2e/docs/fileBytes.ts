import { deflateSync } from "node:zlib"

// Small, real files for the in-app viewers to read in a test (Docs & Files'
// preview): a two-page PDF, a PNG and a Word file, made here, so no binary
// lives in the repository.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A PDF string, its brackets and backslashes escaped. */
const pdfText = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`)

/** One page's text: [size, grey (0 ink, 0.45 muted), line] rows from the top, Helvetica. */
function pageStream(lines: Array<[number, number, string]>, foot: string): string {
  let y = 720
  const out: string[] = []
  for (const [size, grey, line] of lines) {
    y -= size >= 20 ? 6 : size >= 14 ? 22 : size + 6
    if (line) out.push(`BT /F${size >= 14 ? 2 : 1} ${size} Tf ${grey} g 72 ${y} Td (${pdfText(line)}) Tj ET`)
    if (size >= 20) y -= size
  }
  out.push(`BT /F1 9 Tf 0.45 g 72 48 Td (${pdfText(foot)}) Tj ET`)
  return out.join("\n")
}

/**
 * A real two-page brief, as a person would upload one: a title, its document
 * title in the file's info (what a PDF viewer names it by), headings and
 * paragraphs on the first page, a timeline, owners and risks on the second.
 */
export function pdf(title: string): Buffer {
  const page1 = pageStream(
    [
      [28, 0, title],
      [12, 0.45, "Website relaunch - version for review"],
      [16, 0, "Goal"],
      [11, 0, "Relaunch the website on the last Tuesday of the month, with the new pricing"],
      [11, 0, "page, three customer stories and a sign-up that takes under a minute."],
      [16, 0, "Who it is for"],
      [11, 0, "Teams of 10 to 200 who run their projects, docs and chat in one place,"],
      [11, 0, "and want it on their own servers or ours."],
      [16, 0, "What ships"],
      [11, 0, "- The new home page, with the product film above the fold"],
      [11, 0, "- Pricing in your currency, worked out daily"],
      [11, 0, "- Customer stories from Northwind, Acme and Lumen"],
      [11, 0, "- A sign-up that starts a workspace in one step"],
    ],
    "1 of 2",
  )
  const page2 = pageStream(
    [
      [16, 0, "Timeline"],
      [11, 0, "Week 1 - copy and design freeze"],
      [11, 0, "Week 2 - build and review on the staging site"],
      [11, 0, "Week 3 - customer stories signed off, analytics checked"],
      [11, 0, "Week 4 - launch on Tuesday at 09:00"],
      [16, 0, "Owners"],
      [11, 0, "Maya (design), Sam (build), Priya (copy and stories)"],
      [16, 0, "Risks"],
      [11, 0, "A late customer sign-off moves the stories, not the launch."],
    ],
    "2 of 2",
  )
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 7 0 R /F2 8 0 R >> >> >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R /F2 8 0 R >> >> >>",
    `<< /Length ${page1.length} >>\nstream\n${page1}\nendstream`,
    `<< /Length ${page2.length} >>\nstream\n${page2}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Title (${pdfText(title)}) /Producer (OneCamp e2e) >>`,
  ]
  let out = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out))
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = Buffer.byteLength(out)
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, "latin1")
}

/** A soft blue gradient, as a mock of a page would be. */
export function png(w: number, h: number): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3
      raw[o] = 72 + Math.round((x / w) * 120)
      raw[o + 1] = 132 + Math.round((y / h) * 70)
      raw[o + 2] = 214
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, "latin1"), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bits per channel
  ihdr[9] = 2 // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])
}

/** A zip of stored (uncompressed) files. */
function zip(files: Array<[string, string]>): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, text] of files) {
    const data = Buffer.from(text, "utf8")
    const fname = Buffer.from(name, "utf8")
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(fname.length, 26)
    parts.push(local, fname, data)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt32LE(crc, 16)
    entry.writeUInt32LE(data.length, 20)
    entry.writeUInt32LE(data.length, 24)
    entry.writeUInt16LE(fname.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, fname)
    offset += 30 + fname.length + data.length
  }
  const dir = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, dir, end])
}

/** A Word file of a bold title and a paragraph, as mammoth reads one. */
export function docx(title: string, body: string): Buffer {
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  return zip([
    [
      "[Content_Types].xml",
      `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ],
    [
      "_rels/.rels",
      `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ],
    [
      "word/document.xml",
      `${xml}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/><w:sz w:val="40"/></w:rPr><w:t>${title}</w:t></w:r></w:p><w:p><w:r><w:t>${body}</w:t></w:r></w:p></w:body></w:document>`,
    ],
  ])
}

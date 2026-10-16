import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { canonicalJSON, CNode } from './doc'
import { normalize } from './normalize'
import { toMarkdown } from './markdown'
import { fromMarkdown, readTable } from './markdownParse'
import { fromHTML, toHTML } from './html'
import { EVERYTHING, IDENTITY_ATTRS, NODE_SPECS, MARK_SPECS, SHIPPED, SHIPPED_MANIFEST, Schema } from './schema'
import { globalsOn } from './globalAttrs'

// The golden fixtures the API's Go codec is held to (business/ContentCodec,
// fixtures_test.go), copied byte for byte into testdata/codec. Every
// direction must give the same bytes here as there: JSON → HTML → JSON,
// JSON → Markdown → JSON → Markdown, and the import fixtures (Google Docs and
// web-page HTML, the collaboration service's stored HTML, Markdown from
// GitHub, Notion and elsewhere).
const DIR = path.join(__dirname, '..', '..', 'testdata', 'codec')
const index = JSON.parse(readFileSync(path.join(DIR, 'fixtures.json'), 'utf8')) as {
  appURL: string
  roundTrip: { name: string; schema?: string }[]
  import: { name: string; file?: string; from: 'md' | 'html'; foreign?: boolean; schema?: string }[]
}
const schemaNamed = (name?: string): Schema => (name === 'everything' ? EVERYTHING : SHIPPED)
const read = (name: string) => readFileSync(path.join(DIR, name), 'utf8')

describe('the codec writes and reads the golden fixtures as the Go codec does', () => {
  for (const f of index.roundTrip) {
    describe(f.name, () => {
      const schema = schemaNamed(f.schema)
      const raw = read(f.name + '.json')
      const doc = JSON.parse(raw) as CNode

      it('is canonical JSON', () => {
        expect(canonicalJSON(normalize(doc, schema))).toBe(raw)
      })

      it('JSON → HTML → JSON', () => {
        const html = toHTML(doc)
        expect(html + '\n').toBe(read(f.name + '.html'))
        expect(canonicalJSON(fromHTML(html, { schema }))).toBe(raw)
      })

      it('JSON → Markdown → JSON → Markdown', () => {
        const md = toMarkdown(doc, { appURL: index.appURL, readTable })
        expect(md).toBe(read(f.name + '.md'))
        const back = fromMarkdown(md, schema)
        const lossy = existsSync(path.join(DIR, f.name + '.md.json'))
        expect(canonicalJSON(back)).toBe(lossy ? read(f.name + '.md.json') : raw)
        expect(toMarkdown(back, { appURL: index.appURL, readTable })).toBe(md)
      })
    })
  }

  for (const f of index.import) {
    it(`reads import/${f.file || f.name}.${f.from === 'html' ? 'html' : 'md'} as import/${f.name}.json`, () => {
      const input = read(`import/${f.file || f.name}.${f.from === 'html' ? 'html' : 'md'}`)
      const schema = schemaNamed(f.schema)
      const doc = f.from === 'html' ? fromHTML(input, { foreign: !!f.foreign, schema }) : fromMarkdown(input, schema)
      expect(canonicalJSON(doc)).toBe(read(`import/${f.name}.json`))
    })
  }
})

describe('the codec covers the editor', () => {
  it('has a rule, with the same attributes, for every node and mark the editor writes', () => {
    for (const [name, t] of Object.entries(SHIPPED_MANIFEST.nodes)) {
      expect(NODE_SPECS[name], `node ${name}`).toBeTruthy()
      // Its own attributes, and those another package puts on it (globalAttrs.ts).
      const known = [...(NODE_SPECS[name].attrs || []).map((a) => a.name), ...globalsOn(name).map((g) => g.name)]
      expect(known.sort(), `node ${name}`).toEqual(t.attrs.filter((a) => !IDENTITY_ATTRS.has(a)).sort())
    }
    for (const [name, t] of Object.entries(SHIPPED_MANIFEST.marks)) {
      expect(MARK_SPECS[name], `mark ${name}`).toBeTruthy()
      expect((MARK_SPECS[name].attrs || []).map((a) => a.name).sort(), `mark ${name}`).toEqual([...t.attrs].sort())
    }
  })

  it('round-trips every node and mark the editor writes in some fixture', () => {
    const nodes = new Set<string>()
    const marks = new Set<string>()
    const visit = (n: CNode) => {
      nodes.add(n.type)
      for (const m of n.marks || []) marks.add(m.type)
      for (const c of n.content || []) visit(c)
    }
    for (const f of index.roundTrip) visit(JSON.parse(read(f.name + '.json')))
    expect(Object.keys(SHIPPED_MANIFEST.nodes).filter((n) => !nodes.has(n))).toEqual([])
    expect(Object.keys(SHIPPED_MANIFEST.marks).filter((m) => !marks.has(m))).toEqual([])
  })

  // The backend holds the original fixtures. Pointed at a backend checkout
  // (ONECAMP_BACKEND_DIR, as when gating a release), the two copies must be
  // byte-equal.
  const backend = process.env.ONECAMP_BACKEND_DIR && path.join(process.env.ONECAMP_BACKEND_DIR, 'testdata', 'codec')
  it.skipIf(!backend || !existsSync(backend))('is the backend’s copy of the fixtures, byte for byte', () => {
    const list = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? list(path.join(dir, e.name)).map((f) => e.name + '/' + f) : [e.name]))
    const ours = list(DIR).sort()
    expect(list(backend!).sort()).toEqual(ours)
    for (const f of ours) expect(readFileSync(path.join(backend!, f), 'utf8'), f).toBe(read(f))
  })
})

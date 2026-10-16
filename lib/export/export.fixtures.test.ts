import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { docToHtml } from './docToHtml'
import { docToMarkdown } from './docToMarkdown'

// The API exports a doc as Markdown and HTML (business/ContentIO,
// exporters.go); the web app makes the same files from the live doc. Both are
// held to testdata/codec/export, which the API's test writes.
const DIR = path.join(__dirname, '..', '..', 'testdata', 'codec')
const index = JSON.parse(readFileSync(path.join(DIR, 'fixtures.json'), 'utf8')) as {
  appURL: string
  export: { name: string; fixture: string; title: string }[]
}
const read = (name: string) => readFileSync(path.join(DIR, name), 'utf8')

describe('an export from the browser is the file the API writes', () => {
  it('has exports to check', () => {
    expect(index.export.length).toBeGreaterThan(0)
  })
  for (const e of index.export) {
    const body = JSON.parse(read(e.fixture + '.json'))
    it(`${e.name}.md`, () => {
      expect(docToMarkdown(e.title, body, { appURL: index.appURL })).toBe(read(`export/${e.name}.md`))
    })
    it(`${e.name}.html`, () => {
      expect(docToHtml(e.title, body)).toBe(read(`export/${e.name}.html`))
    })
  }
})

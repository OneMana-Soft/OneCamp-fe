import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { createExtensions } from './hooks/use-minimal-tiptap'
import { DOC_EXTRA_EXTENSIONS } from '@/components/docEditor/docExtensions'
import { manifestOf } from './schemaManifest'

// The doc editor's nodes and marks must exist on the collaboration server with
// the same names and attributes, or a doc holding one cannot be saved (11 Oct
// 2026: `/table`, `+doc`, `#channel`, polls, charts, diffs and recordings all
// failed every save, and image captions were dropped).
//
// schema-manifest.json is a copy of the backend's
// oneCamp/other-services/collaboration-service/schema-manifest.json, whose
// schemaParity.test.js holds the server to it. Adding a block here:
//   1. add its pure schema (same name, attributes and HTML) to the server's
//      extensions.js;
//   2. run this test with UPDATE_SCHEMA_MANIFEST=1 and copy the file to the
//      backend, so both copies stay byte-equal.
const MANIFEST = path.join(__dirname, 'schema-manifest.json')

const docSchema = () =>
  getSchema(
    createExtensions(
      () => '',
      () => {},
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      DOC_EXTRA_EXTENSIONS as any,
    ) as Parameters<typeof getSchema>[0],
  )

describe('the doc editor schema matches the collaboration server', () => {
  const actual = manifestOf(docSchema())
  if (process.env.UPDATE_SCHEMA_MANIFEST === '1') writeFileSync(MANIFEST, JSON.stringify(actual, null, 2) + '\n')
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))

  it('has the same node types as the manifest', () => {
    expect(Object.keys(actual.nodes)).toEqual(Object.keys(manifest.nodes))
  })

  it('has the same mark types as the manifest', () => {
    expect(Object.keys(actual.marks)).toEqual(Object.keys(manifest.marks))
  })

  it('gives every node and mark the same attributes and placement', () => {
    expect(actual).toEqual(manifest)
  })

  it('names the blocks that were lost on save (the 11 Oct regression)', () => {
    for (const name of ['tableEmbed', 'channelMention', 'entityMention', 'poll', 'chartEmbed', 'diffEmbed', 'recordingEmbed']) {
      expect(manifest.nodes[name], name).toBeTruthy()
    }
    expect(manifest.nodes.image.attrs).toEqual(expect.arrayContaining(['caption', 'id', 'fileName', 'width', 'height']))
  })

  // The backend holds the original. Pointed at a backend checkout
  // (ONECAMP_BACKEND_DIR, set it when gating a release), the two copies must be
  // byte-equal. Not a default path: another checkout may be on another branch.
  const backendDir = process.env.ONECAMP_BACKEND_DIR
  const backend = backendDir && path.join(backendDir, 'other-services/collaboration-service/schema-manifest.json')
  it.skipIf(!backend)('is the same file as the backend copy', () => {
    expect(existsSync(backend as string), `${backend} exists`).toBe(true)
    expect(readFileSync(MANIFEST, 'utf8')).toBe(readFileSync(backend as string, 'utf8'))
  })
})

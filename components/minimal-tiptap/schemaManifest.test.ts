import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import '@/components/docEditor/registry'
import { manifestFor } from '@/components/docEditor/registry/manifest'
import { SCHEMA_MANIFEST_HASH, type SchemaManifest } from './schemaManifest'

// The doc editor's nodes and marks must exist on the collaboration server with
// the same names and attributes, or a doc holding one cannot be saved (11 Oct
// 2026: `/table`, `+doc`, `#channel`, polls, charts, diffs and recordings all
// failed every save, and image captions were dropped).
//
// schema-manifest.json is generated from the block registry (I4: one schema,
// from the registry's specs) and is byte-equal to the backend's
// oneCamp/other-services/collaboration-service/schema-manifest.json, whose
// schemaParity.test.js holds the server to exactly it. Adding or changing a
// block's schema:
//   1. add its pure schema (same name, attributes and HTML) to the server's
//      schema/ folder, one file per block, and a line in schema/index.js;
//   2. regenerate this manifest and its hash from the registry:
//        pnpm schema:manifest
//      (this test with UPDATE_SCHEMA_MANIFEST=1: it writes the JSON and
//      SCHEMA_MANIFEST_HASH in schemaManifest.ts);
//   3. in the backend, `node scripts/schemaManifest.js --from <this repo's
//      components/minimal-tiptap/schema-manifest.json>`: it checks the
//      server's schema against it, copies it and records the new hash in
//      schema-history.json, so tabs built before the change open read-only.
const MANIFEST = path.join(__dirname, 'schema-manifest.json')
const HASH_SOURCE = path.join(__dirname, 'schemaManifest.ts')

/** The hash both sides compute: SHA-256 of the manifest re-serialised compactly. */
const hashOf = (manifest: SchemaManifest) => createHash('sha256').update(JSON.stringify(manifest), 'utf8').digest('hex')

const updating = process.env.UPDATE_SCHEMA_MANIFEST === '1'

describe('the doc editor schema matches the collaboration server', () => {
  let actual: SchemaManifest
  let manifest: SchemaManifest

  beforeAll(async () => {
    actual = await manifestFor('doc')
    if (updating) {
      writeFileSync(MANIFEST, JSON.stringify(actual, null, 2) + '\n')
      const source = readFileSync(HASH_SOURCE, 'utf8')
      writeFileSync(HASH_SOURCE, source.replace(/(SCHEMA_MANIFEST_HASH = ')[0-9a-f]{64}(')/, `$1${hashOf(actual)}$2`))
    }
    manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  })

  // The server is held to exactly the manifest, and the manifest is exactly
  // what the registry generates: a block added on the web alone fails here.
  it('is what the block registry generates', () => {
    expect(manifest).toEqual(actual)
  })

  it("is what the guest's page is built with too (I4)", async () => {
    expect(await manifestFor('guest')).toEqual(manifest)
  })

  // Not while it is being written: this run imported the hash before it changed.
  it.skipIf(updating)('sends the hash of this manifest (SCHEMA_MANIFEST_HASH), as the server computes it', () => {
    expect(SCHEMA_MANIFEST_HASH, 'run pnpm schema:manifest').toBe(hashOf(manifest))
  })

  it('names the blocks that were lost on save (the 11 Oct regression)', () => {
    for (const name of ['tableEmbed', 'channelMention', 'entityMention', 'poll', 'chartEmbed', 'diffEmbed', 'recordingEmbed']) {
      expect(manifest.nodes[name], name).toBeTruthy()
    }
    expect(manifest.nodes.image.attrs).toEqual(expect.arrayContaining(['caption', 'id', 'fileName', 'width', 'height']))
  })

  // The backend holds the copy the server reads. Pointed at a backend checkout
  // (ONECAMP_BACKEND_DIR, set it when gating a release), the two copies must be
  // byte-equal. Not a default path: another checkout may be on another branch.
  const backendDir = process.env.ONECAMP_BACKEND_DIR
  const backend = backendDir && path.join(backendDir, 'other-services/collaboration-service/schema-manifest.json')
  it.skipIf(!backend)('is the same file as the backend copy', () => {
    expect(existsSync(backend as string), `${backend} exists`).toBe(true)
    expect(readFileSync(MANIFEST, 'utf8')).toBe(readFileSync(backend as string, 'utf8'))
  })
})

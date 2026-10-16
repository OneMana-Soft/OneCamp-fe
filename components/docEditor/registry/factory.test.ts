import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AnyExtension } from '@tiptap/core'

import '@/components/docEditor/registry'
import { blocksFor, allBlocks } from './registry'
import { extensionsFor, loadBlocks, specsFor } from './factory'
import { ALL_EDITIONS, bareContext, declaredSchema, manifestFor } from './manifest'
import type { BlockContext, EditorKind } from './types'
import { BLOCK_ID_ATTR } from '@/components/minimal-tiptap/extensions/block-id'
import { offlineProvider } from '@/components/docEditor/docTestKit'

// Every editor is built from the block registry (registry/factory.ts). These
// pin what each editor is built with, in order (a later extension's keys run
// first, so order is behaviour: it is the order the hand-written lists had
// when the registry replaced them), and hold the registry to the schema the
// collaboration server is held to and to the rules it stands for: the
// guest's schema is the doc's (I4), the AI gate changes no schema (I21), and
// the chat composer carries nothing only a doc has.

const names = (exts: AnyExtension[]) => exts.map((e) => e.name)

/**
 * What the built-in specs build, a kind's packages' extensions left out (a
 * package's spec names no order: A9's proposals, A8's anchors). The
 * hand-written lists never had those: they reach an editor through the
 * registry alone.
 */
function builtIns(ctx: BlockContext): string[] {
  const fromPackages = new Set(
    specsFor(ctx.kind, ctx.gate)
      .filter((s) => s.order === undefined)
      .flatMap((s) => [...(s.extensions ?? []), ...(s.create?.(ctx) ?? [])].map((e) => e.name)),
  )
  for (const n of packageLoaded) fromPackages.add(n)
  return names(extensionsFor(ctx)).filter((n) => !fromPackages.has(n))
}
const MANIFEST = JSON.parse(readFileSync(path.join(__dirname, '../../minimal-tiptap/schema-manifest.json'), 'utf8'))

const collab = { enabled: true, documentId: 'doc-1', username: 'Sam Rivera', userId: 'u-sam' }

function context(kind: EditorKind, more: Partial<BlockContext> = {}): BlockContext {
  return { ...bareContext(kind, ALL_EDITIONS), ...more }
}

/** What packages' specs load lazily (B3's tables and equations): theirs too, not built in. */
const packageLoaded = new Set<string>()

// Loading every editor kind's blocks is the slowest step here: under a loaded
// machine it ran past the 10 s hook default and failed the whole file.
beforeAll(async () => {
  for (const kind of ['doc', 'guest', 'chat', 'task'] as const) await loadBlocks(kind, ALL_EDITIONS)
  for (const s of allBlocks()) {
    if (s.order !== undefined || !s.load) continue
    // A loader gives extensions, or what makes each editor's: here, a doc's.
    const got = await s.load()
    for (const e of typeof got === 'function' ? got(context('doc', { docId: 'doc-1' })) : got) packageLoaded.add(e.name)
  }
}, 60_000)

describe('the editor factory', () => {
  it("builds a doc's editor with its blocks, in their order", () => {
    const provider = offlineProvider()
    expect(builtIns(context('doc', { collaboration: collab, provider, showOnlyCurrentPlaceholder: true }))).toMatchInlineSnapshot(`
      [
        "starterKit",
        "link",
        "emojiSuggest",
        "poll",
        "mention",
        "channelMention",
        "entityMention",
        "underline",
        "image",
        "fileHandler",
        "color",
        "textStyle",
        "selection",
        "caretFromScreen",
        "typography",
        "extension",
        "horizontalRule",
        "resetMarksOnEnter",
        "codeBlock",
        "recordingEmbed",
        "chartEmbed",
        "diffEmbed",
        "slash-command",
        "submitShortcut",
        "offloadEmbeddedImages",
        "collaboration",
        "collaborationCursor",
        "callout",
        "collapsible",
        "tableEmbed",
        "blockHandle",
        "clickToCreateBlock",
        "taskList",
        "taskItem",
        "docKeymap",
        "clipboardMarkdown",
        "blockId",
      ]
    `)
    provider.destroy()
  })

  it("builds the chat composer's and a task's editor with nothing only a doc has", () => {
    expect(builtIns(context('chat'))).toMatchInlineSnapshot(`
      [
        "starterKit",
        "link",
        "emojiSuggest",
        "poll",
        "mention",
        "channelMention",
        "entityMention",
        "underline",
        "image",
        "fileHandler",
        "color",
        "textStyle",
        "selection",
        "caretFromScreen",
        "typography",
        "extension",
        "horizontalRule",
        "resetMarksOnEnter",
        "codeBlock",
        "recordingEmbed",
        "chartEmbed",
        "diffEmbed",
        "placeholder",
        "slash-command",
        "submitShortcut",
        "offloadEmbeddedImages",
        "shortcutTable",
      ]
    `)
    // The composer binds Slack's formatting keys itself (blocks/text.ts); a
    // task's description has no keys of its own, so no table.
    expect([...builtIns(context('task')), 'shortcutTable']).toEqual(builtIns(context('chat')))
  })

  it("lets a package's extension stand in for a built-in one of the same name, in the editors it lists", async () => {
    const { Extension } = await import('@tiptap/core')
    const { registerBlock } = await import('./registry')
    const mine = Extension.create({ name: 'placeholder' })
    registerBlock({ id: 'test.placeholder', editors: ['guest'], edition: 'both', extensions: [mine], schema: [] })
    const guest = extensionsFor(context('guest'))
    expect(guest.filter((e) => e.name === 'placeholder')).toEqual([mine])
    // The chat composer keeps Tiptap's.
    const chat = extensionsFor(context('chat')).filter((e) => e.name === 'placeholder')
    expect(chat).toHaveLength(1)
    expect(chat[0]).not.toBe(mine)
  })

  it('names every extension once per editor', () => {
    for (const kind of ['doc', 'guest', 'chat', 'task'] as const) {
      const list = names(extensionsFor(context(kind, { collaboration: collab, provider: offlineProvider() })))
      expect(list.filter((n, i) => list.indexOf(n) !== i), kind).toEqual([])
    }
  })

  it('keeps the built-in blocks in their places and puts a package after them', () => {
    const doc = specsFor('doc', ALL_EDITIONS)
    expect(doc[0].starterKit).toBeTruthy()
    expect(doc.findIndex((s) => s.id === 'collaboration')).toBeLessThan(doc.findIndex((s) => s.id === 'callout'))
    const lastBuiltIn = doc.map((s) => s.order !== undefined).lastIndexOf(true)
    const firstPackage = doc.findIndex((s) => s.order === undefined)
    if (firstPackage >= 0) expect(firstPackage).toBeGreaterThan(lastBuiltIn)
  })

  it("carries the packages merged so far into the editors they name (A9's proposals: the doc and the composer)", () => {
    for (const kind of ['doc', 'chat'] as const) expect(specsFor(kind, ALL_EDITIONS).map((s) => s.id), kind).toContain('proposals')
    expect(specsFor('task', ALL_EDITIONS).map((s) => s.id)).not.toContain('proposals')
  })
})

describe('the schema the registry generates', () => {
  it("is the manifest the collaboration server is held to", async () => {
    expect(await manifestFor('doc')).toEqual(MANIFEST)
  })

  it("gives the guest's page the doc's schema (I4)", async () => {
    expect(await manifestFor('guest')).toEqual(await manifestFor('doc'))
  })

  it('is the same in every edition (I21)', async () => {
    expect(await manifestFor('doc', { ai: false })).toEqual(await manifestFor('doc', { ai: true }))
    for (const spec of allBlocks().filter((s) => s.edition === 'ai')) expect(spec.schema, spec.id).toEqual([])
  })

  it('carries nothing only a doc has into the chat composer or a task', async () => {
    const docOnly = ['callout', 'collapsible', 'tableEmbed', 'taskList', 'taskItem']
    for (const kind of ['chat', 'task'] as const) {
      const m = await manifestFor(kind)
      expect(Object.keys(m.nodes).filter((n) => docOnly.includes(n)), kind).toEqual([])
      // Block ids are a doc's: a message has no blocks to anchor to.
      expect(Object.values(m.nodes).filter((n) => n.attrs.includes(BLOCK_ID_ATTR)), kind).toEqual([])
    }
  })

  it('writes only what the specs name, with the attributes they name', async () => {
    const generated = await manifestFor('doc')
    const declared = declaredSchema('doc')
    // Block identity is one attribute on every block, from the blockId spec.
    const own = (attrs: string[]) => attrs.filter((a) => a !== BLOCK_ID_ATTR)
    for (const [name, node] of Object.entries(generated.nodes)) {
      expect(declared.nodes[name], `node ${name} belongs to no spec`).toBeTruthy()
      expect(own(node.attrs), `node ${name}`).toEqual(declared.nodes[name].attrs)
    }
    for (const [name, mark] of Object.entries(generated.marks)) {
      expect(declared.marks[name], `mark ${name} belongs to no spec`).toBeTruthy()
      expect(mark.attrs, `mark ${name}`).toEqual(declared.marks[name].attrs)
    }
    expect(Object.keys(declared.nodes).filter((n) => !generated.nodes[n])).toEqual([])
    expect(Object.keys(declared.marks).filter((m) => !generated.marks[m])).toEqual([])
  })

  it('gives every block, and only blocks, an id', async () => {
    const { nodes } = await manifestFor('doc')
    for (const [name, node] of Object.entries(nodes)) {
      const block = !node.inline && name !== 'doc' && name !== 'text'
      expect(node.attrs.includes(BLOCK_ID_ATTR), name).toBe(block)
    }
  })
})

describe('the block specs', () => {
  it('give the guest every block the doc has', () => {
    const doc = blocksFor('doc', ALL_EDITIONS).filter((s) => s.schema.length).map((s) => s.id)
    const guest = new Set(blocksFor('guest', ALL_EDITIONS).map((s) => s.id))
    expect(doc.filter((id) => !guest.has(id))).toEqual([])
  })
})

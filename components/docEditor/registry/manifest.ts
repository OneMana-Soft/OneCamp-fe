/**
 * The schema manifest, generated from the block registry (I4): every node and
 * mark a doc's editor writes, with its attributes and where it may sit. The
 * collaboration server holds its own schema to exactly this file
 * (collaboration-service schema-manifest.json, its byte-equal copy), and the
 * hash of it is the schema version a tab sends when it connects: a tab built
 * with a manifest the server has moved on from opens docs read-only and is
 * asked to reload (schemaGate.js).
 *
 * The doc editor's schema is the same in every edition (I21), so the manifest
 * is made with the AI gate open and must not change with it (registry.test.ts).
 *
 * To regenerate after a block changes what it writes:
 *   pnpm schema:manifest
 * then copy components/minimal-tiptap/schema-manifest.json to the backend and
 * run its generator there (collaboration-service: node scripts/schemaManifest.js
 * --from <this file>), which checks its own schema against it and records the
 * new hash in schema-history.json.
 */

import { getSchema } from '@tiptap/core'
import { manifestOf, type SchemaManifest } from '@/components/minimal-tiptap/schemaManifest'
import { extensionsFor, loadBlocks } from './factory'
import { blocksFor, type EditionGate } from './registry'
import type { BlockContext, EditorKind } from './types'

/** Every edition's blocks: the schema doesn't change with the gate. */
export const ALL_EDITIONS: EditionGate = { ai: true }

/** A context with nothing from a host: enough to build an editor's schema. */
export function bareContext(kind: EditorKind, gate: EditionGate = ALL_EDITIONS): BlockContext {
  return { kind, gate, placeholderOf: () => '', toast: () => {} }
}

/** The schema an editor of this kind is built with, its lazy blocks loaded first. */
export async function schemaFor(kind: EditorKind, gate: EditionGate = ALL_EDITIONS) {
  await loadBlocks(kind, gate)
  return getSchema(extensionsFor(bareContext(kind, gate)))
}

/** The manifest of a kind's schema (the doc's is the one the server is held to). */
export async function manifestFor(kind: EditorKind = 'doc', gate: EditionGate = ALL_EDITIONS): Promise<SchemaManifest> {
  return manifestOf(await schemaFor(kind, gate))
}

/**
 * What the specs say they write, by name: each spec's schema entries, with the
 * global attributes other specs put on its nodes (BlockSpec.globalAttrs: an
 * indent, a text direction). Held to the generated manifest by
 * registry.test.ts, so a block can't write a node or an attribute its spec
 * doesn't name (and the codec, search and the sanitiser, which read the specs,
 * would miss).
 */
export function declaredSchema(kind: EditorKind = 'doc', gate: EditionGate = ALL_EDITIONS) {
  const nodes: Record<string, { attrs: string[]; spec: string }> = {}
  const marks: Record<string, { attrs: string[]; spec: string }> = {}
  const specs = blocksFor(kind, gate)
  for (const spec of specs) {
    for (const entry of spec.schema) {
      const into = entry.kind === 'node' ? nodes : marks
      if (into[entry.name]) throw new Error(`The ${entry.kind} "${entry.name}" is named by both "${into[entry.name].spec}" and "${spec.id}"`)
      into[entry.name] = { attrs: [...entry.attrs].sort(), spec: spec.id }
    }
  }
  // After every spec's own entries, so a global attribute finds its nodes
  // whatever order the specs registered in. A node this kind of editor
  // doesn't carry is skipped (a doc-only node, read for the chat composer).
  const addedBy = new Map<string, string>()
  for (const spec of specs) {
    for (const { name, on } of spec.globalAttrs ?? []) {
      for (const nodeName of on) {
        const node = nodes[nodeName]
        if (!node) continue
        if (node.attrs.includes(name)) {
          const first = addedBy.get(`${nodeName}.${name}`) ?? node.spec
          throw new Error(`The attribute "${name}" on "${nodeName}" is named by both "${first}" and "${spec.id}"`)
        }
        addedBy.set(`${nodeName}.${name}`, spec.id)
        node.attrs = [...node.attrs, name].sort()
      }
    }
  }
  return { nodes, marks }
}

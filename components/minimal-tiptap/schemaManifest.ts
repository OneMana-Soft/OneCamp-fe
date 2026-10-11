import type { Schema } from '@tiptap/pm/model'

/**
 * The shape of the doc editor's schema that the collaboration server must
 * share: every node and mark by name, with its attribute names and where it may
 * sit. The server builds the same shape from its own extensions
 * (oneCamp other-services/collaboration-service/schemaManifest.js, the same
 * function), so the two compare as JSON.
 *
 * Why: the server writes each doc's saved body with its schema. A node it did
 * not know (`/table`, `+doc`, `#channel`, a poll...) made every save of that doc
 * fail, and an attribute it did not know (an image's caption) was dropped.
 */
export type SchemaManifest = {
  nodes: Record<string, { attrs: string[]; group: string | null; content: string | null; inline: boolean; atom: boolean }>
  marks: Record<string, { attrs: string[] }>
}

const sorted = <T,>(o: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]))

export function manifestOf(schema: Schema): SchemaManifest {
  const nodes: SchemaManifest['nodes'] = {}
  for (const [name, type] of Object.entries(schema.nodes)) {
    nodes[name] = {
      attrs: Object.keys(type.spec.attrs || {}).sort(),
      group: type.spec.group ?? null,
      content: type.spec.content ?? null,
      inline: type.isInline,
      atom: type.isAtom,
    }
  }
  const marks: SchemaManifest['marks'] = {}
  for (const [name, type] of Object.entries(schema.marks)) {
    marks[name] = { attrs: Object.keys(type.spec.attrs || {}).sort() }
  }
  return { nodes: sorted(nodes), marks: sorted(marks) }
}

/**
 * The hash of schema-manifest.json this build was made with: SHA-256 of the
 * manifest re-serialised compactly, as the collaboration server computes it
 * (oneCamp collaboration-service schemaGate.js manifestHash). Sent with every
 * connection (hooks/useCollaborationProvider.ts collabUrl); a tab whose hash is
 * one the server has moved on from opens docs read-only and is asked to reload.
 * schemaManifest.test.ts fails when the manifest changes without this.
 */
export const SCHEMA_MANIFEST_HASH = '5c7a560bcee8a7b240b3f285b809738008372f7ffc528c1c9b23469439518264'

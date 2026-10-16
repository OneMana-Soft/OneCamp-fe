/**
 * Attributes one package puts on blocks another owns (the editor's global
 * attributes: B1's indent and direction; B2's block colour), as the codec
 * reads and writes them: the same table, rule for rule, as the API's
 * business/ContentCodec/global_attrs.go.
 *
 * A package keeps its rules in a file of its own and adds them to
 * GLOBAL_ATTRS with one line (WAVE_B_CONTRACTS, "Keeping conflicts small").
 * Normalising keeps an attribute only on the nodes it names, typed, and
 * leaves it out at its default, so a doc without any reads as before. HTML
 * carries each as its own attribute, after the node's own; Markdown has no
 * way to say them and leaves them out.
 */

import { BLOCK_LAYOUT_ATTRS } from './blockLayout' // B1
import { DOC_FORMAT_ATTRS } from './docFormat' // B2
import { CONNECTED_ATTRS } from './connectedValues' // C1

export interface GlobalAttr {
  /** The editor's attribute: "indent". */
  name: string
  /** Its HTML attribute: "data-indent". */
  html: string
  /** The node types it goes on. */
  on: readonly string[]
  /** Its default, which is never written. */
  def: unknown
  /** The value as the editor's schema types it, or null when it is none. */
  typed(v: unknown): unknown
  /** The value read from HTML; foreign HTML (a paste, an import) may say less. */
  read(raw: string, foreign: boolean): unknown
  /** The HTML value, or '' to leave it out. */
  write(v: unknown): string
}

export const GLOBAL_ATTRS: readonly GlobalAttr[] = [
  // One line per package, with an import of its rules above.
  ...BLOCK_LAYOUT_ATTRS, // B1: indent and direction
  ...DOC_FORMAT_ATTRS, // B2: a block's colour, a large quote (docFormat.ts)
  ...CONNECTED_ATTRS, // C1: a to-do's task (connectedValues.ts)
]

/** The global attributes on a node type, in table order. */
export function globalsOn(type: string): GlobalAttr[] {
  return GLOBAL_ATTRS.filter((g) => g.on.includes(type))
}

/** A node's global attributes as HTML attributes, in table order. */
export function globalHTMLAttrs(type: string, attrs: Record<string, unknown> | undefined, attr: (name: string, value: string) => string): string {
  let s = ''
  for (const g of globalsOn(type)) {
    const v = g.write(g.typed(attrs?.[g.name]))
    if (v) s += attr(g.html, v)
  }
  return s
}

import type { Attribute } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { connectedId, connectedLinkOf } from "@/lib/codec/connectedValues"
import { linked } from "../link/dataAttr"

/**
 * The ids connected work keeps (docs programme C1), as the editor reads and
 * writes them: the same names and HTML as the collaboration service's
 * schema/connected.js and the codec's rules (lib/codec/connected.ts). Words
 * are kept with B4's dataAttr.
 */

/** An id kept as data-<key>, dropped unless it is a uuid. */
export const idAttr = (name: string, key: string): Partial<Attribute> => ({
  default: null,
  parseHTML: (el) => connectedId(el.getAttribute(key)) || null,
  renderHTML: (attrs) => (connectedId(attrs[name]) ? { [key]: connectedId(attrs[name]) } : {}),
})

/** A connected block's plain link, as the codec writes it (connectedLinkOf), as a DOM spec's children. */
export function blockLink(node: PMNode) {
  const { path, words } = connectedLinkOf(node.type.name, node.attrs)
  return linked(path, words)
}

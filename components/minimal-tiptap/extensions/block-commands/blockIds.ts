import type { Node as PMNode } from "@tiptap/pm/model"

/** A block of the doc, where it is. */
export interface BlockAt {
  pos: number
  node: PMNode
}

/** Nodes that are never blocks of their own for the hand (blocks.ts's rule). */
const NOT_BLOCKS = new Set(["doc", "text", "column"])

/**
 * The blocks with these ids still in the doc, in document order: the one way
 * to find blocks by id (A1's Block Identity), for links to a block, a drag or
 * a move that finds its blocks again after a collaborator's edit, chosen
 * blocks after a remote change, and the bus's anchors. Small and pure, so
 * the doc's first load can carry it.
 */
export function blocksWithIds(doc: PMNode, ids: readonly string[]): BlockAt[] {
  const want = new Set(ids)
  const out: BlockAt[] = []
  if (!want.size) return out
  doc.descendants((node, pos) => {
    if (out.length === want.size) return false
    if (typeof node.attrs.blockId === "string" && want.has(node.attrs.blockId) && !node.isInline && !NOT_BLOCKS.has(node.type.name)) out.push({ pos, node })
    return !node.isTextblock
  })
  return out
}

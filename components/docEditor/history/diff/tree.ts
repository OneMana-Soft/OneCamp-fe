/**
 * A version's blocks as a tree, for the diff (B8): every block the doc has,
 * nested as they are (a list's items, a quote's paragraphs, a callout's, a
 * checklist item's), each with its id (A1's data-block-id, back on the element
 * after sanitising: preview/blocks.ts) and its words.
 *
 * A doc says most of what it says in lists, so a diff that took a whole list
 * as one block read "OneTwo" for two items and marked the list replaced when
 * one item changed. Here a list's items line up one by one, at every depth.
 */

export interface BlockNode {
  el: HTMLElement
  id: string | null
  /** What kind of block: its tag, with its data-type when it has one (a callout is "div[callout]"). */
  kind: string
  /** A leaf's words (an atom's: what it shows); a container's, its blocks' one per line. */
  text: string
  /** A container's blocks; null for a leaf (a paragraph, a heading, code, an image, an embed). */
  kids: BlockNode[] | null
}

/** Always leaves: text blocks and atoms. */
const LEAF = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "PRE", "HR", "IMG"])
/** Text blocks: their words are their text. */
const TEXT = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "PRE"])
/** Blocks in a body saved before blocks had ids. */
const BLOCK = new Set([...LEAF, "BLOCKQUOTE", "UL", "OL", "LI", "TABLE"])

export function isBlock(el: Element): boolean {
  return el.hasAttribute("data-block-id") || BLOCK.has(el.tagName) || (el.tagName === "DIV" && el.hasAttribute("data-type"))
}

/** The blocks directly inside `el`: through wrappers (a checklist item's label and body), never into a block. */
export function blockKids(el: Element): HTMLElement[] {
  const out: HTMLElement[] = []
  const walk = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      if (isBlock(child)) out.push(child as HTMLElement)
      else walk(child)
    }
  }
  walk(el)
  return out
}

const ID_ATTR = / data-block-id="[^"]*"/g

/** An element's HTML without the ids: what it looks like, for telling formatting apart. */
export function lookOf(el: Element): string {
  return el.outerHTML.replace(ID_ATTR, "")
}

/** A container's own attributes (a checklist item's tick, a toggle's title), without its blocks. */
export function ownLook(el: Element): string {
  const attrs = Array.from(el.attributes)
    .filter((a) => a.name !== "data-block-id")
    .map((a) => `${a.name}=${a.value}`)
    .sort()
  return `${el.tagName} ${attrs.join(" ")}`
}

export function blockNode(el: HTMLElement): BlockNode {
  const id = el.getAttribute("data-block-id")
  const type = el.getAttribute("data-type")
  const kind = type ? `${el.tagName.toLowerCase()}[${type}]` : el.tagName.toLowerCase()
  if (!LEAF.has(el.tagName)) {
    const kids = blockKids(el)
    if (kids.length) {
      const nodes = kids.map(blockNode)
      return { el, id, kind, text: nodes.map((n) => n.text).join("\n"), kids: nodes }
    }
  }
  // An atom's words are what it shows: an image's source and its words, an embed's look.
  const text = TEXT.has(el.tagName) ? (el.textContent ?? "") : lookOf(el)
  return { el, id, kind, text, kids: null }
}

/**
 * A version's body as its top-level blocks, read from the saved HTML without
 * a DOM (docs programme B8), and the blocks' ids carried through the
 * sanitiser, which strips data-block-id: a diff matches a block across
 * versions by its id (A1's block identity), at every depth.
 *
 * The HTML is the editor's or the collaboration service's own serialisation:
 * text never holds a raw "<" (it is &lt;), so a tag is "<" up to the ">" that
 * isn't inside a quoted attribute value (an embed's data-diff holds raw "<").
 */

export interface RawBlock {
  /** The block's outer HTML, unsanitised. */
  html: string
  /** Its element's name, lowercase ("p", "h2", "ul"); "#text" for loose text. */
  tag: string
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"])

/** Where the tag that opens at `lt` ends: the index after its ">", or -1. */
function tagEnd(html: string, lt: number): number {
  let quote = ""
  for (let i = lt + 1; i < html.length; i++) {
    const c = html[i]
    if (quote) {
      if (c === quote) quote = ""
    } else if (c === '"' || c === "'") {
      quote = c
    } else if (c === ">") {
      return i + 1
    }
  }
  return -1
}

const NAME = /^<\/?\s*([a-zA-Z][\w:-]*)/

/**
 * The top-level blocks of a body, in order, one at a time: a long body is
 * read only as far as the blocks asked for, so the first screen paints
 * before the rest is read. Pure.
 */
export function* topLevelBlocks(html: string): Generator<RawBlock> {
  let depth = 0
  let start = -1
  let tag = ""
  let i = 0
  const loose = (from: number, to: number): RawBlock | null => {
    const text = html.slice(from, to)
    return /\S/.test(text) ? { html: text.trim(), tag: "#text" } : null
  }
  while (i < html.length) {
    const lt = html.indexOf("<", i)
    if (lt < 0) {
      const rest = depth === 0 ? loose(i, html.length) : null
      if (rest) yield rest
      break
    }
    if (depth === 0 && lt > i) {
      const text = loose(i, lt)
      if (text) yield text
    }
    // A comment, or a declaration: nothing a block is made of.
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4)
      i = end < 0 ? html.length : end + 3
      continue
    }
    if (html[lt + 1] === "!" || html[lt + 1] === "?") {
      const end = tagEnd(html, lt)
      i = end < 0 ? html.length : end
      continue
    }
    const end = tagEnd(html, lt)
    if (end < 0) {
      // A tag that never closes: the rest is text of the block it's in.
      const rest = depth === 0 ? loose(lt, html.length) : null
      if (rest) yield rest
      break
    }
    const raw = html.slice(lt, end)
    const name = NAME.exec(raw)?.[1]?.toLowerCase()
    i = end
    if (!name) {
      // A "<" that starts no tag: text.
      const text = depth === 0 ? loose(lt, end) : null
      if (text) yield text
      continue
    }
    if (raw[1] === "/") {
      if (depth > 0 && --depth === 0) {
        yield { html: html.slice(start, end), tag }
        start = -1
      }
    } else if (VOID.has(name) || /\/\s*>$/.test(raw)) {
      if (depth === 0) yield { html: raw, tag: name }
    } else {
      if (depth === 0) {
        start = lt
        tag = name
      }
      depth++
    }
  }
  // A block left open at the end is kept as it is: the sanitiser closes it.
  if (depth > 0 && start >= 0) yield { html: html.slice(start), tag }
}

/** Every top-level block of a body, in order. Pure. */
export function parseTopLevel(html: string): RawBlock[] {
  return [...topLevelBlocks(html)]
}

/**
 * The attribute a block's id rides through the sanitiser in: it keeps
 * data-label on every element, and no block writes one (a mention, which is
 * inline, does). ID_MARK tells a carried id from a mention's label.
 */
export const ID_CARRIER = "data-label"
export const ID_MARK = "§"

const BLOCK_ID = /\sdata-block-id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i
const HAS_CARRIER = /\sdata-label\s*=/i

/**
 * The body with every data-block-id moved into the carrier, in start tags
 * only: text and attribute values elsewhere are copied as they are. Pure.
 */
export function carryBlockIds(html: string): string {
  if (!html.includes("data-block-id")) return html
  const out: string[] = []
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf("<", i)
    if (lt < 0) {
      out.push(html.slice(i))
      break
    }
    out.push(html.slice(i, lt))
    if (html.startsWith("<!--", lt)) {
      const close = html.indexOf("-->", lt + 4)
      const stop = close < 0 ? html.length : close + 3
      out.push(html.slice(lt, stop))
      i = stop
      continue
    }
    const end = tagEnd(html, lt)
    if (end < 0) {
      out.push(html.slice(lt))
      break
    }
    let tag = html.slice(lt, end)
    if (NAME.test(tag) && tag[1] !== "/" && !HAS_CARRIER.test(tag)) {
      tag = tag.replace(BLOCK_ID, (_m, dq?: string, sq?: string, bare?: string) => {
        const id = (dq ?? sq ?? bare ?? "").replace(/"/g, "&quot;")
        return ` ${ID_CARRIER}="${ID_MARK}${id}"`
      })
    }
    out.push(tag)
    i = end
  }
  return out.join("")
}

/** Puts carried ids back as data-block-id, on `root` and inside it. */
export function restoreBlockIds(root: Element): void {
  const sel = `[${ID_CARRIER}^="${ID_MARK}"]`
  const carried = root.matches(sel) ? [root, ...root.querySelectorAll(sel)] : Array.from(root.querySelectorAll(sel))
  for (const el of carried) {
    const id = el.getAttribute(ID_CARRIER)!.slice(ID_MARK.length)
    el.removeAttribute(ID_CARRIER)
    if (id) el.setAttribute("data-block-id", id)
  }
}

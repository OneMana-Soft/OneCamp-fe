import type { WordChange } from "./words"

interface Piece {
  node: Text
  start: number
}

/**
 * The element's text nodes in order, each with its offset in the element's
 * text: the new version's text, so words already put back as removed don't count.
 */
function pieces(el: Element): Piece[] {
  const out: Piece[] = []
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let at = 0
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text
    if (t.parentElement?.closest("del.history-del")) continue
    out.push({ node: t, start: at })
    at += t.data.length
  }
  return out
}

/**
 * Marks one changed block in place: the words added wrapped in
 * <ins class="history-ins">, and the words removed put back where they stood
 * in <del class="history-del">. An added stretch that crosses bold, a link or
 * a mention is wrapped piece by piece inside each, so the formatting stays as
 * it was. The changes' offsets are in the element's own text (diffWords).
 */
export function markWords(el: HTMLElement, changes: WordChange[]): void {
  const doc = el.ownerDocument
  // Last first, each against the text as it now stands.
  const ordered = [...changes].sort((x, y) => posOf(y) - posOf(x) || (x.kind === "del" ? -1 : 1))
  for (const c of ordered) {
    const list = pieces(el)
    if (c.kind === "ins") {
      for (let i = list.length - 1; i >= 0; i--) {
        const { node, start } = list[i]
        const end = start + node.data.length
        if (end <= c.from || start >= c.to) continue
        let target = node
        const to = Math.min(c.to, end) - start
        const from = Math.max(c.from, start) - start
        if (to < target.data.length) target.splitText(to)
        if (from > 0) target = target.splitText(from)
        if (!/\S/.test(target.data)) continue
        const ins = doc.createElement("ins")
        ins.className = "history-ins"
        target.replaceWith(ins)
        ins.append(target)
      }
    } else {
      const del = doc.createElement("del")
      del.className = "history-del"
      del.textContent = c.text
      const hit = list.find(({ node, start }) => c.at >= start && c.at < start + node.data.length) ?? list[list.length - 1]
      if (!hit) {
        el.append(del)
        continue
      }
      const offset = c.at - hit.start
      if (offset >= hit.node.data.length) hit.node.after(del)
      else if (offset === 0) hit.node.before(del)
      else hit.node.splitText(offset).before(del)
    }
  }
}

const posOf = (c: WordChange) => (c.kind === "ins" ? c.from : c.at)

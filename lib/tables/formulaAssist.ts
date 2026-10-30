// Help as a formula is written (tables B2, FX-7): what to offer where the
// caret is (a field in braces, a linked table's field after {Link}., a
// function as its name is typed), which function the caret is in and on
// which of its values, and the bracket that pairs with one at the caret.
// It reads the text as the server's lexer does (business/Formula/lex.go):
// "text", {fields} and /* comments */ are skipped, a backslash escapes. Pure,
// and in the editor's chunk alone.

/** What the caret is in the middle of writing, and where that starts. */
export type AssistContext =
  | { kind: "field"; partial: string; start: number }
  | { kind: "linked"; link: string; partial: string; start: number }
  | { kind: "function"; partial: string; start: number }

/** Where text, a field and a comment start and end before at, to read past them. */
function skipped(text: string, at: number): { inString: boolean; inField: boolean; fieldStart: number; inComment: boolean } {
  let i = 0
  while (i < at) {
    const c = text[i]
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < at && text[j] !== c) j += text[j] === "\\" ? 2 : 1
      if (j >= at) return { inString: true, inField: false, fieldStart: -1, inComment: false }
      i = j + 1
    } else if (c === "{") {
      let j = i + 1
      while (j < at && text[j] !== "}") j += text[j] === "\\" ? 2 : 1
      if (j >= at) return { inString: false, inField: true, fieldStart: i, inComment: false }
      i = j + 1
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2)
      if (end < 0 || end + 2 > at) return { inString: false, inField: false, fieldStart: -1, inComment: true }
      i = end + 2
    } else i++
  }
  return { inString: false, inField: false, fieldStart: -1, inComment: false }
}

const unescape = (s: string) => s.replace(/\\(.)/g, "$1")

/** What to offer at the caret, or null where nothing is being written that a list could finish. */
export function contextAt(text: string, caret: number): AssistContext | null {
  const s = skipped(text, caret)
  if (s.inString || s.inComment) return null
  if (s.inField) {
    const partial = unescape(text.slice(s.fieldStart + 1, caret))
    // {Link}.{…: a field of the rows the link links to.
    const before = text.slice(0, s.fieldStart)
    const link = /\{((?:[^}\\]|\\.)*)\}\.$/.exec(before)
    if (link) return { kind: "linked", link: unescape(link[1]).trim(), partial, start: s.fieldStart }
    return { kind: "field", partial, start: s.fieldStart }
  }
  const m = /(^|[^A-Za-z0-9_.])([A-Za-z_][A-Za-z0-9_]*)$/.exec(text.slice(0, caret))
  if (!m) return null
  return { kind: "function", partial: m[2], start: caret - m[2].length }
}

/** The function the caret is inside the brackets of, and which of its values (from 0) it's on. */
export function callAt(text: string, caret: number): { name: string; arg: number } | null {
  // Each open bracket before the caret, with the commas seen at its depth.
  const stack: { open: number; commas: number }[] = []
  let i = 0
  while (i < caret) {
    const c = text[i]
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < text.length && text[j] !== c) j += text[j] === "\\" ? 2 : 1
      i = j + 1
      continue
    }
    if (c === "{") {
      let j = i + 1
      while (j < text.length && text[j] !== "}") j += text[j] === "\\" ? 2 : 1
      i = j + 1
      continue
    }
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2)
      i = end < 0 ? text.length : end + 2
      continue
    }
    if (c === "(") stack.push({ open: i, commas: 0 })
    else if (c === ")") stack.pop()
    else if (c === "," && stack.length) stack[stack.length - 1].commas++
    i++
  }
  for (let k = stack.length - 1; k >= 0; k--) {
    const name = /([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(text.slice(0, stack[k].open))
    if (name) return { name: name[1].toUpperCase(), arg: stack[k].commas }
  }
  return null
}

/** The brackets that pair with one just before or at the caret, as two indexes, or null. */
export function matchingBracket(text: string, caret: number): [number, number] | null {
  // Each bracket outside text, fields and comments, and its pair.
  const pairs = new Map<number, number>()
  const open: number[] = []
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < text.length && text[j] !== c) j += text[j] === "\\" ? 2 : 1
      i = j + 1
      continue
    }
    if (c === "{") {
      let j = i + 1
      while (j < text.length && text[j] !== "}") j += text[j] === "\\" ? 2 : 1
      i = j + 1
      continue
    }
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2)
      i = end < 0 ? text.length : end + 2
      continue
    }
    if (c === "(") open.push(i)
    else if (c === ")" && open.length) {
      const o = open.pop()!
      pairs.set(o, i)
      pairs.set(i, o)
    }
    i++
  }
  for (const at of [caret - 1, caret]) {
    const other = pairs.get(at)
    if (other !== undefined) return at < other ? [at, other] : [other, at]
  }
  return null
}

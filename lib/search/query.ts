/**
 * The one query grammar's typing twin (design/QUERY_STACK_CONTRACT.md §4):
 * Slack's modifiers (from:@sam in:#launch before:friday "pricing page" -draft)
 * and JQL's compare form (project = Q4 AND status != Done ORDER BY due) in one
 * text, read exactly as the server's parser reads it (business/SearchQuery).
 * testdata/searchquery/parse.json, byte-identical in both repos, holds the
 * two to one tree.
 *
 * It is for typing only: colouring tokens, drawing chips, writing a chip's
 * token into the text, and knowing which field the caret is in. It never
 * resolves a name, validates a field or runs a query: what a text means is
 * the server's answer (POST /query/parse), and the server re-parses every
 * text it is given.
 */

import { isGoSpace } from "@/lib/utils/goText"

export type Span = [number, number]

export type NodeKind = "and" | "or" | "not" | "word" | "phrase" | "clause"

/** A symbol a clause is written with: ":" for a bare modifier. */
export type Sym = ":" | "=" | "!=" | "<" | "<=" | ">" | ">=" | "~" | "!~" | "in" | "not_in" | "empty" | "not_empty"

export interface SyntaxNode {
  kind: NodeKind
  children?: SyntaxNode[]
  text?: string
  field?: string
  quoted?: boolean
  form?: "mod" | "cmp"
  op?: Sym
  values?: string[]
  list?: boolean
  span: Span
}

export interface SortKey {
  field: string
  quoted?: boolean
  desc?: boolean
  span: Span
}

export interface ParseIssue {
  code: string
  span: Span
}

export type TokenKind = "field" | "op" | "value" | "word" | "phrase" | "keyword" | "neg" | "paren" | "comma"

export interface QueryToken {
  kind: TokenKind
  span: Span
}

export interface Syntax {
  root?: SyntaxNode
  sorts?: SortKey[]
  issues?: ParseIssue[]
  tokens?: QueryToken[]
}

/** The longest text, in UTF-16 code units, and how deep brackets nest. */
export const MAX_TEXT = 1000
const MAX_BRACKETS = 3
const MAX_SORTS = 5

// ---------------------------------------------------------------------------
// The source: code points, with each one's place in UTF-16 code units.

interface Source {
  text: string
  cps: number[]
  u16: number[]
}

function newSource(text: string): Source {
  const cps: number[] = []
  const u16: number[] = []
  let at = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    cps.push(cp)
    u16.push(at)
    at += cp > 0xffff ? 2 : 1
  }
  u16.push(at)
  return { text, cps, u16 }
}

const span = (src: Source, start: number, end: number): Span => [src.u16[start], src.u16[end]]
const slice = (src: Source, start: number, end: number): string => src.text.slice(src.u16[start], src.u16[end])

// Go's unicode.IsSpace, exactly.
const isSpace = isGoSpace

const LPAREN = 0x28
const RPAREN = 0x29
const QUOTE = 0x22
const COMMA = 0x2c
const BACKSLASH = 0x5c
const DASH = 0x2d
const COLON = 0x3a

const endsWord = (cp: number) => isSpace(cp) || cp === LPAREN || cp === RPAREN || cp === QUOTE || cp === COMMA

const OPS = ["!=", "<=", ">=", "!~", "=", "<", ">", "~"]
const MODIFIER_OPS = ["!=", "<=", ">=", "=", "<", ">"]

function startsWith(cps: number[], from: number, to: number, s: string): boolean {
  if (to - from < s.length) return false
  for (let k = 0; k < s.length; k++) if (cps[from + k] !== s.charCodeAt(k)) return false
  return true
}

function leadingOp(cps: number[], from: number, to: number): string {
  for (const op of OPS) if (startsWith(cps, from, to, op)) return op
  return ""
}

function identLen(cps: number[], from: number, to: number): number {
  let n = 0
  while (from + n < to) {
    const c = cps[from + n]
    const letter = c === 0x5f || (c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a)
    if (letter || (n > 0 && c >= 0x30 && c <= 0x39)) {
      n++
      continue
    }
    break
  }
  return n
}

function codePoints(s: string): number[] {
  const out: number[] = []
  for (const ch of s) out.push(ch.codePointAt(0)!)
  return out
}

function isIdent(s: string): boolean {
  const cps = codePoints(s)
  return cps.length > 0 && identLen(cps, 0, cps.length) === cps.length
}

/** ASCII letters' case only, as the Go parser compares keywords. */
function asciiFold(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  for (let k = 0; k < a.length; k++) {
    let x = a.charCodeAt(k)
    let y = b.charCodeAt(k)
    if (x >= 0x41 && x <= 0x5a) x += 32
    if (y >= 0x41 && y <= 0x5a) y += 32
    if (x !== y) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// The lexer.

const enum T {
  Word,
  Quoted,
  LParen,
  RParen,
  Comma,
  Op,
  Neg,
}

interface Tok {
  kind: T
  text: string
  start: number
  end: number
  closed: boolean
  glued: boolean
}

function lex(src: Source): Tok[] {
  const cps = src.cps
  const toks: Tok[] = []
  let prevEnd = -1
  const add = (t: Omit<Tok, "glued">) => {
    toks.push({ ...t, glued: t.start === prevEnd })
    prevEnd = t.end
  }
  let i = 0
  while (i < cps.length) {
    const c = cps[i]
    if (isSpace(c)) {
      i++
    } else if (c === LPAREN) {
      add({ kind: T.LParen, text: "(", start: i, end: i + 1, closed: false })
      i++
    } else if (c === RPAREN) {
      add({ kind: T.RParen, text: ")", start: i, end: i + 1, closed: false })
      i++
    } else if (c === COMMA) {
      add({ kind: T.Comma, text: ",", start: i, end: i + 1, closed: false })
      i++
    } else if (c === QUOTE) {
      let j = i + 1
      let text = ""
      let closed = false
      while (j < cps.length) {
        if (cps[j] === BACKSLASH && j + 1 < cps.length && (cps[j + 1] === QUOTE || cps[j + 1] === BACKSLASH)) {
          text += String.fromCodePoint(cps[j + 1])
          j += 2
          continue
        }
        if (cps[j] === QUOTE) {
          closed = true
          j++
          break
        }
        text += String.fromCodePoint(cps[j])
        j++
      }
      add({ kind: T.Quoted, text, start: i, end: j, closed })
      i = j
    } else {
      let j = i
      while (j < cps.length && !endsWord(cps[j])) j++
      if (c === DASH && i + 1 < cps.length && !isSpace(cps[i + 1]) && cps[i + 1] !== RPAREN && cps[i + 1] !== COMMA) {
        add({ kind: T.Neg, text: "-", start: i, end: i + 1, closed: false })
        i++
        continue
      }
      for (const t of splitWord(src, i, j)) add(t)
      i = j
    }
  }
  return toks
}

function splitWord(src: Source, start: number, end: number): Omit<Tok, "glued">[] {
  const cps = src.cps
  const op = leadingOp(cps, start, end)
  if (op) {
    const out: Omit<Tok, "glued">[] = [{ kind: T.Op, text: op, start, end: start + op.length, closed: false }]
    if (start + op.length < end) out.push(...splitWord(src, start + op.length, end))
    return out
  }
  const n = identLen(cps, start, end)
  if (n > 0 && n < end - start) {
    const op2 = leadingOp(cps, start + n, end)
    if (op2) {
      const out: Omit<Tok, "glued">[] = [
        { kind: T.Word, text: slice(src, start, start + n), start, end: start + n, closed: false },
        { kind: T.Op, text: op2, start: start + n, end: start + n + op2.length, closed: false },
      ]
      if (start + n + op2.length < end) out.push(...splitWord(src, start + n + op2.length, end))
      return out
    }
  }
  return [{ kind: T.Word, text: slice(src, start, end), start, end, closed: false }]
}

// ---------------------------------------------------------------------------
// The parser.

interface ClauseParts {
  field: [number, number]
  op: [number, number]
  keywords: [number, number][]
  values: [number, number][]
  phrases: [number, number][]
  parens: [number, number][]
  commas: [number, number][]
  issues: ParseIssue[]
}

const emptyParts = (): ClauseParts => ({ field: [0, 0], op: [0, 0], keywords: [], values: [], phrases: [], parens: [], commas: [], issues: [] })

function clauseLike(n: SyntaxNode | undefined): boolean {
  if (!n) return false
  if (n.kind === "clause" || n.kind === "and" || n.kind === "or") return true
  if (n.kind === "not") return clauseLike(n.children![0])
  return false
}

class Parser {
  i = 0
  issues: ParseIssue[] = []
  tokensOut: QueryToken[] = []
  sorts: SortKey[] = []

  constructor(
    readonly src: Source,
    readonly toks: Tok[],
  ) {}

  issue(code: string, s: Span) {
    this.issues.push({ code, span: s })
  }

  token(kind: TokenKind, start: number, end: number) {
    this.tokensOut.push({ kind, span: span(this.src, start, end) })
  }

  spanOf(t: Tok): Span {
    return span(this.src, t.start, t.end)
  }

  end(): number {
    return this.src.cps.length
  }

  word(i: number, w: string): boolean {
    return i < this.toks.length && this.toks[i].kind === T.Word && asciiFold(this.toks[i].text, w)
  }

  startsAtom(i: number, depth: number): boolean {
    if (i >= this.toks.length) return false
    const k = this.toks[i].kind
    if (k === T.RParen) return false
    if (k === T.Comma) return true
    return !(depth === 0 && this.atOrderBy(i))
  }

  startsClauseOrGroup(i: number): boolean {
    if (i >= this.toks.length) return false
    const k = this.toks[i].kind
    if (k === T.LParen) return true
    if (k === T.Neg) return this.startsClauseOrGroup(i + 1)
    return this.readClause(i) !== null
  }

  isOrOp(i: number, last: SyntaxNode | undefined, depth: number): boolean {
    if (i >= this.toks.length || this.toks[i].kind !== T.Word || !last) return false
    const t = this.toks[i].text
    if (t === "OR") return this.startsAtom(i + 1, depth)
    return asciiFold(t, "or") && clauseLike(last) && this.startsClauseOrGroup(i + 1)
  }

  isAndOp(i: number, last: SyntaxNode | undefined, depth: number): boolean {
    if (i >= this.toks.length || this.toks[i].kind !== T.Word || !last) return false
    const t = this.toks[i].text
    if (t === "AND") return this.startsAtom(i + 1, depth)
    return asciiFold(t, "and") && clauseLike(last) && this.startsClauseOrGroup(i + 1)
  }

  isNotOp(i: number, last: SyntaxNode | undefined, depth: number): boolean {
    if (i >= this.toks.length || this.toks[i].kind !== T.Word) return false
    const t = this.toks[i].text
    if (t === "NOT") return this.startsAtom(i + 1, depth)
    return asciiFold(t, "not") && (!last || clauseLike(last)) && this.startsClauseOrGroup(i + 1)
  }

  parseOr(depth: number): SyntaxNode | undefined {
    const items: SyntaxNode[] = []
    const first = this.parseAnd(depth)
    if (first) items.push(first)
    while (this.isOrOp(this.i, items[items.length - 1], depth)) {
      const t = this.toks[this.i]
      this.token("keyword", t.start, t.end)
      this.i++
      const next = this.parseAnd(depth)
      if (next) items.push(next)
    }
    return join("or", items)
  }

  parseAnd(depth: number): SyntaxNode | undefined {
    const items: SyntaxNode[] = []
    while (this.i < this.toks.length) {
      const t = this.toks[this.i]
      if (t.kind === T.RParen) {
        if (depth > 0) break
        this.issue("stray_paren", this.spanOf(t))
        this.token("paren", t.start, t.end)
        this.i++
        continue
      }
      if (depth === 0 && this.atOrderBy(this.i)) break
      const last = items[items.length - 1]
      if (this.isOrOp(this.i, last, depth)) break
      if (this.isAndOp(this.i, last, depth)) {
        this.token("keyword", t.start, t.end)
        this.i++
        continue
      }
      const n = this.parseUnary(depth, last)
      if (n) items.push(n)
    }
    return join("and", items)
  }

  parseUnary(depth: number, last: SyntaxNode | undefined): SyntaxNode | undefined {
    const t = this.toks[this.i]
    if (t.kind === T.Neg || this.isNotOp(this.i, last, depth)) {
      this.token(t.kind === T.Neg ? "neg" : "keyword", t.start, t.end)
      this.i++
      if (this.i >= this.toks.length || !this.startsAtom(this.i, depth)) {
        return { kind: "word", text: t.text, span: this.spanOf(t) }
      }
      const operand = this.parseUnary(depth, undefined)
      if (!operand) return undefined
      return { kind: "not", children: [operand], span: [this.src.u16[t.start], operand.span[1]] }
    }
    return this.parseAtom(depth)
  }

  parseAtom(depth: number): SyntaxNode | undefined {
    const t = this.toks[this.i]
    if (t.kind === T.LParen) {
      this.token("paren", t.start, t.end)
      this.i++
      if (depth + 1 > MAX_BRACKETS) this.issue("too_deep", span(this.src, t.start, this.closeOf(this.i - 1)))
      const inner = this.parseOr(depth + 1)
      if (this.i < this.toks.length && this.toks[this.i].kind === T.RParen) {
        const c = this.toks[this.i]
        this.token("paren", c.start, c.end)
        this.i++
        if (inner && (inner.kind === "and" || inner.kind === "or")) inner.span = span(this.src, t.start, c.end)
      } else {
        this.issue("unclosed_paren", span(this.src, t.start, this.end()))
      }
      return inner
    }
    if (t.kind === T.Comma) {
      this.i++
      return { kind: "word", text: ",", span: this.spanOf(t) }
    }
    if (t.kind === T.Quoted) {
      const c = this.readClause(this.i)
      if (c) return this.commitClause(c)
      this.token("phrase", t.start, t.end)
      if (!t.closed) this.issue("unclosed_quote", this.spanOf(t))
      this.i++
      return { kind: "phrase", text: t.text, span: this.spanOf(t) }
    }
    const c = this.readClause(this.i)
    if (c) return this.commitClause(c)
    const raw = this.rawValue(this.i)
    this.token("word", raw.start, raw.end)
    this.i = raw.next
    return { kind: "word", text: raw.text, span: span(this.src, raw.start, raw.end) }
  }

  closeOf(i: number): number {
    let depth = 0
    for (let j = i; j < this.toks.length; j++) {
      const k = this.toks[j].kind
      if (k === T.LParen) depth++
      else if (k === T.RParen) {
        depth--
        if (depth === 0) return this.toks[j].end
      }
    }
    return this.end()
  }

  rawValue(i: number): { text: string; start: number; end: number; next: number } {
    let j = i
    while (j + 1 < this.toks.length && this.toks[j + 1].glued) {
      const k = this.toks[j + 1].kind
      if (k !== T.Word && k !== T.Op && k !== T.Neg) break
      j++
    }
    const start = this.toks[i].start
    const end = this.toks[j].end
    return { text: slice(this.src, start, end), start, end, next: j + 1 }
  }

  commitClause(c: { node: SyntaxNode; next: number; parts: ClauseParts }): SyntaxNode {
    const { node, next, parts } = c
    this.token("field", parts.field[0], parts.field[1])
    const pieces: { kind: TokenKind; start: number; end: number }[] = []
    if (parts.op[1] > parts.op[0]) pieces.push({ kind: "op", start: parts.op[0], end: parts.op[1] })
    for (const k of parts.keywords) pieces.push({ kind: "keyword", start: k[0], end: k[1] })
    for (const v of parts.values) pieces.push({ kind: "value", start: v[0], end: v[1] })
    for (const v of parts.phrases) pieces.push({ kind: "phrase", start: v[0], end: v[1] })
    for (const v of parts.parens) pieces.push({ kind: "paren", start: v[0], end: v[1] })
    for (const v of parts.commas) pieces.push({ kind: "comma", start: v[0], end: v[1] })
    for (let a = 1; a < pieces.length; a++) {
      for (let b = a; b > 0 && pieces[b].start < pieces[b - 1].start; b--) {
        const swap = pieces[b]
        pieces[b] = pieces[b - 1]
        pieces[b - 1] = swap
      }
    }
    for (const pc of pieces) this.token(pc.kind, pc.start, pc.end)
    this.issues.push(...parts.issues)
    this.i = next
    return node
  }

  readClause(i: number): { node: SyntaxNode; next: number; parts: ClauseParts } | null {
    const parts = emptyParts()
    if (i >= this.toks.length) return null
    const t = this.toks[i]
    const cps = this.src.cps

    const modifier = (field: string, quoted: boolean, fieldStart: number, fieldEnd: number, restStart: number, restEnd: number, after: number) => {
      const node: SyntaxNode = { kind: "clause", form: "mod", op: ":", span: [0, 0] }
      if (field !== "") node.field = field
      if (quoted) node.quoted = true
      parts.field = [fieldStart, fieldEnd]
      const opStart = restStart - 1
      for (const op of MODIFIER_OPS) {
        if (startsWith(cps, restStart, restEnd, op)) {
          node.op = op as Sym
          restStart += op.length
          break
        }
      }
      parts.op = [opStart, restStart]
      let end = restEnd
      if (restStart < restEnd) {
        node.values = [slice(this.src, restStart, restEnd)]
        parts.values.push([restStart, restEnd])
      } else if (after < this.toks.length && this.toks[after].glued && this.toks[after].kind === T.Quoted) {
        const q = this.toks[after]
        node.values = [q.text]
        parts.phrases.push([q.start, q.end])
        if (!q.closed) parts.issues.push({ code: "unclosed_quote", span: this.spanOf(q) })
        end = q.end
        after++
      } else {
        parts.issues.push({ code: "empty_value", span: span(this.src, fieldStart, restEnd) })
      }
      node.span = span(this.src, fieldStart, end)
      return { node, next: after, parts }
    }

    if (t.kind === T.Word) {
      const wcps = codePoints(t.text)
      const n = identLen(wcps, 0, wcps.length)
      if (n > 0 && n < wcps.length && wcps[n] === COLON) {
        return modifier(String.fromCodePoint(...wcps.slice(0, n)), false, t.start, t.start + n, t.start + n + 1, t.end, i + 1)
      }
    }
    if (t.kind === T.Quoted && t.closed && i + 1 < this.toks.length) {
      const next = this.toks[i + 1]
      if (next.glued && next.kind === T.Word && next.text.startsWith(":")) {
        return modifier(t.text, true, t.start, t.end, next.start + 1, next.end, i + 2)
      }
    }

    if (!((t.kind === T.Word && isIdent(t.text)) || (t.kind === T.Quoted && t.closed))) return null
    const node: SyntaxNode = { kind: "clause", form: "cmp", span: [0, 0] }
    if (t.text !== "") node.field = t.text
    if (t.kind === T.Quoted) node.quoted = true
    parts.field = [t.start, t.end]
    const j = i + 1
    if (j >= this.toks.length) return null
    const finish = (endCp: number, next: number) => {
      node.span = span(this.src, t.start, endCp)
      return { node, next, parts }
    }
    const tj = this.toks[j]
    if (tj.kind === T.Op) {
      node.op = tj.text as Sym
      parts.op = [tj.start, tj.end]
      const k = j + 1
      if ((node.op === "=" || node.op === "!=") && k < this.toks.length && this.toks[k].kind === T.LParen) {
        node.list = true
        const r = this.readList(k, node, parts)
        return finish(r.end, r.next)
      }
      if (k < this.toks.length) {
        const tk = this.toks[k]
        if (tk.kind === T.Quoted) {
          node.values = [tk.text]
          parts.phrases.push([tk.start, tk.end])
          if (!tk.closed) parts.issues.push({ code: "unclosed_quote", span: this.spanOf(tk) })
          return finish(tk.end, k + 1)
        }
        if (tk.kind === T.Word || tk.kind === T.Op || tk.kind === T.Neg) {
          const raw = this.rawValue(k)
          node.values = [raw.text]
          parts.values.push([raw.start, raw.end])
          return finish(raw.end, raw.next)
        }
      }
      parts.issues.push({ code: "empty_value", span: span(this.src, t.start, tj.end) })
      return finish(tj.end, k)
    }
    if (this.word(j, "in") && j + 1 < this.toks.length && this.toks[j + 1].kind === T.LParen) {
      node.op = "in"
      node.list = true
      parts.keywords.push([tj.start, tj.end])
      const r = this.readList(j + 1, node, parts)
      return finish(r.end, r.next)
    }
    if (this.word(j, "not") && this.word(j + 1, "in") && j + 2 < this.toks.length && this.toks[j + 2].kind === T.LParen) {
      node.op = "not_in"
      node.list = true
      parts.keywords.push([tj.start, tj.end], [this.toks[j + 1].start, this.toks[j + 1].end])
      const r = this.readList(j + 2, node, parts)
      return finish(r.end, r.next)
    }
    if (this.word(j, "is") && (this.word(j + 1, "empty") || this.word(j + 1, "null"))) {
      node.op = "empty"
      parts.keywords.push([tj.start, tj.end], [this.toks[j + 1].start, this.toks[j + 1].end])
      return finish(this.toks[j + 1].end, j + 2)
    }
    if (this.word(j, "is") && this.word(j + 1, "not") && (this.word(j + 2, "empty") || this.word(j + 2, "null"))) {
      node.op = "not_empty"
      parts.keywords.push([tj.start, tj.end], [this.toks[j + 1].start, this.toks[j + 1].end], [this.toks[j + 2].start, this.toks[j + 2].end])
      return finish(this.toks[j + 2].end, j + 3)
    }
    return null
  }

  readList(k: number, node: SyntaxNode, parts: ClauseParts): { end: number; next: number } {
    const open = this.toks[k]
    parts.parens.push([open.start, open.end])
    const values: string[] = node.values ?? []
    let j = k + 1
    const done = (r: { end: number; next: number }) => {
      if (values.length > 0) node.values = values
      return r
    }
    while (j < this.toks.length) {
      const t = this.toks[j]
      if (t.kind === T.RParen) {
        parts.parens.push([t.start, t.end])
        return done({ end: t.end, next: j + 1 })
      }
      if (t.kind === T.Comma) {
        parts.commas.push([t.start, t.end])
        j++
      } else if (t.kind === T.Quoted) {
        values.push(t.text)
        parts.phrases.push([t.start, t.end])
        if (!t.closed) parts.issues.push({ code: "unclosed_quote", span: this.spanOf(t) })
        j++
      } else if (t.kind === T.LParen) {
        parts.issues.push({ code: "bad_list", span: this.spanOf(t) })
        parts.parens.push([t.start, t.end])
        j++
      } else {
        const raw = this.rawValue(j)
        values.push(raw.text)
        parts.values.push([raw.start, raw.end])
        j = raw.next
      }
    }
    parts.issues.push({ code: "unclosed_paren", span: span(this.src, open.start, this.end()) })
    return done({ end: this.end(), next: j })
  }

  atOrderBy(i: number): boolean {
    if (!this.word(i, "order") || !this.word(i + 1, "by") || i + 2 >= this.toks.length) return false
    const t = this.toks[i + 2]
    return (t.kind === T.Word && isIdent(t.text)) || (t.kind === T.Quoted && t.closed)
  }

  parseOrder() {
    this.token("keyword", this.toks[this.i].start, this.toks[this.i].end)
    this.token("keyword", this.toks[this.i + 1].start, this.toks[this.i + 1].end)
    this.i += 2
    while (this.i < this.toks.length) {
      const t = this.toks[this.i]
      if (!((t.kind === T.Word && isIdent(t.text)) || (t.kind === T.Quoted && t.closed))) break
      const key: SortKey = { field: t.text, span: this.spanOf(t) }
      if (t.kind === T.Quoted) key.quoted = true
      this.token("field", t.start, t.end)
      this.i++
      if (this.word(this.i, "asc") || this.word(this.i, "desc")) {
        const d = this.toks[this.i]
        if (asciiFold(d.text, "desc")) key.desc = true
        key.span = [key.span[0], this.src.u16[d.end]]
        this.token("keyword", d.start, d.end)
        this.i++
      }
      if (this.sorts.length === MAX_SORTS) this.issue("too_many_sorts", key.span)
      this.sorts.push(key)
      if (this.i < this.toks.length && this.toks[this.i].kind === T.Comma) {
        const c = this.toks[this.i]
        this.token("comma", c.start, c.end)
        this.i++
        continue
      }
      break
    }
    if (this.i < this.toks.length) {
      this.issue("after_order", span(this.src, this.toks[this.i].start, this.end()))
      this.i = this.toks.length
    }
  }
}

function join(kind: "and" | "or", items: SyntaxNode[]): SyntaxNode | undefined {
  if (items.length === 0) return undefined
  if (items.length === 1) return items[0]
  const children: SyntaxNode[] = []
  for (const it of items) {
    if (it.kind === kind) children.push(...it.children!)
    else children.push(it)
  }
  return { kind, children, span: [children[0].span[0], children[children.length - 1].span[1]] }
}

/** Reads a text into its syntax tree, exactly as the server's parser does. */
export function parse(text: string): Syntax {
  const src = newSource(text)
  const p = new Parser(src, lex(src))
  if (src.u16[src.cps.length] > MAX_TEXT) p.issue("too_long", [MAX_TEXT, src.u16[src.cps.length]])
  const root = p.parseOr(0)
  if (p.atOrderBy(p.i)) p.parseOrder()
  const syn: Syntax = {}
  if (root) syn.root = root
  if (p.sorts.length) syn.sorts = p.sorts
  if (p.issues.length) syn.issues = p.issues
  if (p.tokensOut.length) syn.tokens = p.tokensOut
  return syn
}

// ---------------------------------------------------------------------------
// Writing a tree back: the canonical form, as the server writes it.

const COMPARE: Partial<Record<Sym, string>> = { "=": "=", "!=": "!=", "<": "<", "<=": "<=", ">": ">", ">=": ">=", "~": "~", "!~": "!~" }

function needsQuote(v: string): boolean {
  if (v === "") return true
  for (const ch of v) if (endsWord(ch.codePointAt(0)!)) return true
  return false
}

const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
const formatField = (name: string, quoted?: boolean) => (quoted || !isIdent(name) ? quote(name) : name)
const formatList = (values: string[]) => `(${values.map((v) => (needsQuote(v) ? quote(v) : v)).join(", ")})`

function spellsAnd(n: SyntaxNode): boolean {
  if (n.kind === "clause") return n.form !== "mod"
  if (n.kind === "and" || n.kind === "or") return true
  if (n.kind === "not") return spellsAnd(n.children![0])
  return false
}

function formatClause(n: SyntaxNode): string {
  const field = formatField(n.field ?? "", n.quoted)
  const values = n.values ?? []
  if (n.form === "mod") {
    const op = n.op === ":" ? ":" : ":" + n.op
    if (values.length === 0) return field + op
    let v = values[0]
    if (needsQuote(v) || (n.op === ":" && MODIFIER_OPS.some((o) => v.startsWith(o)))) v = quote(v)
    return field + op + v
  }
  if (n.op === "empty") return field + " IS EMPTY"
  if (n.op === "not_empty") return field + " IS NOT EMPTY"
  if (n.op === "in") return field + " IN " + formatList(values)
  if (n.op === "not_in") return field + " NOT IN " + formatList(values)
  const sym = COMPARE[n.op!] ?? ""
  if (n.list) return `${field} ${sym} ${formatList(values)}`
  if (values.length === 0) return `${field} ${sym}`
  const v = needsQuote(values[0]) ? quote(values[0]) : values[0]
  return `${field} ${sym} ${v}`
}

function formatNode(n: SyntaxNode): string {
  switch (n.kind) {
    case "word":
      return n.text ?? ""
    case "phrase":
      return quote(n.text ?? "")
    case "clause":
      return formatClause(n)
    case "not": {
      const child = n.children![0]
      if (child.kind === "and" || child.kind === "or") return `NOT (${formatNode(child)})`
      if (child.kind === "clause" && child.form !== "mod") return "NOT " + formatNode(child)
      return "-" + formatNode(child)
    }
    case "and": {
      const kids = n.children!
      const parts = kids.map((c) => (c.kind === "or" ? `(${formatNode(c)})` : formatNode(c)))
      return parts.join(kids.some(spellsAnd) ? " AND " : " ")
    }
    case "or":
      return n.children!.map(formatNode).join(" OR ")
  }
}

/** A syntax tree as canonical text: what the server's Syntax.String writes. */
export function format(syn: Syntax): string {
  let out = syn.root ? formatNode(syn.root) : ""
  if (syn.sorts?.length) {
    const keys = syn.sorts.map((k) => formatField(k.field, k.quoted) + (k.desc ? " DESC" : "")).join(", ")
    out += (out ? " " : "") + "ORDER BY " + keys
  }
  return out
}

// ---------------------------------------------------------------------------
// Chips that write tokens.

/** The text a modifier is written as: field:value, quoted where it needs it. */
export function modifierText(field: string, value: string): string {
  return formatClause({ kind: "clause", field, form: "mod", op: ":", values: [value], span: [0, 0] })
}

const tidy = (text: string) => text.replace(/\s{2,}/g, " ").trim()

/** The text without the stretch span covers (a chip's own), spaces tidied. */
export function removeSpan(text: string, s: Span): string {
  return tidy(text.slice(0, s[0]) + " " + text.slice(s[1]))
}

/** The modifiers on a field, as written, among the terms joined by AND at the top of a text. */
function topModifiers(text: string, field: string): SyntaxNode[] {
  const root = parse(text).root
  const terms = !root ? [] : root.kind === "and" ? root.children! : [root]
  return terms.filter((n) => n.kind === "clause" && n.form === "mod" && asciiFold(n.field ?? "", field))
}

/** The text with field:value in place of every modifier on that field (a chip that sets one value). */
export function setModifier(text: string, field: string, value: string): string {
  const found = topModifiers(text, field)
  let out = text
  for (const n of [...found].reverse()) out = out.slice(0, n.span[0]) + out.slice(n.span[1])
  return tidy(`${out} ${modifierText(field, value)}`)
}

/** The text with field:value added beside any already there (a chip that adds a value). */
export function addModifier(text: string, field: string, value: string): string {
  return tidy(`${text} ${modifierText(field, value)}`)
}

/** A modifier at the top of a text, as a chip shows it: its field and values, whether it is negated, and its stretch. */
export interface TopModifier {
  field: string
  values: string[]
  negated: boolean
  span: Span
}

/** The modifiers among the terms joined by AND at the top of a text, negated ones too (-from:@sam), in order. */
export function topModifierList(text: string): TopModifier[] {
  const root = parse(text).root
  const terms = !root ? [] : root.kind === "and" ? root.children! : [root]
  const out: TopModifier[] = []
  for (const n of terms) {
    const negated = n.kind === "not" && n.children?.length === 1
    const c = negated ? n.children![0] : n
    if (c.kind === "clause" && c.form === "mod") out.push({ field: c.field ?? "", values: c.values ?? [], negated, span: n.span })
  }
  return out
}

/** The text without its top modifiers: the words a reader that knows no filters searches for (the AI's answer, Who knows). */
export function freeWords(text: string): string {
  return topModifierList(text).reduceRight((t, m) => removeSpan(t, m.span), text).trim()
}

/**
 * The text with field:value in place of every modifier on any of fields, or
 * with none of them when value is empty: a date chip replaces on:, during:,
 * before: and after: alike, negated ones too.
 */
export function replaceModifiers(text: string, fields: string[], field: string, value: string): string {
  const found = topModifierList(text).filter((m) => fields.some((f) => asciiFold(m.field, f)))
  let out = text
  for (const m of [...found].reverse()) out = out.slice(0, m.span[0]) + out.slice(m.span[1])
  return tidy(value ? `${out} ${modifierText(field, value)}` : out)
}

/** The modifier the caret is in, if any: its field and the stretch its value takes (empty right after the colon). */
export function fieldAt(text: string, caret: number): { field: string; value: string; span: Span } | null {
  const toks = parse(text).tokens ?? []
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k]
    if (t.kind !== "field" || toks[k + 1]?.kind !== "op") continue
    const op = toks[k + 1]
    const value = toks[k + 2]?.kind === "value" || toks[k + 2]?.kind === "phrase" ? toks[k + 2] : undefined
    const from = op.span[1]
    const to = value && value.span[0] === op.span[1] ? value.span[1] : op.span[1]
    if (text.slice(op.span[0], op.span[0] + 1) !== ":") continue
    if (caret >= from && caret <= to) {
      return { field: text.slice(t.span[0], t.span[1]).replace(/^"|"$/g, ""), value: text.slice(from, to), span: [from, to] }
    }
  }
  return null
}

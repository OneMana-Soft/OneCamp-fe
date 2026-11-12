/**
 * The one code highlighter OneCamp has: lowlight with its common languages, and a grammar beyond them loaded the
 * first time something names it (grammars.ts). It knows nothing of editors: it turns code into pieces of text, each
 * with the token classes to colour it (hljs-*). The docs' code blocks make decorations of those pieces
 * (highlighter.ts); a board's code block draws them as spans (miro-17). Load it on demand only, never on a route's
 * static path: lowlight and its grammars are large.
 *
 * A language beyond the common set reads as plain text until its grammar arrives, never guessed at.
 */

import { common, createLowlight } from "lowlight"
import { EXTRA_GRAMMARS } from "./grammars"
import { languageOf } from "./languages"

interface HastNode {
  type: string
  value?: string
  children?: HastNode[]
  properties?: { className?: string[] }
}

/** A run of code and the token classes that colour it (none for plain text). */
export interface CodePiece {
  text: string
  classes: string[]
}

const lowlight = createLowlight(common)

/** Grammars asked for and not here yet, and those that failed to load. */
const wanted = new Set<string>()
const failed = new Set<string>()

/**
 * How much of a block Auto reads to guess its language (V-564): lowlight's guess runs every grammar over the text,
 * about 15 times the cost of colouring it in one, so a long block guesses on its first lines and is coloured whole in
 * the language they name. Cut at a line end, so the guess never reads half a token, unless that leaves less than half
 * of it: a short first line before a long one ("{" before minified JSON) is too little to go on.
 */
export const GUESS_CHARS = 2000

/** Guesses by the text they read, the newest last; a block coloured again past its first lines guesses no more. */
const guesses = new Map<string, string | null>()
const GUESSES_KEPT = 64

type Tree = { children: HastNode[]; data?: { language?: string } }

/** What Auto reads of a block to guess its language. Pure. */
export function guessHead(code: string): string {
  if (code.length <= GUESS_CHARS) return code
  const cut = code.lastIndexOf("\n", GUESS_CHARS)
  return code.slice(0, cut >= GUESS_CHARS / 2 ? cut : GUESS_CHARS)
}

/** The tree for code on Auto, or null when no grammar recognises it. */
function autoTree(code: string): Tree | null {
  const head = guessHead(code)
  let language = guesses.get(head)
  if (language === undefined) {
    const tree = lowlight.highlightAuto(head) as unknown as Tree
    language = tree.data?.language ?? null
    if (guesses.size >= GUESSES_KEPT) guesses.delete(guesses.keys().next().value!)
    guesses.set(head, language)
    if (head === code) return language ? tree : null
  }
  return language ? (lowlight.highlight(language, code) as unknown as Tree) : null
}

/** The grammar a stored language needs: lowlight's own name or alias, else the language list's id. */
function grammarFor(language: string): string {
  if (lowlight.registered(language)) return language
  const id = languageOf(language)?.id
  return id && lowlight.registered(id) ? id : (id ?? language)
}

function flatten(nodes: HastNode[], classes: string[] = [], out: CodePiece[] = []) {
  for (const n of nodes) {
    const cls = n.properties?.className ? [...classes, ...n.properties.className] : classes
    if (n.children) flatten(n.children, cls, out)
    else out.push({ text: n.value ?? "", classes: cls })
  }
  return out
}

/**
 * Code as coloured pieces, whose texts join back to the code. Plain text, a diagram (mermaid) and a language whose
 * grammar hasn't arrived come back as one plain piece; the missing grammar is then wanted (loadWanted). No language
 * means lowlight's best guess on the block's first lines (autoTree), as the docs do; code no grammar recognises is
 * plain.
 */
export function highlightPieces(code: string, language: string | null): CodePiece[] {
  if (!code) return []
  const plain = [{ text: code, classes: [] }]
  if (language === "plaintext" || language === "mermaid") return plain
  let tree: Tree | null
  if (language) {
    const grammar = grammarFor(language)
    if (!lowlight.registered(grammar)) {
      if (EXTRA_GRAMMARS[grammar] && !failed.has(grammar)) wanted.add(grammar)
      return plain
    }
    tree = lowlight.highlight(grammar, code) as unknown as Tree
  } else {
    tree = autoTree(code)
  }
  return tree ? flatten(tree.children) : plain
}

/**
 * Loads the grammars asked for since the last call. Resolves true when one arrived, so whatever asked highlights
 * again.
 */
export async function loadWanted(): Promise<boolean> {
  const names = [...wanted]
  wanted.clear()
  let any = false
  await Promise.all(
    names.map(async (name) => {
      try {
        const grammar = (await EXTRA_GRAMMARS[name]()).default
        lowlight.register(name, grammar as Parameters<typeof lowlight.register>[1])
        any = true
      } catch (e) {
        // A chunk that failed is not asked for again on this page.
        failed.add(name)
        console.error(`Couldn't load the ${name} grammar`, e)
      }
    }),
  )
  // Auto guesses among every grammar here, so a new one may change a guess.
  if (any) guesses.clear()
  return any
}

/** Whether any grammar is wanted (the caller then loads them). */
export const hasWanted = () => wanted.size > 0

/**
 * Pieces cut at every line end, one list per line (an empty list for an empty line), so a numbered line holds its
 * own colours: a comment across two lines keeps its class on both halves.
 */
export function piecesByLine(pieces: CodePiece[]): CodePiece[][] {
  const lines: CodePiece[][] = [[]]
  for (const p of pieces) {
    p.text.split("\n").forEach((text, i) => {
      if (i > 0) lines.push([])
      if (text) lines[lines.length - 1].push({ text, classes: p.classes })
    })
  }
  return lines
}

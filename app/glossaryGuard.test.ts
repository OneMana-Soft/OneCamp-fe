import { existsSync, readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { GLOSSARY, type GlossaryRow, retiredIn } from "@/lib/glossary"
import { EN_MESSAGES, copyFiles, copyTexts, isCode, messageTexts } from "@/lib/testing/copyStrings"
import { type Counts, STALE_FAILS, WRITING, compare, readBaseline, tally, writeBaseline } from "@/lib/testing/ratchet"

/**
 * One word per thing (UX-PROGRAM foundation 7): no retired word of
 * lib/glossary.ts in anything a person reads (JSX text, strings, template
 * pieces, aria-labels and tips; not comments, identifiers, module paths, keys
 * or class names), beyond the per-file baseline: app/glossary.baseline.json
 * for the shared words, app/glossaryAi.baseline.json for the AI edition's.
 * The baseline was counted on the tree the guard landed on and only goes
 * down: the owner of a row renames its uses and runs
 * `node scripts/ds/baselines.mjs app/glossaryGuard.test.ts`, which lowers the
 * counts (and takes in the uses of a newly retired word, once). A new retired
 * word fails until it has run.
 */

/**
 * The AI edition's rows, where this tree has them: the AI-free line has no
 * lib/glossaryAi.ts, and a literal import of a missing file fails Vite's
 * transform there. Its fixtures sit in lib/glossaryAi.test.ts, AI-only too.
 */
const AI_ROWS: readonly GlossaryRow[] = existsSync("lib/glossaryAi.ts")
  ? ((await import(/* @vite-ignore */ `${"@/lib/glossaryAi"}`)) as { GLOSSARY_AI: readonly GlossaryRow[] }).GLOSSARY_AI
  : []
/** This edition's glossary: the shared rows, and the AI edition's where it has them. */
const ROWS: readonly GlossaryRow[] = [...GLOSSARY, ...AI_ROWS]
/** The tables themselves name every retired word. */
const SKIP = new Set(["lib/glossary.ts", "lib/glossaryAi.ts"])

const wordsOf = (rows: readonly GlossaryRow[]) => [...new Set(rows.flatMap((r) => r.retired ?? []))]
/**
 * The ratchet's parts, each against its own baseline: the shared words in the
 * file every edition carries, and the AI edition's in one that is AI-only like
 * its rows (AI_ONLY in lib/editionBoundary.test.ts), read and written only
 * where lib/glossaryAi.ts is.
 */
const PARTS = [
  { baseline: "app/glossary.baseline.json", keys: wordsOf(GLOSSARY) },
  ...(AI_ROWS.length > 0 ? [{ baseline: "app/glossaryAi.baseline.json", keys: wordsOf(AI_ROWS) }] : []),
]
const RETIRED = PARTS.flatMap((p) => p.keys)
const ANY = new RegExp(RETIRED.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"))

/** The retired words one file's copy says, by word. */
export function retiredCopy(file: string, src: string): Record<string, number> {
  const counts: Counts = {}
  if (!ANY.test(src)) return {}
  for (const t of copyTexts(file, src)) {
    if (isCode(t)) continue
    for (const { word } of retiredIn(t.text, file, ROWS)) tally(counts, file, word)
  }
  return counts[file] ?? {}
}

function countTree(): Counts {
  const out: Counts = {}
  for (const file of copyFiles()) {
    if (SKIP.has(file)) continue
    for (const [word, n] of Object.entries(retiredCopy(file, readFileSync(file, "utf8")))) tally(out, file, word, n)
  }
  return out
}

/** The counts of `keys` alone. */
function countsOf(counts: Counts, keys: readonly string[]): Counts {
  const out: Counts = {}
  for (const [file, byWord] of Object.entries(counts)) for (const [word, n] of Object.entries(byWord)) if (keys.includes(word)) tally(out, file, word, n)
  return out
}

const termFor = (word: string) => ROWS.find((r) => r.retired?.includes(word))?.term

describe("the glossary guard", () => {
  it.runIf(WRITING)("writes the baselines", () => {
    const now = countTree()
    for (const { baseline, keys } of PARTS) writeBaseline(baseline, countsOf(now, keys), keys)
  })

  it("finds no retired word in visible copy beyond the per-file baselines, which may only go down", () => {
    const now = countTree()
    for (const { baseline, keys } of PARTS) {
      const { over, stale } = compare(readBaseline(baseline), countsOf(now, keys), keys)
      const say = over.map((o) => `${o.file}: "${o.key}" ${o.n} (baseline ${o.allowed}): say "${termFor(o.key)}"`)
      expect(stale.filter((s) => s.startsWith("new key")), `${baseline}: a newly retired word: run node scripts/ds/baselines.mjs app/glossaryGuard.test.ts`).toEqual([])
      expect(say, `retired words in copy (${baseline}):\n${say.join("\n")}`).toEqual([])
      if (STALE_FAILS) expect(stale, `${baseline} is out of date: run node scripts/ds/baselines.mjs app/glossaryGuard.test.ts (it only lowers)`).toEqual([])
    }
  })

  it("keeps each baseline to its own part's words, so the shared one names no AI word", () => {
    for (const { baseline, keys } of PARTS) {
      const base = readBaseline(baseline)
      const foreign = [...base.keys, ...Object.values(base.files).flatMap((byWord) => Object.keys(byWord))].filter((k) => !keys.includes(k))
      expect([...new Set(foreign)], baseline).toEqual([])
    }
    expect(countsOf({ "a.tsx": { Boards: 2, Other: 1 }, "b.tsx": { Other: 3 } }, ["Boards"])).toEqual({ "a.tsx": { Boards: 2 } })
  })

  it("keeps the English messages free of retired words", () => {
    const en = JSON.parse(readFileSync(EN_MESSAGES, "utf8"))
    const found = messageTexts(en).flatMap(({ path, text }) => retiredIn(text, EN_MESSAGES, ROWS).map((r) => `${path}: "${r.word}": say "${r.term}"`))
    expect(found).toEqual([])
  })

  it("gives every row an owner and a meaning, in term order, and no term is another row's retired word", () => {
    for (const rows of [GLOSSARY, AI_ROWS]) {
      const inOrder = rows.map((r) => r.term)
      expect(inOrder).toEqual([...inOrder].sort((a, b) => a.localeCompare(b, "en")))
    }
    const terms = ROWS.map((r) => r.term)
    expect(new Set(terms).size).toBe(terms.length)
    for (const r of ROWS) {
      expect(r.owner, r.term).toBeTruthy()
      expect(r.means.length, r.term).toBeGreaterThan(8)
    }
    const retired = ROWS.flatMap((r) => r.retired ?? [])
    expect(new Set(retired).size, "a retired word belongs to one row").toBe(retired.length)
    expect(terms.filter((t) => retired.includes(t))).toEqual([])
  })

  it("reads strings, JSX text, tips and accessible names, not comments, identifiers, paths, keys or classes", () => {
    const src = [
      "// Recordings in a comment",
      'import x from "@/components/Boards"',
      "const Recordings = 1",
      'const keys = { "Reply with quote": 1, label: "Reply with quote" }',
      'const a = <p className="Boards" data-tip="Boards" aria-label="Open Boards">Copy doc link</p>',
      "const t = `${n}+ backlinks`",
      "const k = `onecamp-doc-backlinks-hidden:${id}`",
      'const u = "/doc/backlinks/"',
      'type T = "Boards"',
    ].join("\n")
    expect(retiredCopy("components/x.tsx", src)).toEqual({ "Reply with quote": 1, Boards: 2, "Copy doc link": 1, backlinks: 1 })
  })

  it("matches whole words, case and all, and keeps a word where it means something else", () => {
    expect(retiredIn("backlinks and a backlink").map((r) => r.word)).toEqual(["backlink", "backlinks"])
    expect(retiredIn("Boardsmith boards").map((r) => r.word)).toEqual([])
    expect(retiredIn("Check-ins", "components/goals/GoalPage.tsx")).toEqual([])
    expect(retiredIn("Check-ins", "components/checkins/ChannelCheckIns.tsx")).toEqual([{ word: "Check-ins", term: "Standups" }])
    expect(retiredIn("Connected", "components/connectors/ConnectorsCard.tsx")).toEqual([])
    expect(retiredIn("Connected", "components/workGraph/ConnectedOverlay.tsx")).toEqual([{ word: "Connected", term: "Linked" }])
  })

})

import { describe, expect, it } from "vitest"
import { common, createLowlight } from "lowlight"
import { GUESS_CHARS, guessHead, hasWanted, highlightPieces, loadWanted, piecesByLine } from "./codeHighlight"

const joined = (pieces: { text: string }[]) => pieces.map((p) => p.text).join("")

describe("the one code highlighter (docs and boards)", () => {
  it("colours a known language in pieces that join back to the code", () => {
    const code = 'const greet = (name) => `hi ${name}`\nreturn 42'
    const pieces = highlightPieces(code, "javascript")
    expect(joined(pieces)).toBe(code)
    expect(pieces.find((p) => p.text === "const")?.classes).toContain("hljs-keyword")
    expect(pieces.find((p) => p.text === "42")?.classes).toContain("hljs-number")
  })

  it("finds the grammar by the language list's name as well as lowlight's", () => {
    expect(highlightPieces("SELECT 1", "SQL").some((p) => p.classes.includes("hljs-keyword"))).toBe(true)
  })

  it("leaves plain text and diagrams plain, in one piece", () => {
    expect(highlightPieces("const x = 1", "plaintext")).toEqual([{ text: "const x = 1", classes: [] }])
    expect(highlightPieces("graph TD; A-->B", "mermaid")).toEqual([{ text: "graph TD; A-->B", classes: [] }])
    expect(highlightPieces("", "javascript")).toEqual([])
  })

  it("reads a language beyond the common set as plain until its grammar arrives, then colours it", async () => {
    const code = "(defn add [a b] (+ a b))"
    expect(highlightPieces(code, "clojure")).toEqual([{ text: code, classes: [] }])
    expect(hasWanted()).toBe(true)
    expect(await loadWanted()).toBe(true)
    expect(hasWanted()).toBe(false)
    const pieces = highlightPieces(code, "clojure")
    expect(joined(pieces)).toBe(code)
    expect(pieces.some((p) => p.classes.length > 0)).toBe(true)
  })

  it("guesses when no language is named, as the docs do", () => {
    const code = "def add(a, b):\n    return a + b"
    const pieces = highlightPieces(code, null)
    expect(joined(pieces)).toBe(code)
    expect(pieces.some((p) => p.classes.length > 0)).toBe(true)
  })

  it("cuts pieces at line ends, so a numbered line holds its own colours (a board's code block)", () => {
    const code = "/* one\ntwo */\nconst x = 1\n\nreturn x"
    const lines = piecesByLine(highlightPieces(code, "javascript"))
    expect(lines.map((l) => joined(l))).toEqual(code.split("\n"))
    // A comment across two lines keeps its class on both halves; an empty line is an empty line.
    expect(lines[0][0]).toEqual({ text: "/* one", classes: ["hljs-comment"] })
    expect(lines[1][0]).toEqual({ text: "two */", classes: ["hljs-comment"] })
    expect(lines[3]).toEqual([])
    expect(lines[2].find((p) => p.text === "const")?.classes).toContain("hljs-keyword")
    expect(piecesByLine([])).toEqual([[]])
    expect(piecesByLine([{ text: "a\n", classes: [] }])).toEqual([[{ text: "a", classes: [] }], []])
  })
})

// V-564: a block left on Auto (the default) guessed its language over ALL its code on every render, about 15 times
// the cost of colouring it in a named language. The guess now reads the first lines only.
describe("Auto on a long block (V-564)", () => {
  /** A sample repeated to n characters, cut at a line end. */
  const sized = (sample: string, n: number) => {
    const text = sample.repeat(Math.ceil(n / sample.length) + 1)
    return text.slice(0, text.lastIndexOf("\n", n) + 1)
  }
  /** lowlight as it is, to guess over a whole text. */
  const whole = createLowlight(common)
  const time = (f: () => unknown) => {
    const start = performance.now()
    f()
    return performance.now() - start
  }

  const samples: Record<string, string> = {
    javascript: `import { useState } from "react"
// Counts the clicks on a button, and says so.
export function Counter({ start = 0 }) {
  const [count, setCount] = useState(start)
  const label = count === 1 ? "1 click" : \`\${count} clicks\`
  return <button onClick={() => setCount((n) => n + 1)}>{label}</button>
}
export const total = (items) => items.reduce((sum, { price, qty }) => sum + price * qty, 0)
`,
    python: `import json
from dataclasses import dataclass


@dataclass
class Invoice:
    """One invoice and its lines."""
    number: str
    lines: list

    def total(self) -> float:
        return sum(line["price"] * line["qty"] for line in self.lines)


def load(path):
    with open(path) as f:
        return [Invoice(**row) for row in json.load(f)]
`,
    go: `package billing

import (
	"context"
	"fmt"
)

// Total adds up an invoice's lines.
func Total(ctx context.Context, lines []Line) (int64, error) {
	var sum int64
	for _, l := range lines {
		if l.Qty < 0 {
			return 0, fmt.Errorf("line %s: negative qty", l.ID)
		}
		sum += l.Price * int64(l.Qty)
	}
	return sum, nil
}
`,
    sql: `-- Invoices that are late, newest first.
SELECT i.id, i.number, c.name AS customer, SUM(l.price * l.qty) AS total
FROM invoices i
JOIN customers c ON c.id = i.customer_id
LEFT JOIN invoice_lines l ON l.invoice_id = i.id
WHERE i.due_at < NOW() AND i.paid_at IS NULL
GROUP BY i.id, i.number, c.name
ORDER BY i.due_at DESC
LIMIT 50;
`,
    css: `/* The board's code block. */
.code-tokens .hljs-keyword { color: var(--code-keyword); font-weight: 600; }
.code-tokens .hljs-string { color: var(--code-string); }
@media (prefers-color-scheme: dark) {
  .code-tokens { background: #0b0d12; }
}
.card:hover > .title { text-decoration: underline; }
`,
    bash: `#!/usr/bin/env bash
set -euo pipefail
# Backs up every database, then trims old backups.
for db in $(psql -Atc "select datname from pg_database where not datistemplate"); do
  pg_dump "$db" | gzip > "/backups/\${db}-$(date +%F).sql.gz"
done
find /backups -name '*.sql.gz' -mtime +14 -delete
echo "done"
`,
  }

  it("colours a 20,000-character block on Auto for under half the cost of a guess over all of it", () => {
    const body = sized(samples.javascript, 20_000)
    // Warm both: the grammars compile on their first use.
    whole.highlightAuto(samples.javascript)
    highlightPieces(samples.javascript, null)
    let ours = Infinity
    let all = Infinity
    for (let run = 0; run < 2; run++) {
      // A fresh text each run, so nothing is remembered from the run before.
      const code = `// run ${run}\n${body}`
      all = Math.min(all, time(() => whole.highlightAuto(code)))
      ours = Math.min(ours, time(() => highlightPieces(code, null)))
    }
    expect(ours).toBeLessThan(all / 2)
  }, 60_000)

  it("colours the whole of a long block with the language a guess over all of it finds", () => {
    for (const [name, sample] of Object.entries(samples)) {
      const code = sized(sample, 5_000)
      const language = whole.highlightAuto(code).data?.language
      expect(language, name).toBeTruthy()
      const pieces = highlightPieces(code, null)
      expect(joined(pieces), name).toBe(code)
      expect(pieces, name).toEqual(highlightPieces(code, language!))
      // Coloured to its end, not only as far as the guess read.
      expect(pieces.slice(-12).some((p) => p.classes.length > 0), name).toBe(true)
    }
  }, 60_000)

  it("guesses on whole lines, unless a short first line would leave too little to go on (CR-225)", () => {
    const lines = sized(samples.python, 5_000)
    const head = guessHead(lines)
    // At the last line end before the window's end, keeping most of it.
    expect(lines.startsWith(head)).toBe(true)
    expect(lines[head.length]).toBe("\n")
    expect(head.length).toBeLessThanOrEqual(GUESS_CHARS)
    expect(head.length).toBeGreaterThanOrEqual(GUESS_CHARS / 2)
    // "{" and then minified JSON on one long line: the whole window, mid-line.
    const row = (i: number) => `{"id":${i},"name":"item ${i}","price":${i * 3}.5,"tags":["a","b"],"live":true}`
    const json = `{\n"items":[${Array.from({ length: 200 }, (_, i) => row(i)).join(",")}]\n}`
    expect(guessHead(json)).toBe(json.slice(0, GUESS_CHARS))
    // And so it is coloured, as a guess over all of it colours it (a guess on "{" alone left it plain).
    const pieces = highlightPieces(json, null)
    expect(joined(pieces)).toBe(json)
    expect(pieces.filter((p) => p.classes.length > 0).length).toBeGreaterThan(100)
    expect(pieces).toEqual(highlightPieces(json, whole.highlightAuto(json).data!.language!))
    // A block no longer than the window is read whole.
    expect(guessHead(samples.go)).toBe(samples.go)
  }, 60_000)

  it("guesses again once a grammar arrives, as it may name a block better than those there before", async () => {
    const code = "module Main where\n\nimport Data.List (sortBy)\n\nmain :: IO ()\nmain = do\n  let xs = [3, 1, 2] :: [Int]\n  print (sortBy compare xs)\n"
    const before = highlightPieces(code, null)
    // Named, Haskell's grammar is wanted; once it is here, Auto finds it too.
    expect(highlightPieces(code, "haskell")).toEqual([{ text: code, classes: [] }])
    expect(await loadWanted()).toBe(true)
    const after = highlightPieces(code, null)
    expect(after).toEqual(highlightPieces(code, "haskell"))
    expect(after).not.toEqual(before)
  })

  it("keeps a block that no grammar recognises as its text, in one plain piece", () => {
    expect(highlightPieces("Meeting notes\nbuy milk", null)).toEqual([{ text: "Meeting notes\nbuy milk", classes: [] }])
    const long = sized("Meeting notes\nbuy milk\n", 5_000)
    expect(highlightPieces(long, null)).toEqual([{ text: long, classes: [] }])
  })
})

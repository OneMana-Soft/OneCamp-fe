import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

/**
 * No negative tracking on text under 20px.
 *
 * On 10 Oct 2026 words ran together across the app: "the Q4 launchis up on
 * staging", "Fixthe signup confirmation email". The cause was letter-spacing:
 * -0.011em on body. An em letter-spacing computes to a fixed length (-0.154px at
 * 14px) and is inherited as that length by every element, and where glyphs are
 * placed on whole pixels (Chrome on Linux at 1x) the fraction tipped word gaps
 * under a pixel's threshold. Measured in a browser, the space between "launch"
 * and "is" was 3.83px with it and 4.00px without, and the screenshot read as
 * one word with it and two without.
 *
 * Inter is spaced for 13 to 15px as drawn. Tight tracking belongs to display
 * sizes, and a utility that tightens a 14px label is the same bug again.
 */
const root = resolve(__dirname, "..")

function walk(dir: string, ext: string[], out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue
      walk(full, ext, out)
    } else if (ext.some((e) => entry.name.endsWith(e)) && !entry.name.includes(".test.")) {
      out.push(full)
    }
  }
  return out
}

/** A size under 20px, unprefixed (so the element's base size). */
const SMALL = /(?<![\w:-])text-(3xs|2xs|xs|sm|base|lg)(?![\w-])/
/** tracking-tight, tracking-tighter or an arbitrary negative value. */
const NEGATIVE = /(?<![\w:-])tracking-(tight|tighter|\[-[^\]]*\])(?![\w-])/

describe("tracking", () => {
  it("leaves body text and headings at the font's own spacing", () => {
    for (const file of ["app/globals.css", ...walk(resolve(root, "components/minimal-tiptap/styles"), [".css"]).map((f) => f.slice(root.length + 1))]) {
      const css = readFileSync(resolve(root, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
      expect(css, `${file} sets a negative letter-spacing`).not.toMatch(/letter-spacing:\s*-/)
    }
  })

  it("puts no negative tracking on an element whose text is under 20px", () => {
    const offenders: string[] = []
    const files = [
      ...walk(resolve(root, "components"), [".tsx", ".css"]),
      ...walk(resolve(root, "app"), [".tsx", ".css"]),
    ]
    for (const file of files) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (NEGATIVE.test(line) && SMALL.test(line)) offenders.push(`${file.slice(root.length + 1)}:${i + 1}`)
        })
    }
    expect(offenders, "negative tracking on small text runs words together").toEqual([])
  })

  // A primitive's size usually comes from its caller (CardTitle is used at
  // 14 and 18 px), so the line check above can't see it. No primitive tightens
  // its tracking; a caller at display size may add it.
  it("puts no negative tracking on a shared UI primitive", () => {
    const offenders = walk(resolve(root, "components/ui"), [".tsx"])
      .filter((f) => !f.endsWith(".test.tsx"))
      .filter((f) => readFileSync(f, "utf8").split("\n").some((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l) && NEGATIVE.test(l)))
      .map((f) => f.slice(root.length + 1))
    expect(offenders, "a primitive sets negative tracking for every caller").toEqual([])
  })
})

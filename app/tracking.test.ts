import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Tracking follows Inter's own metrics (design v3, "Type").
 *
 * tracking(em) = -0.0223 + 0.185 * e^(-0.1745 * px): +0.005em at 11px, 0 at
 * 12, -0.006em at 14, -0.017em at 20, -0.022em from 44. Every step of the
 * scale carries its own value with its size (--text-sm--letter-spacing and
 * the rest), and this holds each one to the formula.
 *
 * WHY THIS REPLACED "no negative tracking under 20px". On 10 Oct 2026 words
 * ran together ("the Q4 launchis up") because body carried -0.011em, inherited
 * as a fixed -0.154px by every size, on Inter Tight-era metrics. v3's values
 * are Inter's own, about half that at 14px, and paired with the face's
 * optical sizes (opsz 14 is the wider text cut). A size still takes only its
 * own value: an element with no size of its own inherits its parent's, never
 * a display size's.
 *
 * What still fails: a tracking-tight or tracking-[-...] utility on small
 * text, and any primitive that tightens every caller's text. The scale's
 * value is the only tightening a 14px label gets.
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

const formula = (px: number) => -0.0223 + 0.185 * Math.exp(-0.1745 * px)
/**
 * The one step the spec's table sets off the formula: a 15px heading at 590
 * is -0.012em (Inter's -0.009 for its size, tightened a step for the weight).
 */
const TABLE: Record<string, number> = { heading: -0.012 }

describe("tracking", () => {
  const css = readFileSync(resolve(root, "app/globals.css"), "utf8")
  const theme = css.slice(css.indexOf("@theme inline {"), css.indexOf("\n}", css.indexOf("@theme inline {")))
  const steps = [...theme.matchAll(/--text-([a-z0-9]+(?:-[a-z0-9]+)*):\s*([\d.]+)rem;/g)].map((m) => ({ name: m[1], px: Number(m[2]) * 16 }))

  it("finds the scale", () => {
    expect(steps.map((s) => s.name)).toEqual(expect.arrayContaining(["3xs", "2xs", "xs", "sm", "body", "title-1", "display"]))
  })

  it("gives every step of the scale Inter's tracking for its size", () => {
    for (const { name, px } of steps) {
      const m = new RegExp(`--text-${name}--letter-spacing:\\s*(-?[\\d.]+)em;`).exec(theme)
      expect(m, `--text-${name} has no letter-spacing of its own`).not.toBeNull()
      const want = TABLE[name] ?? formula(px)
      expect(Math.abs(Number(m![1]) - want), `--text-${name} (${px}px) is ${m![1]}em, Inter wants ${want.toFixed(4)}em`).toBeLessThanOrEqual(0.0015)
    }
  })

  // The real cause of the 10 Oct word collisions, found by rendering the
  // same line both ways: optimizeLegibility runs words together on Linux at
  // 1x even at zero tracking. Never on body.
  it("never asks for text-rendering: optimizeLegibility", () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/text-rendering:\s*optimizeLegibility/)
  })

  it("gives a word gap back what the tracking takes, so words never run together", () => {
    const body = css.slice(css.indexOf("  body {\n    font-synthesis-weight"), css.indexOf("  }", css.indexOf("  body {\n    font-synthesis-weight")))
    expect(body).toMatch(/word-spacing:\s*0\.01em;/)
  })

  it("keeps v3's features on in the editor, over ProseMirror's own rule", () => {
    expect(css).toMatch(/html \.ProseMirror \{\s*font-feature-settings: "liga" 0, "cv11", "ss01", "ss03";/)
  })

  it("sets no letter-spacing on body or headings outside the scale", () => {
    for (const file of ["app/globals.css", ...walk(resolve(root, "components/minimal-tiptap/styles"), [".css"]).map((f) => f.slice(root.length + 1))]) {
      const text = readFileSync(resolve(root, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
      expect(text, `${file} sets a negative letter-spacing by hand`).not.toMatch(/(?<!-)letter-spacing:\s*-/)
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

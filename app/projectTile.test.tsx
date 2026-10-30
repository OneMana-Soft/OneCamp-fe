import { readFileSync } from "node:fs"
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { CAMP_HUES, hueFor } from "@/lib/campHue"
import { projectHue, setProjectOrder, shareProjectHues } from "@/lib/projectHue"
import { sourceFiles } from "@/lib/testing/sourceFiles"

/**
 * One project tile (owner's decision, 12 Oct 2026). A project was a letter
 * in the sidebar, a glyph in the header and the overview, and a glyph of
 * Home's own choosing on Home; the palette, search, link cards and filters
 * drew theirs. And both demo projects hashed to the same dusk.
 *
 * Now there is one primitive, components/ui/graphics/ProjectTile (the
 * header's glyph tile), in the project's own hue (lib/projectHue): keyed on
 * its id and apart from the reader's other projects.
 */

const ids = Array.from({ length: 9 }, (_, i) => `7b1f0e2a-000${i + 1}-4000-8000-00000000000${i + 1}`)
/** Two projects whose ids hash to the same hue, as the demo's two did. */
const [a, b] = (() => {
  for (const x of ids) for (const y of ids) if (x < y && hueFor(x) === hueFor(y)) return [x, y]
  throw new Error("no colliding pair in the fixture")
})()

afterEach(() => {
  cleanup()
  act(() => setProjectOrder([]))
})

describe("a project's own hue", () => {
  it("keeps two projects apart when their ids hash to one hue", () => {
    const hues = shareProjectHues([a, b])
    expect(hues.get(a)).toBe(hueFor(a))
    expect(hues.get(b)).not.toBe(hues.get(a))
  })

  it("gives up to six projects six different hues, and spreads more evenly", () => {
    expect(new Set(shareProjectHues(ids.slice(0, 6)).values()).size).toBe(6)
    const counts = CAMP_HUES.map((h) => [...shareProjectHues(ids).values()].filter((x) => x === h).length)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  })

  it("never changes an older project's colour when a newer one arrives", () => {
    const before = shareProjectHues(ids.slice(0, 4))
    const after = shareProjectHues(ids.slice(0, 7))
    for (const id of ids.slice(0, 4)) expect(after.get(id)).toBe(before.get(id))
  })

  it("is the same on every screen: keyed on the id, without case or spaces", () => {
    act(() => setProjectOrder([a, b]))
    expect(projectHue(` ${b.toUpperCase()} `)).toBe(projectHue(b))
    // A project outside the reader's own keeps its hash; a colour picked wins.
    expect(projectHue("someone-elses-project")).toBe(hueFor("someone-elses-project"))
    expect(projectHue(b, "#EC4899")).toBe("berry")
  })

  it("draws the tile again when the reader's projects arrive", () => {
    const view = render(<ProjectTile id={b} size={36} />)
    const tile = () => view.container.querySelector<HTMLElement>("[data-project-tile]")!
    expect(tile().dataset.hue).toBe(hueFor(b))
    act(() => setProjectOrder([a, b]))
    expect(tile().dataset.hue).toBe(shareProjectHues([a, b]).get(b))
    expect(tile().dataset.hue).not.toBe(hueFor(a))
    expect(tile().dataset.projectTile).toBe("36")
    expect(tile().querySelector("svg")).not.toBeNull()
  })
})

// --- The source: one primitive draws every project, in its own hue.

const sources = sourceFiles(["app", "components", "hooks", "lib"], /\.(tsx?|css)$/)
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const PRIMITIVE = "components/ui/graphics/ProjectTile.tsx"

/** Each call's argument text, its parentheses balanced. */
function callArgs(src: string, fn: string): string[] {
  const out: string[] = []
  const re = new RegExp(`\\b${fn}\\(`, "g")
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 1
    let i = m.index + m[0].length
    for (; i < src.length && depth; i++) {
      if (src[i] === "(") depth++
      else if (src[i] === ")") depth--
    }
    out.push(src.slice(m.index + m[0].length, i - 1))
  }
  return out
}

describe("one project tile", () => {
  it("scans the whole app", () => {
    expect(sources.length).toBeGreaterThan(500)
  })

  it("has one ProjectTile, and everyone draws that one", () => {
    const offenders: string[] = []
    for (const f of sources) {
      if (f === PRIMITIVE || f.endsWith(".css")) continue
      const src = code(readFileSync(f, "utf8"))
      if (/\b(function|const)\s+\w*ProjectTile\b/.test(src)) offenders.push(`${f}: draws a project tile of its own; use components/ui/graphics/ProjectTile`)
      for (const m of src.matchAll(/import\s*\{[^}]*\bProjectTile\b[^}]*\}\s*from\s*["']([^"']+)["']/g)) {
        if (m[1] !== "@/components/ui/graphics/ProjectTile") offenders.push(`${f}: imports ProjectTile from ${m[1]}`)
      }
      for (const m of src.matchAll(/<ColorIcon\b[^>]*\bname=\{([^}]*)\}/g)) {
        if (/project/i.test(m[1])) offenders.push(`${f}: draws a project as a ColorIcon (${m[1]}); use ProjectTile`)
      }
      // IdentityMark's square was a project's mark beside its name: a third
      // colour for one project (Home's needs-me row drew Q4 launch in lake
      // beside a dusk tile). The playful showcase draws the palette itself.
      if (f !== "app/app/(showcase)/playful-dev/PlayfulShowcase.tsx") {
        for (const m of src.matchAll(/<IdentityMark\b[^>]*variant="square"[^>]*>/g)) offenders.push(`${f}: ${m[0].slice(0, 80)}; a project is a ProjectTile`)
        for (const m of src.matchAll(/<IdentityMark\b[^>]*\bid=\{([^}]*)\}/g)) if (/project/i.test(m[1])) offenders.push(`${f}: draws a project as an IdentityMark (${m[1]}); use ProjectTile`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("keeps no styles for the tiles it replaced", () => {
    const offenders = sources.filter((f) => /\b(shell-ptile|palette-ptile|hub-tile-hl)\b/.test(readFileSync(f, "utf8")))
    expect(offenders).toEqual([])
  })

  it("colours a project by its own hue, never a hash of its own", () => {
    const offenders: string[] = []
    for (const f of sources) {
      if (f === "lib/projectHue.ts" || f.endsWith(".css")) continue
      const src = code(readFileSync(f, "utf8"))
      for (const arg of callArgs(src, "hueFor")) if (/project/i.test(arg)) offenders.push(`${f}: hueFor(${arg}); use projectHue or useProjectHue (lib/projectHue)`)
    }
    expect(offenders).toEqual([])
  })
})

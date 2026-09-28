import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Status colour comes from a token, never a raw hue.
 *
 * There are four status meanings — success, warning, info, destructive — and until
 * now only `destructive` existed as a token. So components reached for raw Tailwind
 * hues instead, and 156 tinted surfaces accumulated across THIRTEEN hues for those
 * four meanings: green AND emerald for positive, amber AND yellow AND orange for
 * caution, red AND rose for danger, violet AND purple AND indigo for accents. Two
 * components used both greens, so a single view drew one meaning in two hues.
 *
 * These tests do two different jobs.
 *
 * The first is absolute: no file may use two interchangeable hues for the same
 * meaning, because that implies a distinction the user cannot perceive. That is a
 * bug, not a preference, and it is enforced with no allowance.
 *
 * The second is a ratchet. Converting all 369 remaining raw-hue utilities in one
 * pass is not possible responsibly — the long tail spans shades 50 through 950 with
 * various alphas, and mapping each onto a token alpha is a per-site judgement about
 * appearance, not a mechanical rename. So the count is pinned here instead: it may
 * fall freely, and any rise fails. New work uses the tokens; the tail gets
 * converted deliberately.
 *
 * Categorical colour is explicitly NOT covered. GitHubActivityTab colours an icon
 * per event type across a dozen hues; there colour encodes identity rather than
 * status, and forcing it into four status tokens would destroy information.
 */

const root = resolve(__dirname, "..")

const STATUS_HUES = ["emerald", "green", "amber", "yellow", "red", "rose"]
const RAW_HUE_UTILITY = new RegExp(
  `\\b(?:bg|text|border|ring)-(?:${STATUS_HUES.join("|")})-\\d{2,3}(?:/\\d{1,3})?\\b`,
  "g",
)

/**
 * Hues a user cannot tell apart, so using both for one meaning communicates a
 * difference that does not exist.
 */
const INTERCHANGEABLE: [string, string][] = [
  ["emerald", "green"],
  ["amber", "yellow"],
  ["red", "rose"],
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue
      walk(full, out)
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full)
    }
  }
  return out
}

const files = [...walk(resolve(root, "components")), ...walk(resolve(root, "app"))]

/**
 * Where a hue names a thing rather than a state, so it is not a status colour.
 * GitHubActivityTab gives each event type its own icon colour; mapping those onto
 * four status tokens would lose which event is which. Listed by name so a new
 * exception is a decision someone writes down, not a number that drifts.
 */
const CATEGORICAL = new Set(["components/task/GitHubActivityTab.tsx"])
const statusFiles = files.filter((f) => !CATEGORICAL.has(f.slice(root.length + 1)))

describe("status colour tokens", () => {
  it("defines all four meanings, in both modes", () => {
    const css = readFileSync(resolve(root, "app/globals.css"), "utf8")
    for (const token of ["success", "warning", "info", "destructive"]) {
      expect(css, `--${token} must be defined`).toMatch(new RegExp(`--${token}:`))
      expect(css, `--color-${token} must be exposed to utilities`).toMatch(
        new RegExp(`--color-${token}:`),
      )
    }
    // The dark block must re-point success/warning/info, or they'd read as the
    // light 600 shades on a dark surface.
    const dark = css.slice(css.indexOf(".dark {"))
    for (const token of ["success", "warning", "info"]) {
      expect(dark, `--${token} must have a dark value`).toMatch(new RegExp(`--${token}:`))
    }
  })

  it("scans a meaningful number of files", () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it("never uses two interchangeable hues in one file", () => {
    const offenders: string[] = []
    for (const file of files) {
      const src = readFileSync(file, "utf8")
      for (const [a, b] of INTERCHANGEABLE) {
        const usesA = new RegExp(`\\b(?:bg|text|border|ring)-${a}-\\d`).test(src)
        const usesB = new RegExp(`\\b(?:bg|text|border|ring)-${b}-\\d`).test(src)
        if (usesA && usesB) offenders.push(`${file.slice(root.length + 1)}: ${a} + ${b}`)
      }
    }
    expect(offenders, `interchangeable hues mixed in:\n${offenders.join("\n")}`).toEqual([])
  })

  it("uses no raw status hue outside categorical colour", () => {
    // This was a ratchet: 369 raw status hues before the token set existed, then 350,
    // 342, 313 and 36. The last 26 went surface by surface on 29 Sep 2026 (a live-call
    // pulse, success hovers, warning callouts, an error line, the doc AI's rainbow of
    // action icons, which now speak in the one accent), so it is a hard rule now.
    const offenders: string[] = []
    for (const f of statusFiles) {
      const hits = readFileSync(f, "utf8").match(RAW_HUE_UTILITY)
      if (hits) offenders.push(`${f.slice(root.length + 1)}: ${[...new Set(hits)].join(", ")}`)
    }
    expect(
      offenders,
      `raw status hues. Use bg-success / text-warning / text-destructive / text-info instead:\n${offenders.join("\n")}`,
    ).toEqual([])
  })

  it("the light/dark pairs really were collapsed", () => {
    // 78 hand-written `text-x-600 dark:text-x-400` pairs became one mode-aware class.
    const offenders: string[] = []
    for (const file of files) {
      const src = readFileSync(file, "utf8")
      const m = src.match(/text-(?:emerald|green|amber|red)-600 dark:text-\w+-400/g)
      if (m) offenders.push(`${file.slice(root.length + 1)} (${m.length})`)
    }
    expect(offenders, `un-collapsed light/dark pairs in:\n${offenders.join("\n")}`).toEqual([])
  })
})

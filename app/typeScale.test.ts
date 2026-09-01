import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
/**
 * The dense end of the type scale is named, and there is a floor.
 *
 * Tailwind's scale stops at 12px, so a dense product UI reaches past it with
 * arbitrary values. Left alone that produces an interface where the same
 * "caption" is three sizes on three surfaces, because nothing says which size a
 * caption is. globals.css therefore declares two steps below text-xs —
 * --text-2xs (11px, metadata and badge labels) and --text-3xs (10px, uppercase
 * eyebrows and counts) — each with a deliberate line-height, and states 10px as
 * the floor: the practical legibility limit on a phone.
 *
 * These tests enforce that in source. The companion assertions in
 * e2e/designSystem.spec.ts check the other half — that the tokens actually
 * compute to 10px and 11px in a real browser — because a token can be declared
 * and still resolve to nothing, which would silently resize every label in the
 * app while every source test stayed green.
 *
 * Two different jobs, as with the status-colour tests.
 *
 * The FLOOR is absolute. Sub-10px type is not a style preference to be traded
 * off; it is text a person cannot comfortably read, and it had accumulated in
 * exactly the places where it hurts most — the notification count, typing
 * indicators, calendar times, and thread participant initials. 26 such sites
 * were raised to the floor and no allowance is granted for new ones.
 *
 * The BYPASS COUNT is a ratchet. 437 call sites still write text-[10px] or
 * text-[11px] instead of the token that means the same thing. Converting them
 * in one pass is not provably safe: an arbitrary value sets font-size ONLY,
 * while the token also sets line-height, so a swap can reflow multi-line text.
 * That is a per-site judgement, not a rename. So the count is pinned: it may
 * fall freely, any rise fails, and new code uses the tokens.
 */
const root = resolve(__dirname, "..")
/** Any arbitrary pixel font-size, e.g. text-[11px]. */
const ARBITRARY_PX = /text-\[(\d+(?:\.\d+)?)px\]/g
/** The documented floor, in px. Mirrors the --text-3xs comment in globals.css. */
const FLOOR_PX = 10
/**
 * Arbitrary sizes that duplicate a named step and so are pure noise. Pinned with
 * the rest rather than called out separately; listed here to document intent.
 *   10px → text-3xs   11px → text-2xs   12px → text-xs
 */
/**
 * The backlog this number represented is gone.
 *
 * It was 474 when first pinned and 440 when the ratchet last moved, and every
 * one of those was a call site the tokens above were built to serve and never
 * reached. 419 of them were exactly 11px, 10px and 12px, which are text-2xs,
 * text-3xs and text-xs; another 24 were 13px, which is not a step on any scale
 * and is now text-sm.
 *
 * A ratchet is not a migration. Holding a number still stops things getting
 * worse and never makes them better, and the product went on rendering the same
 * caption at three sizes on three surfaces the whole time it was held.
 *
 * 1 remains: an emoji glyph sized at 18px, which is a picture rather than type
 * and has no business on a type scale.
 */
const BYPASS_BASELINE = 1
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue
      walk(full, out)
      // Test files are excluded: this measures PRODUCT code, and a test that
      // asserts "no arbitrary pixel size is used" necessarily contains the
      // pattern as a regex literal, which would otherwise count as a usage.
      // eyebrow.test.tsx tripped exactly that.
    } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      out.push(full)
    }
  }
  return out
}
const files = [...walk(resolve(root, "components")), ...walk(resolve(root, "app"))]
/**
 * Comments are stripped before counting.
 *
 * Not a nicety — this test was red because of it. components/ui/eyebrow.tsx
 * exists to replace hand-written labels, and its doc comment enumerates the sizes
 * it replaces ("text-xs, text-[10px], text-[11px]"). Those literals counted as
 * three usages, so introducing the fix for the problem tripped the guard against
 * the problem.
 *
 * The same thing happened to the error-state ordering test, which matched the
 * "!isError" inside a comment explaining why !isError was needed. A source-reading
 * test that cannot tell code from prose will eventually measure prose.
 */
function stripComments(source: string): string {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ") // {/* jsx */}
    .replace(/\/\*[\s\S]*?\*\//g, " ") // /* block */
    .replace(/^\s*\/\/.*$/gm, " ") // whole-line //
    .replace(/([^:"'`\\])\/\/[^\n"'`]*$/gm, "$1") // trailing //
}
function sizesIn(source: string): number[] {
  return [...stripComments(source).matchAll(ARBITRARY_PX)].map((m) => parseFloat(m[1]))
}
describe("dense type scale", () => {
  it("declares both named steps, with a line-height for each", () => {
    const css = readFileSync(resolve(root, "app/globals.css"), "utf8")
    for (const token of ["2xs", "3xs"]) {
      expect(css, `--text-${token} must be declared`).toMatch(
        new RegExp(`--text-${token}:`),
      )
      // Without an explicit line-height the token inherits whatever the parent
      // had, which is the exact inconsistency the scale exists to remove.
      expect(css, `--text-${token}--line-height must be declared`).toMatch(
        new RegExp(`--text-${token}--line-height:`),
      )
    }
  })

  it("keeps the 10px floor absolutely — no allowance, no baseline", () => {
    const offenders: string[] = []
    for (const file of files) {
      const rel = file.slice(root.length + 1)
      for (const px of sizesIn(readFileSync(file, "utf8"))) {
        if (px < FLOOR_PX) offenders.push(`${rel}: text-[${px}px]`)
      }
    }
    expect(
      offenders,
      `Type below ${FLOOR_PX}px is not readable. Use text-3xs (10px), the floor.`,
    ).toEqual([])
  })

  it("does not grow the number of call sites bypassing the named tokens", () => {
    const total = files.reduce((n, f) => n + sizesIn(readFileSync(f, "utf8")).length, 0)
    expect(
      total,
      `Arbitrary pixel font sizes went UP (${total} > ${BYPASS_BASELINE}). ` +
        "Use text-3xs (10px), text-2xs (11px), or text-xs (12px) instead of an " +
        "arbitrary value, and lower the baseline when you convert existing ones.",
    ).toBeLessThanOrEqual(BYPASS_BASELINE)
  })
})

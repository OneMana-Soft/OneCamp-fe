import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Four radii (design direction of 10 Oct 2026, "Radius"):
 *   4  chips, kbd, checkboxes          rounded-sm
 *   6  buttons, inputs, nav items      rounded-md (and bare `rounded`)
 *   10 cards, popovers, menus, panel   rounded-lg, rounded-xl
 *   14 dialogs and sheets              rounded-2xl, rounded-3xl
 * and rounded-full for avatars and status dots only.
 *
 * Six radii were in heavy use before, which is how one screen ended up with
 * three slightly different corners side by side. The scale is made in
 * globals.css from one number; this pins that mapping, and ratchets the two
 * classes that most often stray: rounded-2xl on something that is not a dialog
 * or sheet, and rounded-full on something that is not an avatar or a dot. Both
 * counts may fall freely; a rise fails, so a new pill or a rounder card is a
 * decision someone has to make on purpose.
 */
const root = resolve(__dirname, "..")
const css = readFileSync(resolve(root, "app/globals.css"), "utf8")

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue
      walk(full, out)
    } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      out.push(full)
    }
  }
  return out
}
const files = [...walk(resolve(root, "components")), ...walk(resolve(root, "app"))]
const count = (re: RegExp) => files.reduce((n, f) => n + (readFileSync(f, "utf8").match(re) || []).length, 0)

/** rounded-2xl uses on 10 Oct 2026: dialogs, sheets, the phone's drawers and a few cards. */
const ROUNDED_2XL_BASELINE = 57
/** rounded-full uses on 10 Oct 2026: avatars and dots, and pills still to retire. */
const ROUNDED_FULL_BASELINE = 384

describe("radius scale", () => {
  it("derives four steps from a 6px --radius", () => {
    expect(css).toMatch(/--radius:\s*0\.375rem;/)
    const theme = css.slice(css.indexOf("@theme inline {"), css.indexOf("\n}", css.indexOf("@theme inline {")))
    expect(theme).toMatch(/--radius-sm:\s*calc\(var\(--radius\) - 2px\);/)
    expect(theme).toMatch(/--radius-md:\s*var\(--radius\);/)
    expect(theme).toMatch(/--radius-lg:\s*calc\(var\(--radius\) \+ 4px\);/)
    expect(theme).toMatch(/--radius-xl:\s*calc\(var\(--radius\) \+ 4px\);/)
    expect(theme).toMatch(/--radius-2xl:\s*calc\(var\(--radius\) \+ 8px\);/)
  })

  it("has no rounded-3xl: there is no fifth step", () => {
    expect(count(/(?<![-\w])rounded-3xl\b/g)).toBe(0)
  })

  it("does not add rounded-2xl outside dialogs and sheets", () => {
    const n = count(/(?<![-\w])rounded-2xl\b/g)
    expect(n, `rounded-2xl went up (${n} > ${ROUNDED_2XL_BASELINE}). A card is rounded-lg; 14px is for dialogs and sheets.`).toBeLessThanOrEqual(ROUNDED_2XL_BASELINE)
  })

  it("does not add rounded-full beyond avatars and dots", () => {
    const n = count(/(?<![-\w])rounded-full\b/g)
    expect(n, `rounded-full went up (${n} > ${ROUNDED_FULL_BASELINE}). A status or tag is a dot and text; a chip is rounded-sm.`).toBeLessThanOrEqual(ROUNDED_FULL_BASELINE)
  })
})

import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

/**
 * The radii of design v3 (11 Oct 2026, "Spacing, density and radii"):
 *   4  kbd                                              rounded-xs
 *   6  chips, xs buttons, small icon buttons            rounded-sm
 *   8  buttons, inputs, nav rows, menu items            rounded-md (was 6)
 *   12 cards, menus, popovers, the composer, the sheet  rounded-lg, rounded-xl (was 10)
 *   16 dialogs, the Home guide, pricing cards           rounded-2xl (was 14)
 *   20 the storefront's canvas, never in the app        rounded-3xl
 * and rounded-full for avatars (people), pills and badges. 8px controls are
 * what the premium set agrees on (Notion, Superhuman, Arc, Plane, Raycast);
 * 6px read as the shadcn default. Concentric: a 4px-padded r12 menu has r8
 * items.
 *
 * The scale is made in globals.css from one number; this pins that mapping,
 * and ratchets the two classes that most often stray: rounded-2xl on something
 * that is not a dialog or sheet, and rounded-full on something that is not an
 * avatar or a dot. Both counts may fall freely; a rise fails, so a new pill or
 * a rounder card is a decision someone has to make on purpose.
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

/** rounded-2xl uses: dialogs, sheets, the phone's drawers and a few cards. 57 on 10 Oct 2026, 35 after the wave 2 admin pass, 28 counted when wave 2 was merged, 25 after its QA pass; the v3 hub's Home guide and setup checklist wells at r16 (hub.md H5, H6), and the v3 work wave's update feature card, client view sheet and feature card, and the public form's sent card (work.md W27, W51, W46). 31 measured when the v3 waves were merged (11 Oct), the union of both waves' reasons. 29 with the admin wave, whose dialogs, confirms and sheets write rounded-[16px]. */
const ROUNDED_2XL_BASELINE = 29
/** rounded-full uses: avatars and dots, and pills still to retire. 384 on 10 Oct 2026, 297 after the wave 2 admin pass, 285 counted when wave 2 was merged, 256 after its QA pass, 281 with the v3 AI, Activity and Home dots (hub.md §9, A2, A3, A6, H9, H13), 257 in the v3 work wave (W27's health dot); 253 measured when the v3 waves were merged (11 Oct): the chat and work waves retired more pills than the hub added. 263 with the admin wave (measured at its merge): status dots on system checks, webhooks, imports, default channels and evals, round skeletons for rings and avatars, the settings rail's dots, and the guest channel's day and load pills. 262 once the More sheet's theme colours drew one circle each, not a circle in a round target. */
const ROUNDED_FULL_BASELINE = 262

describe("radius scale", () => {
  it("derives the steps from an 8px --radius", () => {
    expect(css).toMatch(/--radius:\s*0\.5rem;/)
    const theme = css.slice(css.indexOf("@theme inline {"), css.indexOf("\n}", css.indexOf("@theme inline {")))
    expect(theme).toMatch(/--radius-xs:\s*calc\(var\(--radius\) - 4px\);/)
    expect(theme).toMatch(/--radius-sm:\s*calc\(var\(--radius\) - 2px\);/)
    expect(theme).toMatch(/--radius-md:\s*var\(--radius\);/)
    expect(theme).toMatch(/--radius-lg:\s*calc\(var\(--radius\) \+ 4px\);/)
    expect(theme).toMatch(/--radius-xl:\s*calc\(var\(--radius\) \+ 4px\);/)
    expect(theme).toMatch(/--radius-2xl:\s*calc\(var\(--radius\) \+ 8px\);/)
    expect(theme).toMatch(/--radius-3xl:\s*calc\(var\(--radius\) \+ 12px\);/)
  })

  it("has no rounded-3xl in the app: 20px is the storefront's canvas", () => {
    expect(count(/(?<![-\w])rounded-3xl\b/g)).toBe(0)
  })

  it("does not add rounded-2xl outside dialogs and sheets", () => {
    const n = count(/(?<![-\w])rounded-2xl\b/g)
    expect(n, `rounded-2xl went up (${n} > ${ROUNDED_2XL_BASELINE}). A card is rounded-lg; 16px is for dialogs and sheets.`).toBeLessThanOrEqual(ROUNDED_2XL_BASELINE)
  })

  // Design v3 (admin §8 H2, H3, H5): dialogs, confirms and the right sheet
  // write their 16px as rounded-[16px], which the rounded-2xl ratchet
  // doesn't count, so pin it on the primitives themselves.
  it("gives dialogs, confirms and sheets the 16px radius", () => {
    for (const file of ["components/ui/dialog.tsx", "components/ui/alert-dialog.tsx", "components/ui/sheet.tsx"]) {
      const src = readFileSync(resolve(root, file), "utf8")
      expect(src, file).toMatch(/rounded-(?:l-|t-)?\[16px\]/)
      expect(src, file).not.toMatch(/(?<![-\w])rounded-2xl\b/)
    }
  })

  it("does not add rounded-full beyond avatars and dots", () => {
    const n = count(/(?<![-\w])rounded-full\b/g)
    expect(n, `rounded-full went up (${n} > ${ROUNDED_FULL_BASELINE}). A status or tag is a dot and text; a chip is rounded-sm.`).toBeLessThanOrEqual(ROUNDED_FULL_BASELINE)
  })
})

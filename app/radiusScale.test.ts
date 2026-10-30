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
/** rounded-full uses: avatars and dots, and pills still to retire. 384 on 10 Oct 2026, 297 after the wave 2 admin pass, 285 counted when wave 2 was merged, 256 after its QA pass, 281 with the v3 AI, Activity and Home dots (hub.md §9, A2, A3, A6, H9, H13), 257 in the v3 work wave (W27's health dot); 253 measured when the v3 waves were merged (11 Oct): the chat and work waves retired more pills than the hub added. 263 with the admin wave (measured at its merge): status dots on system checks, webhooks, imports, default channels and evals, round skeletons for rings and avatars, the settings rail's dots, and the guest channel's day and load pills. 262 once the More sheet's theme colours drew one circle each, not a circle in a round target. 264 with the critic pass (12 Oct): the phone project list's skeleton rows draw the status ring round (work), and the guest frame's "Made with OneCamp" is the spec's 28 px pill (G1, r14). 266 with the shell's demo splash: two faces in the team's orbit (L1). 267 with the docs' callout, whose kinds show as a bar of dots on hover (B2, content.md D11). 268 with the doc comments' unread dot (B7), one component for the thread card, the phone's row and the margin's marker. 268, counted when the tables fixes met beta (15 Oct: beta 266, and 2 with a table's calendar on a phone (PG2-11): a dot per row on each day, three at most, and the day's number in a circle that rings today, as the Calendar's agenda draws it). 269 with the event card's answer marks (calendar A2, STEP4_PLAN §4 #5): a 12 px dot at a guest's face, moss, sun or danger, one component for the card, the panel and the folded list. 270 when the calendar's B1v and the boards' W-1b met (22 Oct: beta counted 268, and each added one dot): a calendar's hue dot beside each calendar an import went into (the import dialog's result), and the sticky tool's 6 px dot on the selected note colour. 271 with the calendar's danger dot on the closed Calendars button while Google needs connecting again (C9, 23 Oct). 273 with the tables (24 Oct): the saved dot held beside a table's name while its chunk loads, and a face among the participants that is a button, so a table's presence can take you to someone's cell (the tables' loading lines, pills at first, take the skeleton's rounded-md). 274 with a call's raised hand (calls CALLS-3a): the amber pill with its place in the queue, one component (HandBadge) for the tile and the People row, approved by DESIGN-BUILD-3 (20 Oct). 273 with HU13 (calls): the call's People list draws faces with IdentityMark, one rounded-full fewer. 274 with a call's quality note (calls A5, #56): a 6 px amber dot before "Weak connection", "Computer struggling" or "Video freezing" on a People row, for whoever runs the call (DESIGN-BUILD-5 passed it, png-quality-1624). 279 with Docs & Files (docs F1b, 22 Oct; five more, counted at its merge on 24 Oct): a row's colour dot, Colour's round swatch and the bulk bar's hue wheel (design review, 21 Oct: a colour shows round), a file mark's corner badge, and the pill that says where dropped files will go; its bars, slashes and badge draw rounded-sm. 235 in this repository, which leaves out the demo's own screens. */
const ROUNDED_FULL_BASELINE = 235

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

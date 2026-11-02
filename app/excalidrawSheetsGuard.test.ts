import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { EXCALIDRAW_FAMILIES, EXCALIDRAW_NOT_SHOWN, EXCALIDRAW_SHEETS } from "@/components/board/excalidrawSheets"
import { overlayRoots } from "@/lib/testing/overlayRoots"

/** The Excalidraw every overlay in components/board/excalidrawSheets was opened at 390 on. */
const EXCALIDRAW_CHECKED = "0.18.1"

/**
 * EVERY EXCALIDRAW OVERLAY IS A SHEET ON A PHONE (miro-40 H1; main, 2 Nov 12:5x).
 *
 * Where useSheetMode holds, the board docks Excalidraw's own overlays (its
 * menus, popovers, dialogs and sidebar) as the app's sheet
 * (components/ui/foreignSheets). Their roots are Excalidraw's class names, and
 * an upgrade may rename one: that overlay would silently fall out of the sheet
 * rule and float on a phone again. So:
 *   1. The list was checked against one Excalidraw version, opening each
 *      overlay at 390. Any other installed version FAILS here until someone
 *      re-checks the list and moves EXCALIDRAW_CHECKED.
 *   2. Every class the list docks is in that version's stylesheet, or on an
 *      overlay root its bundle draws (the font list's has no rule of its own).
 *   3. Every overlay family is docked or named as never shown on the board,
 *      with the reason, and none is both.
 *   4. Every overlay root the installed bundle draws (each Popover.Content,
 *      element with role="dialog" and portal: lib/testing/overlayRoots) is
 *      docked, by a class on it or on its own surface, or named by a class on
 *      it. The families of 3 are found by hand, and a hand missed two roots:
 *      the arrowheads' picker and the font list (CR-185's N1, 2 Nov).
 */

const ROOT = join(__dirname, "..")
const PKG = join(ROOT, "node_modules/@excalidraw/excalidraw")
const installed: string = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")).version
const stylesheet = readFileSync(join(PKG, "dist/prod/index.css"), "utf8")
const hasClass = (name: string) => new RegExp(`\\.${name.replace(/[-]/g, "\\-")}(?![\\w-])`).test(stylesheet)
// The readable build, the same source as the one the app ships: read as the file is collected, never on a test's clock.
const DEV = join(PKG, "dist/dev")
const roots = readdirSync(DEV)
  .filter((f) => f.endsWith(".js"))
  .flatMap((f) => overlayRoots(readFileSync(join(DEV, f), "utf8"), f))
const docked = new Set(EXCALIDRAW_SHEETS.flatMap((s) => s.classes))

describe("every Excalidraw overlay is a sheet on a phone", () => {
  it("was checked against the installed Excalidraw", () => {
    expect(installed, `Excalidraw is ${installed}; open each overlay at 390, re-check components/board/excalidrawSheets, then move EXCALIDRAW_CHECKED`).toBe(EXCALIDRAW_CHECKED)
  })

  it("docks only classes the installed Excalidraw has, in its stylesheet or on an overlay root it draws, its roots and its rows of actions", () => {
    const onRoots = new Set(roots.flatMap((r) => [...r.classes, ...r.inside]))
    const missing = EXCALIDRAW_SHEETS.flatMap((s) => [...s.classes, ...(s.actions ?? [])].filter((c) => !hasClass(c) && !onRoots.has(c)).map((c) => `${s.name}: .${c}`))
    expect(missing).toEqual([])
    for (const s of EXCALIDRAW_SHEETS) expect(s.classes.length, `${s.name} names its classes`).toBeGreaterThan(0)
  })

  it("docks every overlay family, or says why the board never shows it", () => {
    const loose = EXCALIDRAW_FAMILIES.filter((f) => !docked.has(f) && !(f in EXCALIDRAW_NOT_SHOWN))
    const both = Object.keys(EXCALIDRAW_NOT_SHOWN).filter((f) => docked.has(f))
    expect(loose).toEqual([])
    expect(both).toEqual([])
    for (const f of EXCALIDRAW_FAMILIES) expect(hasClass(f), `.${f} is in the installed stylesheet`).toBe(true)
    for (const [f, why] of Object.entries(EXCALIDRAW_NOT_SHOWN)) expect(why.length, `.${f} says why`).toBeGreaterThan(10)
    const known = new Set([...EXCALIDRAW_FAMILIES, ...roots.flatMap((r) => r.classes)])
    expect(Object.keys(EXCALIDRAW_NOT_SHOWN).filter((f) => !known.has(f)), "a reason for an overlay the installed Excalidraw doesn't draw").toEqual([])
  })

  it("docks every overlay root the installed Excalidraw draws, or says why the board never shows it", () => {
    for (const kind of ["Popover.Content", 'role="dialog"', "createPortal"]) expect(roots.some((r) => r.where.includes(kind)), `the scan reads the bundle's ${kind}`).toBe(true)
    const loose = roots.filter((r) => !r.classes.some((c) => docked.has(c) || c in EXCALIDRAW_NOT_SHOWN) && !r.inside.some((c) => docked.has(c)))
    expect(loose.map((r) => `${r.where}: .${r.classes.join(" .")}`)).toEqual([])
  })
})

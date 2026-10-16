import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Dialogs keep their edges.
 *
 *   - The v3 footer (DialogFooter, app/styles/admin/feedback.css) bleeds out
 *     by --dlg-pad to run edge to edge, on the promise that --dlg-pad is the
 *     dialog's padding (20 px). A dialog that drops its padding (p-0) and
 *     still uses the footer must say so with [--dlg-pad:0px]: the new-event
 *     dialog didn't, and its Create event button sat 20 px outside the
 *     dialog, cut off at the bottom and the right.
 *   - Every dialog is capped at 85dvh (components/ui/dialog.tsx). One that
 *     asks for the whole screen (!h-dvh) must also lift the cap
 *     (max-h-none): the file lightbox stopped at 85 % of the screen, the page
 *     showing under a light scrim along the bottom.
 */

const ROOT = process.cwd()
function files(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) files(p, out)
    else if (/\.tsx$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(p)
  }
  return out
}

/**
 * The className of every <DialogContent …> opening tag in a source file. A
 * class can hold ">" ([&>button]:hidden), so the tag isn't cut at the first
 * one: the className is read from the tag's start, before any other element.
 */
function dialogClasses(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/<DialogContent\b/g)) {
    const rest = src.slice(m.index! + m[0].length, m.index! + 1200)
    const tagEnd = rest.search(/\n\s*>|\/>|>\s*\n/)
    const head = tagEnd < 0 ? rest : rest.slice(0, tagEnd + 2)
    const cls = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{cn\(([\s\S]*?)\)\})/.exec(head)
    if (cls) out.push(cls[1] ?? cls[2] ?? cls[3] ?? "")
  }
  return out
}

const SOURCES = [...files(join(ROOT, "components")), ...files(join(ROOT, "app"))].map((p) => ({ path: relative(ROOT, p), src: readFileSync(p, "utf8") }))

describe("dialog edges", () => {
  it("a padding-less dialog with the v3 footer zeroes --dlg-pad", () => {
    const bad: string[] = []
    for (const { path, src } of SOURCES) {
      if (!/<DialogFooter\b/.test(src)) continue
      for (const cls of dialogClasses(src)) {
        if (/(^|[\s"'`])!?p-0(\s|$|["'`])/.test(cls) && !/\[--dlg-pad:0(px)?\]/.test(cls)) bad.push(path)
      }
    }
    expect(bad).toEqual([])
  })

  it("the new-event dialog is one of them", () => {
    const src = readFileSync(join(ROOT, "components/calendar/createCalendarEventDialog.tsx"), "utf8")
    expect(dialogClasses(src).some((c) => c.includes("[--dlg-pad:0px]"))).toBe(true)
  })

  it("a full-screen dialog lifts the 85dvh cap", () => {
    const full: string[] = []
    const bad: string[] = []
    for (const { path, src } of SOURCES) {
      for (const cls of dialogClasses(src)) {
        if (!/!h-dvh\b/.test(cls)) continue
        full.push(path)
        if (!/!?max-h-none/.test(cls)) bad.push(path)
      }
    }
    expect(bad).toEqual([])
    // The file lightbox (content and chat found it) and the recording
    // player's full screen, which had the same cap.
    expect(full).toEqual(expect.arrayContaining(["components/dialog/attachmentLightboxDialog.tsx", "components/dialog/RecordingPlayerDialog.tsx"]))
  })

  it("still caps every other dialog: the cap is the surface's, on purpose", () => {
    expect(readFileSync(join(ROOT, "components/ui/dialog.tsx"), "utf8")).toContain("max-h-[85dvh]")
  })
})

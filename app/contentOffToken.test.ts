import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"
import { sourceFiles } from "@/lib/testing/sourceFiles"

/**
 * No off-token colour in the content area (content.md §1.4 and §1.6.2): file
 * glyphs, the editor, the docs AI panel, the calendar, tables and boards draw
 * from the camp hues and the v3 inks, never a raw Tailwind palette step, the
 * stock AI indigo, Excalidraw's violet, or the destructive red for a now line.
 */

const ROOT = process.cwd()
const SCOPE = ["components/fileIcon", "components/minimal-tiptap", "components/calendar", "components/table", "components/board"]

// The edition without AI has no components/ai, so no doc AI files to check.
const docAi: string[] = []

const RAW = /\b(?:text|bg|border|ring|fill|stroke)-(?:orange|blue|purple|green|red|indigo|violet|gray|yellow|amber|pink)-\d{2,3}\b/
const INDIGO = /rgba\(\s*99\s*,\s*102\s*,\s*241/
const EXCALIDRAW_VIOLET = /#6965db/i
const EMOJI_WARNING = /⚠️/

describe("content area colours", () => {
  it("uses no raw palette steps, stock AI indigo or Excalidraw violet", () => {
    const bad: string[] = []
    for (const f of sourceFiles([...SCOPE, ...docAi], /\.(tsx?|css)$/)) {
      const rel = relative(ROOT, f)
      const src = readFileSync(f, "utf8")
      for (const re of [RAW, INDIGO, EXCALIDRAW_VIOLET, EMOJI_WARNING]) {
        const m = re.exec(src)
        if (m) bad.push(`${rel}: ${m[0]}`)
      }
    }
    expect(bad).toEqual([])
  })

  it("draws the now line in the brand, not the destructive red", () => {
    const week = readFileSync(join(ROOT, "components/calendar/weekView.tsx"), "utf8")
    expect(week).not.toMatch(/\bbg-destructive\b/)
  })

  it("has dropped the legacy collaborator caret rules", () => {
    const globals = readFileSync(join(ROOT, "app/globals.css"), "utf8")
    expect(globals).not.toMatch(/collaboration-cursor__label[^{]*\{[^}]*text-transform:\s*uppercase/)
  })

  it("retires the legacy DateAndTimePicker", () => {
    const users = sourceFiles(["app", "components"], /\.(tsx?|css)$/).filter((f) => {
      const src = readFileSync(f, "utf8")
      return /from\s+["'][^"']*dateAndTimePicker[^"']*["']/.test(src)
    })
    expect(users.map((f) => relative(ROOT, f))).toEqual([])
  })
})

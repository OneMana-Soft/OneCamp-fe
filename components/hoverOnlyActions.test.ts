import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

// No action is hover-only. Tailwind 4 applies hover: and group-hover: only
// where the device can hover, so a control hidden until hover is never shown
// on a phone or a tablet, and most of them were also pointer-events-none
// until hover: on an iPad there was no way to remove someone's access to a
// doc, delete a table, a recording or a saved view, or reply to a message.
//
// A class list that hides an element and reveals it on hover must reveal it
// on touch too: [@media(hover:none)]:opacity-100 (and pointer-events-auto),
// or gate its hiding on [@media(hover:hover)]. Decoration that only echoes a
// visible control is listed below with its reason.

const ROOTS = ["components", "app"]

const REVEAL = /group-hover(?:\/[\w-]+)?:(?:opacity-100|visible|block|flex|inline-flex|inline-block|grid|pointer-events-auto)|(?<![\w:-])hover:opacity-100/
const HIDE = /(?:^|\s)(?:(?:sm|md|lg|xl):)?(?:opacity-0|invisible|hidden|pointer-events-none)(?=\s|$)/
const TOUCH = /\[@media\(hover:none\)\]:|\[@media\(hover:hover\)\]:(?:group-hover|opacity-0|pointer-events-none|invisible)|pointer-coarse:/

/** Hover-only on purpose: decoration beside a control that is always there. */
const ALLOWED: Array<[file: string, snippet: string, why: string]> = [
  ["components/task/taskRowParts.tsx", "inline-block shrink-0 rounded-full border border-dashed border-line-3 opacity-0", "an empty assignee's ring, decoration; the panel assigns"],
  ["components/ai/AiScheduleDialog.tsx", "shrink-0 text-2xs text-muted-foreground opacity-0", "a check glyph on a slot row, which is the button"],
  ["components/ai/RescheduleDialog.tsx", "shrink-0 opacity-0 pointer-events-none transition-opacity", "a check glyph on a slot row, which is the button"],
  ["components/message/continuedGutter.tsx", "absolute right-0 top-0 whitespace-nowrap", "the time of a continued message, also in the row's title and a screen reader's text; a phone shows it in the action sheet (C08)"],
  ["components/attachments/videoPlayer.tsx", "w-20 hidden group-hover:block", "the volume slider; a phone's volume is its buttons"],
  ["components/fileUpload/AudioPlayer.tsx", "w-20 hidden group-hover:block", "the volume slider; a phone's volume is its buttons"],
  ["components/project/timeline/TimelineBar.tsx", "cursor-crosshair", "the drag handle for a dependency, a pointer gesture"],
  ["components/project/ProjectsOverview.tsx", "opacity-0 group-hover/h:opacity-100", "a sort chevron on a column header, which is the button"],
  ["components/task/TaskCheck.tsx", "pointer-events-none absolute inset-0 opacity-0", "a pointer's preview of the check on the status glyph, which is the button"],
  // These two message toolbars appear on the message a touch taps (hooks/useTouchReveal).
]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return files(p)
    return p.endsWith(".tsx") && !p.includes(".test.") ? [p] : []
  })
}

function hoverOnly(): string[] {
  const found: string[] = []
  for (const file of ROOTS.flatMap(files)) {
    const src = readFileSync(file, "utf8")
    const rel = relative(process.cwd(), file)
    for (const m of src.matchAll(/"([^"\n]{0,600})"|`([^`]{0,800})`/g)) {
      const cls = m[1] ?? m[2] ?? ""
      if (!REVEAL.test(cls) || !HIDE.test(cls) || TOUCH.test(cls)) continue
      if (ALLOWED.some(([f, snippet]) => f === rel && cls.includes(snippet))) continue
      const line = src.slice(0, m.index).split("\n").length
      found.push(`${rel}:${line}  ${cls.slice(0, 90)}`)
    }
  }
  return found
}

describe("no action is hover-only", () => {
  it("reveals every hover-revealed control on touch screens too", () => {
    const found = hoverOnly()
    expect(found, `hover-only on a phone or tablet; add [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto:\n${found.join("\n")}`).toEqual([])
  })

  it("keeps the allowances current", () => {
    for (const [file, snippet, why] of ALLOWED) {
      expect(readFileSync(file, "utf8").includes(snippet), `${file} no longer has "${snippet}" (${why}); drop the allowance`).toBe(true)
    }
    for (const file of ["components/message/baseMessageCard.tsx", "components/rightPanel/messageContent.tsx"]) {
      expect(readFileSync(file, "utf8"), file).toMatch(/useTouchReveal\(\)[\s\S]*onPointerUp=\{touchReveal\.onPointerUp\}[\s\S]*touchReveal\.revealed/)
    }
  })
})

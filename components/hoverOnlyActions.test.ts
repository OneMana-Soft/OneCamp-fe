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
  ["components/banner/DemoGuide.tsx", "pointer-events-none h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0", "an arrow echoing the row, which is the link"],
  ["components/home/SetupChecklist.tsx", "h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0", "an arrow echoing the row, which is the link"],
  ["components/ai/ConnectorSearchResults.tsx", "mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0", "an external-link glyph on a row that is the link"],
  ["components/ai/SearchAnswer.tsx", "h-3 w-3 shrink-0 text-muted-foreground opacity-0", "an external-link glyph on a row that is the link"],
  ["components/ai/AiScheduleDialog.tsx", "shrink-0 text-2xs text-muted-foreground opacity-0", "a check glyph on a slot row, which is the button"],
  ["components/ai/RescheduleDialog.tsx", "shrink-0 opacity-0 pointer-events-none transition-opacity", "a check glyph on a slot row, which is the button"],
  ["components/message/messageReplyCount.tsx", "md:inline opacity-0", "a chevron on the reply count, which is the link"],
  ["components/message/continuedGutter.tsx", "-mr-1.5 block whitespace-nowrap", "the time of a continued message, also in the row's title"],
  ["components/navigationBar/desktop/desktopSideNavigationBar.tsx", "rotate-90 opacity-0", "the section's chevron; the label folds it"],
  ["components/ai/DocAiAssistantPanel.tsx", "bg-[radial-gradient", "a hover glow"],
  ["components/dialog/editProfileDailog.tsx", "bg-black/40 opacity-0", "a pointer's shortcut to the Upload button beside it"],
  ["components/attachments/videoPlayer.tsx", "w-20 hidden group-hover:block", "the volume slider; a phone's volume is its buttons"],
  ["components/fileUpload/AudioPlayer.tsx", "w-20 hidden group-hover:block", "the volume slider; a phone's volume is its buttons"],
  ["components/project/timeline/TimelineBar.tsx", "cursor-crosshair", "the drag handle for a dependency, a pointer gesture"],
  // These two message toolbars appear on the message a touch taps (hooks/useTouchReveal).
  ["components/rightPanel/messageContent.tsx", "opacity-0 pointer-events-none group-hover:opacity-100", "shown on tap by useTouchReveal"],
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

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Design v3, shell A1: the 48px top bar is gone, and each of the eight
// controls it held has a new home. The sheet runs 8px from the frame's edges.

const root = join(__dirname, "..", "..")
const read = (f: string) => readFileSync(join(root, f), "utf8")
const NAV = read("components/navigationBar/desktop/desktopNavigationBar.tsx")
const HEADER = read("components/navigationBar/desktop/SidebarHeader.tsx")
const SEARCH = read("components/navigationBar/desktop/SidebarSearchRow.tsx")
const FOOT = read("components/navigationBar/desktop/SidebarFoot.tsx")
const LAYOUT = read("app/app/LayoutContent.tsx")
const SPLIT = read("components/split/SplitPane.tsx")

function sources(dir: string, acc: string[] = []): string[] {
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs")
  for (const e of readdirSync(join(root, dir))) {
    if (e === "node_modules" || e.startsWith(".")) continue
    const p = `${dir}/${e}`
    if (statSync(join(root, p)).isDirectory()) sources(p, acc)
    else if (/\.tsx?$/.test(e) && !/\.test\./.test(e)) acc.push(p)
  }
  return acc
}

describe("the shell without a top bar", () => {
  it("renders no top bar, and its files are gone", () => {
    for (const f of ["desktopNavigationTopBar", "desktopNavigationSearch", "desktopNavigationOrgProfile", "desktopNavigationUserProfile"]) {
      expect(existsSync(join(root, `components/navigationBar/desktop/${f}.tsx`)), f).toBe(false)
    }
    const importers = ["app", "components", "hooks", "lib"].flatMap((d) => sources(d)).filter((f) => /desktopNavigation(TopBar|Search)/.test(read(f)))
    expect(importers).toEqual([])
  })

  it("gives each of the top bar's eight controls a home", () => {
    // 1 the logo: the workspace mark opens the workspace menu; Home is its row.
    expect(HEADER).toMatch(/aria-label=\{`\$\{name\} workspace menu`\}/)
    // 2 the inline search: the pill opens ⌘K, the one click opener.
    expect(SEARCH).toMatch(/data-palette-trigger=""/)
    expect(SEARCH).toMatch(/openPalette\(\{ mode: "search" \}\)/)
    // 3 the focus pill: in the focused pane's own bar, or the main sheet's corner.
    expect(SPLIT).toMatch(/<FocusPill \/>/)
    expect(LAYOUT).toMatch(/focused === -1[\s\S]{0,200}<FocusPill \/>/)
    // 4 the AI toggle: the spark beside the pill, behind FEATURE_AI.
    expect(SEARCH).toMatch(/<FeatureGate feature=\{FEATURE_AI\}>[\s\S]*aria-label="Ask OneCamp AI"/)
    // 5 the bell: retired into Inbox's badge and its From OneCamp AI group.
    expect(["app", "components"].flatMap((d) => sources(d)).filter((f) => /NudgeBell/.test(read(f)))).toEqual([])
    // 6 the connection dot: the foot pill.
    expect(NAV).toMatch(/<FootPill \/>/)
    // 7 the status: the foot's status line and the profile menu's field.
    expect(FOOT).toMatch(/Set a status/)
    // 8 the avatar menu: the foot, named as before.
    expect(FOOT).toMatch(/aria-label="Profile and settings"/)
  })

  it("puts the sheet 8px from the frame's edges, and every sheet on the e-sheet ladder at r12", () => {
    expect(NAV).toMatch(/data-shell-main=""[^>]*py-2 pr-2/)
    expect(LAYOUT).toMatch(/"app-sheet relative flex h-full flex-col overflow-hidden"/)
    const css = read("app/globals.css")
    const sheet = css.slice(css.indexOf(".app-sheet {"), css.indexOf("}", css.indexOf(".app-sheet {")))
    expect(sheet).toMatch(/border-radius:\s*var\(--radius-lg\)/)
    expect(sheet).toMatch(/box-shadow:\s*var\(--e-sheet\)/)
    expect(sheet).not.toMatch(/border:/)
  })

  it("paints the frame, never the theme's wash, behind the sidebar", () => {
    expect(NAV).toMatch(/className="app-frame flex h-dvh/)
    const css = read("app/globals.css")
    const frame = css.slice(css.indexOf(".app-frame {"), css.indexOf("}", css.indexOf(".app-frame {")))
    expect(frame).toMatch(/background:\s*var\(--frame\)/)
    expect(frame).not.toMatch(/brand-wash/)
  })
})

// V1 and V2: the right panel and split panes are sheets of their own, with
// the 8px seam between that is also the handle.
describe("sheets beside the page", () => {
  it("draws the right panel on its own sheet, 452px by default, with no 1px divider", () => {
    expect(LAYOUT).toMatch(/data-right-panel-sheet=""[\s\S]{0,200}"app-sheet shell-panel-sheet/)
    expect(LAYOUT).not.toMatch(/bg-border/)
    expect(read("lib/ui/rightPanelSize.ts")).toMatch(/RIGHT_PANEL_DEFAULT_PX = 452/)
    expect(LAYOUT).toMatch(/className=\{cn\("shell-seam"/)
  })

  it("marks the split view the keys act on with the brand top edge, not a 2px inset bar", () => {
    expect(SPLIT).toMatch(/active && "shell-sheet-focused"/)
    expect(SPLIT + LAYOUT).not.toMatch(/shadow-\[inset_0_2px/)
    expect(read("app/globals.css")).toMatch(/\.shell-sheet-focused \{ box-shadow: var\(--e-sheet\), inset 0 1\.5px 0 var\(--brand\); \}/)
  })

  it("enters on transform and never animates a width", () => {
    const css = read("app/globals.css")
    expect(css).toMatch(/@keyframes shell-panel-in \{ from \{ opacity: 0; transform: translateX\(16px\); \} \}/)
  })
})

// M3: one tooltip provider, 500ms for the first, neighbours at once.
describe("tooltips in the shell", () => {
  it("are timed once, at the root, with no instant tooltip anywhere", () => {
    expect(read("app/app/ClientProviders.tsx")).toMatch(/<TooltipProvider delayDuration=\{500\} skipDelayDuration=\{300\}>/)
    const instant = ["app", "components"].flatMap((d) => sources(d)).filter((f) => /delayDuration=\{0\}/.test(read(f)))
    expect(instant).toEqual([])
  })

  it("are 24px ink labels that slide 2px, with no scale", () => {
    const tip = read("components/ui/tooltip.tsx")
    expect(tip).toMatch(/min-h-6/)
    expect(tip).toMatch(/bg-\[var\(--tooltip-bg\)\]/)
    expect(tip).toMatch(/slide-in-from-top-0\.5/)
    expect(tip).not.toMatch(/zoom-in/)
  })
})

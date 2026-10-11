import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// The sidebar keeps two lines (design v3, shell S2 and S6): every icon
// centres on one column, 24px from the window's edge, and every name starts
// on one line at 40px. The open sidebar: 8px of its own padding, the row's
// 8px, half a 16px icon. The rail: 6px in, half a 36px item. Read from the
// CSS that sets each, so changing one alone fails.

const root = join(__dirname, "..", "..", "..")
const CSS = readFileSync(join(root, "app/globals.css"), "utf8")
const NAV = readFileSync(join(__dirname, "desktopNavigationBar.tsx"), "utf8")

function rule(selector: string): string {
  const at = CSS.indexOf(`${selector} {`)
  if (at < 0) throw new Error(`no rule for ${selector}`)
  return CSS.slice(at, CSS.indexOf("}", at))
}
const px = (block: string, prop: string) => {
  const m = new RegExp(`(?:^|[\\s;{])${prop}:\\s*([^;]+);`).exec(block)
  if (!m) throw new Error(`no ${prop} in ${block.slice(0, 80)}`)
  return m[1].trim().split(/\s+/).map((v) => Number(v.replace("px", "")))
}

describe("the sidebar's icon column and name line", () => {
  const side = px(rule(".shell-side"), "padding") // 10 8 8 8
  const row = rule(".shell-row")
  const rowPad = px(row, "padding")[1]
  const gap = px(row, "gap")[0]
  const icon = 16

  it("centres the open sidebar's icons on 24px and starts names at 40px", () => {
    expect(side[3]).toBe(8)
    expect(side[3] + rowPad + icon / 2).toBe(24)
    expect(side[3] + rowPad + icon + gap).toBe(40)
  })

  it("is 30px a row with a 1px gap, and 248px wide by default", () => {
    expect(px(row, "height")[0]).toBe(30)
    const side = readFileSync(join(__dirname, "desktopSideNavigationBar.tsx"), "utf8")
    expect(side.match(/flex flex-col gap-px/g)?.length).toBeGreaterThanOrEqual(2)
    expect(NAV).toMatch(/<SidebarSeam /)
    expect(readFileSync(join(root, "lib/ui/sidebarSize.ts"), "utf8")).toMatch(/SIDEBAR_DEFAULT_PX = 248/)
  })

  it("centres the rail's items on the same column", () => {
    const rail = px(rule('.shell-side[data-rail="true"]'), "padding") // 10 0 8 6
    const item = px(rule(".shell-rail-item"), "width")[0]
    expect(rail[3] + item / 2).toBe(24)
  })

  it("keeps a person's 20px face in the 16px icon column, 2px into the gap each side", () => {
    const side = readFileSync(join(__dirname, "desktopSideNavigationBar.tsx"), "utf8")
    expect(side).toMatch(/data-sidebar-avatar="" className="-mx-0\.5 flex/)
  })
})

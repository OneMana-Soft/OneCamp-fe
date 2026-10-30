import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Bell, CircleUser } from "@/lib/icons"
import { DrawerItem } from "./drawerItem"

// Every phone drawer row has one anatomy: its icon in a 32px slot, tiled or
// not, then the label. In the More menu the tiled places' labels began at 69
// and the plain account rows' at 57; the menu also kept a copy of the row of
// its own, so the two drifted.
afterEach(cleanup)

describe("a drawer row", () => {
  it("puts a plain icon in the tile's 32px slot", () => {
    render(<DrawerItem icon={CircleUser} label="Your profile" onClick={() => {}} />)
    const slot = screen.getByRole("button").querySelector("[data-drawer-icon]")
    expect(slot?.className.split(/\s+/)).toEqual(expect.arrayContaining(["size-8", "shrink-0"]))
  })

  it("is 32px when tiled, the Tile's md size", () => {
    render(<DrawerItem icon={Bell} label="AI activity" hue="dusk" onClick={() => {}} />)
    const tile = screen.getByRole("button").firstElementChild as HTMLElement
    expect(tile.className).toMatch(/\bsize-8\b/)
  })

  // DESIGN-BUILD-3, 20 Oct 2026: the calendar's Google row cut its own
  // result ("Connected as sam@gmail.com · In step …") on a phone.
  it("wraps its description to two lines before it cuts it", () => {
    render(<DrawerItem icon={CircleUser} label="Google Calendar" description="sam@gmail.com · In step with Google · 2m ago" onClick={() => {}} />)
    const line = screen.getByText("sam@gmail.com · In step with Google · 2m ago")
    expect(line.className.split(/\s+/)).toContain("line-clamp-2")
    expect(line.className.split(/\s+/)).not.toContain("truncate")
  })

  it("is the one row every drawer uses", () => {
    const dir = __dirname
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".tsx") && !f.includes(".test.") && f !== "drawerItem.tsx")) {
      expect(readFileSync(join(dir, f), "utf8"), f).not.toMatch(/function DrawerItem\(/)
    }
  })
})

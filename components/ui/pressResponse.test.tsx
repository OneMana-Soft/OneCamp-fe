import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Bell } from "@/lib/icons"

vi.mock("next/navigation", () => ({ usePathname: () => "/app/home", useRouter: () => ({ push: () => {} }) }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; prefetch?: boolean; children: React.ReactNode }) => {
    delete (rest as { prefetch?: boolean }).prefetch
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  },
}))
vi.mock("react-redux", () => ({
  useSelector: (pick: (s: unknown) => unknown) => pick({ users: { userSidebar: { userChats: [], userChannels: [], totalUnreadActivityCount: 0 } } }),
}))
vi.mock("@/components/drawers/userProfileDrawer", () => ({ UserProfileDrawer: () => null }))

import { Button } from "./button"
import { ListRow } from "./listRow"
import { DrawerItem } from "@/components/drawers/drawerItem"
import { MobileBottomNavigationBar } from "@/components/navigationBar/mobile/mobileBottomNavigationBar"

// Design v3, mobile F2: one press language on a touch screen, chosen by what
// is pressed (app/phone.css): a row fills, a control dips, a card settles.

const ROOT = join(__dirname, "..", "..")

afterEach(cleanup)

describe("the press response", () => {
  it("dips a button as a control and an icon button as an icon", () => {
    render(
      <>
        <Button>Save</Button>
        <Button size="icon" aria-label="More">
          <Bell />
        </Button>
        <Button size="icon-sm" aria-label="Less">
          <Bell />
        </Button>
      </>,
    )
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("data-press")).toBe("control")
    expect(screen.getByRole("button", { name: "More" }).getAttribute("data-press")).toBe("icon")
    expect(screen.getByRole("button", { name: "Less" }).getAttribute("data-press")).toBe("icon")
  })

  it("lets a caller choose another press (a card made of a button)", () => {
    render(<Button data-press="card">Open</Button>)
    expect(screen.getByRole("button", { name: "Open" }).getAttribute("data-press")).toBe("card")
  })

  it("fills a list row and a sheet row in --press, never the accent slab", () => {
    const { container } = render(<ListRow title="general" />)
    const row = container.firstElementChild as HTMLElement
    expect(row.getAttribute("data-press")).toBe("row")
    expect(row.className).toMatch(/data-\[pressed=true\]:bg-press/)
    expect(row.className).not.toMatch(/bg-accent(?!\/)/)
    cleanup()
    render(<DrawerItem label="Share" onClick={() => {}} />)
    expect(screen.getByRole("button", { name: "Share" }).getAttribute("data-press")).toBe("row")
  })

  it("marks what destroys in a sheet with its tone", () => {
    render(<DrawerItem label="Delete" onClick={() => {}} destructive />)
    expect(screen.getByRole("button", { name: "Delete" }).getAttribute("data-tone")).toBe("danger")
  })

  it("dips the tab's capsule, with no grey block across the cell", () => {
    render(<MobileBottomNavigationBar />)
    const home = screen.getByRole("link", { name: "Home" })
    expect(home.getAttribute("data-press")).toBe("tab")
    expect(home.className).not.toMatch(/active:bg-/)
    expect(home.querySelector(".phone-tab-cap")).not.toBeNull()
  })

  it("is drawn by app/phone.css for touch screens, with scale off under reduced motion", () => {
    const css = readFileSync(join(ROOT, "app/phone.css"), "utf8")
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*\[data-press="row"\]/)
    expect(css).toMatch(/@media \(pointer: coarse\) and \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\[data-press="control"\]:active[\s\S]*?scale: 0\.96/)
    expect(css).toMatch(/\[data-press="icon"\]:active[^{]*\{\s*scale: 0\.92/)
    expect(css).toMatch(/\[data-press="card"\]:active[^{]*\{\s*scale: 0\.985/)
  })
})

/**
 * Files the area waves had rewritten on their branches, where the accent
 * press was already gone. Empty since the integration (11 Oct), when they
 * landed; the list only shrinks.
 */
const AREA_OWNED = new Set<string>([])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

describe("no accent slab on press", () => {
  it("has no active:bg-accent anywhere in components/", () => {
    const offenders = walk(join(ROOT, "components"))
      .map((f) => relative(ROOT, f))
      .filter((f) => !AREA_OWNED.has(f))
      .filter((f) => /active:bg-accent\b/.test(readFileSync(join(ROOT, f), "utf8")))
    expect(offenders, "press with --press (active:bg-press) or data-press").toEqual([])
  })
})

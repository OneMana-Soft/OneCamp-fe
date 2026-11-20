import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// The plan and its seats in the workspace menu, for admins (SHELL-15): where
// a person looks for "which plan am I on" (the team switcher, as Vercel puts
// it), with the way past the free plan's limit one press away. A member sees
// no row and asks for nothing.

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: () => false }) }))
const plan = vi.hoisted(() => ({
  now: { known: true, failed: false, plan: "free", used: 18, limit: 25, freePlan: true, upgradeUrl: "https://onemana.dev/buy" } as Record<string, unknown>,
  asked: [] as unknown[],
}))
vi.mock("@/hooks/usePlan", () => ({
  usePlan: (opts?: unknown) => {
    plan.asked.push(opts)
    return plan.now
  },
}))

import { WorkspaceMenu } from "@/components/navigationBar/desktop/SidebarHeader"
import { PlanRow } from "@/components/navigationBar/desktop/PlanRow"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

afterEach(() => {
  cleanup()
  push.mockClear()
  plan.asked.length = 0
  plan.now = { known: true, failed: false, plan: "free", used: 18, limit: 25, freePlan: true, upgradeUrl: "https://onemana.dev/buy" }
  vi.restoreAllMocks()
})

const menu = (isAdmin: boolean) => {
  render(
    <WorkspaceMenu isAdmin={isAdmin}>
      <button type="button">Workspace menu</button>
    </WorkspaceMenu>,
  )
  fireEvent.keyDown(screen.getByRole("button", { name: "Workspace menu" }), { key: "Enter" })
  return screen.getByRole("menu")
}

describe("the plan row", () => {
  it("an admin sees the plan and seats in the workspace menu", async () => {
    menu(true)
    const row = await screen.findByRole("menuitem", { name: "Plan: Free, 18 of 25 people. Remove the 25-person limit" })
    expect(row.textContent).toContain("Free · 18 of 25 people")
    expect(row.textContent).toContain("Remove the 25-person limit")
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    fireEvent.click(row)
    expect(open).toHaveBeenCalledWith("https://onemana.dev/buy", "_blank", "noopener,noreferrer")
  })

  it("a member sees no plan row", () => {
    const m = menu(false)
    expect(m.textContent).not.toMatch(/people|Plan|limit/)
    expect(plan.asked).toEqual([])
  })

  // The row alone, in an open menu (a menu row needs its menu).
  const alone = () =>
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent aria-label="Workspace">
          <PlanRow />
        </DropdownMenuContent>
      </DropdownMenu>,
    )
  const shown = () => document.querySelector("[aria-label='Workspace']")!

  it("the track turns sun at 80 % and danger when full", () => {
    const tone = (used: number) => {
      plan.now = { ...plan.now, used }
      const { unmount } = alone()
      const t = shown().querySelector("[data-plan-track]")?.getAttribute("data-tone")
      unmount()
      return t
    }
    expect(tone(10)).toBe("moss")
    expect(tone(20)).toBe("sun")
    expect(tone(25)).toBe("danger")
  })

  it("says licensed with no track or limit, holds its room while the plan comes, and is absent if it can't come", () => {
    plan.now = { ...plan.now, plan: "licensed", limit: 0, used: 40, freePlan: false }
    const { unmount } = alone()
    expect(shown().textContent).toContain("Licensed · unlimited people")
    expect(shown().querySelector("[data-plan-track]")).toBeNull()
    expect(shown().textContent).not.toMatch(/Remove|-person limit/)
    unmount()

    plan.now = { known: false, failed: false, used: 0, limit: 0 }
    const waiting = alone()
    expect(shown().querySelector("[aria-busy='true']")).not.toBeNull()
    waiting.unmount()

    plan.now = { known: false, failed: true, used: 0, limit: 0 }
    alone()
    expect(shown().textContent).toBe("")
  })

  // The plan's names come from the one table (lib/plan/planWords), so Cloud and
  // a build from source read as the plan card says them; an older server that
  // names no plan gets no row; the row's reader raises no toast on every page.
  it("names every plan from the plan's own words, and asks quietly", () => {
    for (const [kind, name] of [["cloud", "OneCamp Cloud"], ["source", "Built from source"]]) {
      plan.now = { ...plan.now, plan: kind, limit: 0, used: 9, freePlan: false }
      const { unmount } = alone()
      expect(shown().textContent).toContain(`${name} · unlimited people`)
      unmount()
    }
    expect(plan.asked.every((o) => (o as { quiet?: boolean }).quiet === true)).toBe(true)

    plan.now = { known: true, failed: false, used: 3, limit: 25 }
    alone()
    expect(shown().textContent).toBe("")
  })

  // Turbopack copies a shared module into every lazy chunk that reads it: two
  // chunks would carry two copies of the plan reader and its words.
  it("the menu row, the sheet row and the seats notice load from one module", () => {
    const root = join(__dirname, "..", "..", "..")
    for (const file of ["components/navigationBar/desktop/SidebarHeader.tsx", "components/drawers/orgDrawer.tsx", "components/banner/AdminBanners.tsx"]) {
      const lazy = readFileSync(join(root, file), "utf8").match(/lazyPart\(\(\) => import\("([^"]+)"\)/g) ?? []
      expect(lazy.filter((l) => /PlanRow|SeatsNotice|planParts/.test(l)), file).toEqual(['lazyPart(() => import("@/components/navigationBar/planParts")'])
    }
  })
})

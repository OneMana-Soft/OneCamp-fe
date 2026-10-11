import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Home's frame (hub.md H1, H2, H18): the sections in one order, the two
 * answers side by side, and nothing that repeats the sidebar.
 */
const root = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(root, p), "utf8")
const desktop = read("components/home/desktop/desktopDashboard.tsx")
const phone = read("components/home/mobile/mobileHome.tsx")

const order = (src: string, marks: string[]) => marks.map((m) => src.indexOf(m))

describe("Home on a desktop", () => {
  it("renders its sections in order", () => {
    const at = order(desktop, ["<Greeting", "<SetupChecklist", "<NeedsMe", "<TodayAgenda", "<ProjectsStrip", "<JumpBackIn", "<CreateTiles"])
    for (const i of at) expect(i).toBeGreaterThan(0)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it("puts what needs me and today in one grid row", () => {
    const grid = desktop.slice(desktop.indexOf("data-home-answers"), desktop.indexOf("<ProjectsStrip"))
    expect(grid).toContain("<NeedsMe")
    expect(grid).toContain("<TodayAgenda")
    expect(grid).toMatch(/grid-cols-\[1\.35fr_1fr\]/)
  })

  it("no longer lists Your channels or Your teams", () => {
    for (const src of [desktop, phone]) {
      expect(src).not.toMatch(/"Your channels"|"Your teams"|userTeams\.slice|userChannels\.slice/)
    }
  })

  it("sits in the 944px column", () => {
    expect(desktop).toMatch(/max-w-\[944px\]/)
  })

  it("shows the setup checklist to an admin only", () => {
    expect(desktop).toMatch(/isAdmin \? \([\s\S]*<SetupChecklist/)
    expect(phone).toMatch(/isAdmin \? <SetupChecklist/)
  })
})

describe("the greeting", () => {
  const greeting = read("components/home/Greeting.tsx")
  it("is in the display size on a desktop and title-1 on a phone", () => {
    expect(greeting).toMatch(/phone \? "text-title-1" : "text-display"/)
  })
  it("sits on the sheet: no wash, no band", () => {
    for (const f of ["components/home/Greeting.tsx", "components/home/desktop/desktopDashboard.tsx", "components/home/mobile/mobileHome.tsx", "components/home/GreetingComposition.tsx"]) {
      expect(read(f)).not.toMatch(/bg-brand-wash|GreetingBand/)
    }
  })
})

describe("the section headers", () => {
  it("are the hub's 13/590 h2 with no arrow", () => {
    const head = read("components/ui/hubRow.tsx")
    expect(head).toMatch(/<h2 id=\{id\} className="text-ui-sm font-semibold/)
    for (const f of ["components/home/TodayAgenda.tsx", "components/home/ProjectsStrip.tsx", "components/home/HomeLists.tsx", "components/home/NeedsMeSection.tsx"]) {
      expect(read(f)).toContain("HubSectionHeader")
      expect(read(f)).not.toMatch(/ArrowRight/)
    }
  })
})

describe("the lazy sections", () => {
  it("load the agenda and the projects on their own, never in Home's first bundle", () => {
    for (const src of [desktop, phone]) {
      expect(src).not.toMatch(/from "@\/components\/home\/(TodayAgenda|ProjectsStrip)"/)
      expect(src).toMatch(/dynamic\(\(\) => import\("@\/components\/home\/TodayAgenda"\)/)
      expect(src).toMatch(/dynamic\(\(\) => import\("@\/components\/home\/ProjectsStrip"\)/)
    }
  })
})

describe("Home's entrance", () => {
  it("rises once per session, on the home route, with transform and opacity only", () => {
    expect(desktop).toMatch(/useRiseOnce\("\/app\/home"\)/)
    const css = read("app/hub.css")
    const kf = css.slice(css.indexOf("@keyframes hub-rise"), css.indexOf("}\n}", css.indexOf("@keyframes hub-rise")))
    expect(kf).toMatch(/opacity/)
    expect(kf).toMatch(/transform/)
    expect(kf).not.toMatch(/height|top|margin/)
  })
})

describe("Home on the phone", () => {
  // The v3 phone top bar carries the search that opens the palette, so a
  // second search field on Home would be a duplicate.
  it("has no search bar of its own", async () => {
    const { readFileSync } = await import("node:fs")
    const src = readFileSync(`${process.cwd()}/components/home/mobile/mobileHome.tsx`, "utf8")
    expect(src).not.toMatch(/MobileHomeSearchBar/)
  })
})

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

describe("the projects strip (H14)", () => {
  // Three across at a tablet's width, or beside the AI panel, cut every card
  // to "Customer o…" and "6 open · 5 due …": three only where three fit.
  it("goes three across by its own width, not the window's", () => {
    const src = read("components/home/ProjectsStrip.tsx")
    expect(src).toMatch(/cn\("@container", className\)/)
    expect(src).toMatch(/"grid grid-cols-1 gap-2\.5", !isMobile && STRIP_COLUMNS\)/)
    expect(src).not.toMatch(/: "grid-cols-3"/)
  })

  // At 1024 beside the sidebar the strip was over 720px, so it went three
  // across and still cut "Customer onbo…" and "5 due this…" (critic review,
  // 12 Oct). A card's words get what its chrome leaves: 14px padding each
  // side, the 32px tile, the 28px ring and two 12px gaps.
  it("gives every card's words 150px at each width it changes columns", () => {
    // Read from the source: importing the strip brings Home's whole graph in.
    const STRIP_COLUMNS = /export const STRIP_COLUMNS = "([^"]+)"/.exec(read("components/home/ProjectsStrip.tsx"))![1]
    const CHROME = 14 * 2 + 32 + 28 + 12 * 2
    const GAP = 10
    const steps = [...STRIP_COLUMNS.matchAll(/@min-\[(\d+)px\]:grid-cols-(\d)/g)].map((m) => [Number(m[1]), Number(m[2])])
    expect(steps.map(([, n]) => n)).toEqual([2, 3])
    for (const [width, cols] of steps) {
      const words = (width - GAP * (cols - 1)) / cols - CHROME
      expect(words, `${cols} across from ${width}px`).toBeGreaterThanOrEqual(150)
    }
    // Alone on its row in two columns, the last card spans both.
    expect(STRIP_COLUMNS).toMatch(/@min-\[560px\]:@max-\[860px\]:\[&>:last-child:nth-child\(odd\)\]:col-span-2/)
  })
})

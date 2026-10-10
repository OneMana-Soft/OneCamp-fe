import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { DesktopSideNavigationBar } from "@/components/navigationBar/desktop/desktopSideNavigationBar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { MessageCircle } from "@/lib/icons"

vi.mock("react-redux", async (orig) => ({ ...(await orig<typeof import("react-redux")>()), useDispatch: () => vi.fn(), useSelector: (pick: (s: unknown) => unknown) => pick({ users: { usersStatus: {} } }) }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => undefined }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

afterEach(cleanup)

// The sidebar keeps two lines, as the task panel keeps its label column:
// every icon centres on one column (24px from the window's edge) and every
// name starts on one line (40px). A DM's 20px avatar pushed its name to 52;
// the logo centred on 28, the rail's icons on 26 and the collapse control's
// on 27, so the column wobbled and toggling the rail nudged every icon. The
// rows also stepped two rhythms: 30px in the primary list, 29px in groups.
// Read from the classes that set each, so changing one of them alone fails.

const root = join(__dirname, "..", "..", "..")
const src = (f: string) => readFileSync(join(root, f), "utf8")
const SIDE = src("components/navigationBar/desktop/desktopSideNavigationBar.tsx")
const BAR = src("components/navigationBar/desktop/desktopNavigationBar.tsx")
const TOP = src("components/navigationBar/desktop/desktopNavigationTopBar.tsx")
const ORG = src("components/navigationBar/orgAvatarNav.tsx")

/** Tailwind spacing to px: px-2 is 8, w-9 is 36, gap-0.5 is 2. */
const px = (cls: string, prefix: string) => {
  const m = new RegExp(`(?:^|\\s)${prefix}-(\\d+(?:\\.5)?)(?=\\s|$|")`).exec(cls)
  if (!m) throw new Error(`no ${prefix}- in ${cls.slice(0, 120)}`)
  return Number(m[1]) * 4
}
const classOf = (source: string, marker: RegExp) => {
  const m = marker.exec(source)
  if (!m) throw new Error(`not found: ${marker}`)
  return m[1]
}

describe("the sidebar's icon column and name line", () => {
  const navPad = px(classOf(SIDE, /<nav className="([^"]+)"/), "px")
  const railPad = px(classOf(SIDE, /<nav className="[^"]*group-\[\[data-collapsed=true\]\]:(px-[\d.]+)/).replace("group-", ""), "px")
  const rowPad = px(classOf(SIDE, /"group\/nav flex items-center gap-2 w-full (h-7 px-2) rounded-md"/), "px")
  const rowGap = px(classOf(SIDE, /"group\/nav flex items-center (gap-2) w-full/), "gap")
  const icon = 16 // h-4 w-4
  const iconCentre = navPad + rowPad + icon / 2
  const nameStart = navPad + rowPad + icon + rowGap

  it("centres the open sidebar's icons on 24px and starts names at 40px", () => {
    expect(iconCentre).toBe(24)
    expect(nameStart).toBe(40)
  })

  it("centres the rail's icons, the logo and the collapse controls on the same column", () => {
    const railItem = px(classOf(SIDE, /"(flex items-center justify-center h-9 w-9) rounded-md transition-colors"/), "w")
    expect(railPad + railItem / 2).toBe(iconCentre)
    const top = classOf(TOP, /<div className="(w-full h-12 flex [^"]+)"/)
    const logo = px(classOf(ORG, /<Avatar className="([^"]+)"/), "w")
    expect(px(top, "px") + logo / 2).toBe(iconCentre)
    // Open: the control's padding, its icon, its gap; as the rail, a 36px button.
    const row = classOf(BAR, /isCollapsed \? "(px-[\d.]+)" : "px-[\d.]+"/)
    const openRow = classOf(BAR, /isCollapsed \? "px-[\d.]+" : "(px-[\d.]+)"/)
    const collapse = classOf(BAR, /className="(text-xs text-muted-foreground[^"]+)"\s+title="Collapse sidebar"/)
    expect(px(openRow, "px") + px(collapse, "px") + icon / 2).toBe(iconCentre)
    expect(px(openRow, "px") + px(collapse, "px") + icon + px(collapse, "gap")).toBe(nameStart)
    const expand = classOf(BAR, /className="(h-9 w-9 [^"]+)"\s+title="Expand sidebar"/)
    expect(px(row, "px") + px(expand, "w") / 2).toBe(iconCentre)
  })

  it("steps every row by one rhythm, in the primary list and in the groups", () => {
    const primaryGap = px(classOf(SIDE, /<nav className="grid grid-cols-\[minmax\(0,1fr\)\] (gap-[\d.]+)/), "gap")
    const groupGap = px(classOf(SIDE, /<CollapsibleContent className="(space-y-[\d.]+)"/).replace("space-y", "gap"), "gap")
    expect(groupGap).toBe(primaryGap)
  })

  it("keeps a person's avatar in the icon column, so their name starts on the line", () => {
    render(
      <MediaQueryProvider>
        <TooltipProvider>
          <DesktopSideNavigationBar
            isCollapsed={false}
            links={[
              {
                title: "direct messages",
                label: "",
                icon: MessageCircle,
                variant: "ghost",
                path: "#",
                isOpen: true,
                setIsOpen: () => {},
                children: [{ title: "Maya Chen", path: "/app/chat/u2", variant: "ghost", userProfile: { user_uuid: "u2", user_full_name: "Maya Chen", user_name: "maya" } as never }],
              },
            ]}
          />
        </TooltipProvider>
      </MediaQueryProvider>,
    )
    const slot = screen.getByText("Maya Chen").closest("a")!.querySelector("[data-sidebar-avatar]")!
    expect(slot.className.split(/\s+/)).toEqual(expect.arrayContaining(["-mx-0.5", "shrink-0"]))
    // A 20px face less 2px each side takes the icon's 16px.
    const face = slot.querySelector("[class*='h-5'][class*='w-5'], [class*='md:h-5']")
    expect(face).not.toBeNull()
  })

  it("draws a group conversation as a team is, not as a stack of faces", () => {
    expect(BAR).toMatch(/isGroup \? \{ icon: Users, hue_id: d\.dm_grouping_id \}/)
    expect(SIDE).not.toMatch(/<GroupedAvatar/)
  })
})

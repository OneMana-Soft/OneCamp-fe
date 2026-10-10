import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { DesktopSideNavigationBar } from "@/components/navigationBar/desktop/desktopSideNavigationBar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { hueFor } from "@/lib/campHue"
import { File as FileIcon, Hash, Users } from "@/lib/icons"
import type { DesktopChildrenNavType, DesktopNavType } from "@/types/nav"

vi.mock("react-redux", async (orig) => ({ ...(await orig<typeof import("react-redux")>()), useDispatch: () => vi.fn() }))

afterEach(cleanup)

/**
 * Sidebar items carry a small identity glyph (the playful layer): a channel's
 * #, a doc's page and a team's people are drawn in the thing's own camp hue,
 * so the frame stops being the greyest part of the app. Projects already have
 * their coloured mark. The label stays ink.
 */
const CHANNEL = "6f1f2b0e-8d47-4c0a-9a55-3c2a1e9b7d10"
const DOC = "b52e7c91-2f3a-4d8e-8c1b-9e0d4a6f2c33"
const TEAM = "e0a4c6d2-71b8-49f5-a3e2-58c9d1f0b7a4"

function draw(section: string, icon: DesktopNavType["icon"], children: DesktopChildrenNavType[]) {
  return render(
    <MediaQueryProvider>
      <TooltipProvider>
        <DesktopSideNavigationBar
          isCollapsed={false}
          links={[{ title: section, label: "", icon, variant: "ghost", path: "#", isOpen: true, setIsOpen: () => {}, children }]}
        />
      </TooltipProvider>
    </MediaQueryProvider>,
  )
}

const glyphOf = (label: string) => screen.getByText(label).closest("a")!.querySelector("svg")!.getAttribute("class") ?? ""

describe("identity glyphs in the sidebar", () => {
  it("draws a channel's # in the channel's hue, and keeps the name ink", () => {
    draw("channels", Hash, [{ title: "engineering", path: `/app/channel/${CHANNEL}`, variant: "ghost", hue_id: CHANNEL }])
    expect(glyphOf("engineering")).toContain(`hue-${hueFor(CHANNEL)}`)
    expect(glyphOf("engineering")).toMatch(/(^|\s)text-hue(\s|$)/)
    expect(screen.getByText("engineering").className).not.toMatch(/hue/)
  })

  it("draws a doc's page and a team's people in their own hues", () => {
    draw("Docs", FileIcon, [{ title: "Launch plan", path: `/app/doc/${DOC}`, variant: "ghost", icon: FileIcon, hue_id: DOC }])
    expect(glyphOf("Launch plan")).toContain(`hue-${hueFor(DOC)}`)
    cleanup()
    draw("teams", Users, [{ title: "Launch", path: `/app/team/${TEAM}`, variant: "ghost", hue_id: TEAM }])
    expect(glyphOf("Launch")).toContain(`hue-${hueFor(TEAM)}`)
  })

  it("takes the ink cut where the row is darker, so the mark stays 3:1", () => {
    draw("channels", Hash, [{ title: "engineering", path: `/app/channel/${CHANNEL}`, variant: "sidebarActive", hue_id: CHANNEL }])
    expect(glyphOf("engineering")).toContain("text-hue-ink")
    cleanup()
    draw("channels", Hash, [{ title: "general", path: `/app/channel/${CHANNEL}`, variant: "ghost", hue_id: CHANNEL }])
    expect(glyphOf("general")).toContain("group-hover/nav:text-hue-ink")
  })

  it("leaves a destination with no identity neutral", () => {
    draw("Docs", FileIcon, [{ title: "All docs", path: "/app/doc", variant: "ghost", icon: FileIcon }])
    expect(glyphOf("All docs")).toContain("text-muted-foreground")
    expect(glyphOf("All docs")).not.toMatch(/hue-/)
  })

  it("is fed the uuid of every channel, doc and team the sidebar lists", () => {
    const builder = readFileSync(join(__dirname, "desktopNavigationBar.tsx"), "utf8")
    expect(builder.match(/hue_id: c\.ch_uuid/g)).toHaveLength(2) // favourites and the rest
    expect(builder).toMatch(/hue_id: t\.team_uuid/)
    expect(builder).toMatch(/hue_id: d\.doc_uuid/)
  })
})

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { DesktopSideNavigationBar } from "@/components/navigationBar/desktop/desktopSideNavigationBar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { MoreHorizontal, Table as TableIcon } from "@/lib/icons"
import { FOCUS_SECTION_TITLE } from "@/lib/nav/focusMode"
import type { DesktopNavType } from "@/types/nav"

afterEach(cleanup)

function draw(links: DesktopNavType[], isCollapsed = false) {
    return render(
        <MediaQueryProvider>
            <TooltipProvider>
                <DesktopSideNavigationBar links={links} isCollapsed={isCollapsed} />
            </TooltipProvider>
        </MediaQueryProvider>,
    )
}

const foldedSection = (over: Partial<DesktopNavType> = {}): DesktopNavType => ({
    title: FOCUS_SECTION_TITLE,
    label: "",
    icon: MoreHorizontal,
    variant: "ghost",
    path: "#",
    isOpen: false,
    setIsOpen: () => {},
    children: [{ title: "Tables", path: "/app/tables", variant: "ghost", icon: TableIcon }],
    ...over,
})

describe("the folded section in the expanded sidebar", () => {
    it("keeps its destinations out of the rail until it is opened", () => {
        draw([foldedSection()])
        expect(screen.getByText(FOCUS_SECTION_TITLE)).toBeTruthy()
        expect(screen.queryByText("Tables")).toBeNull()
    })

    it("shows them once opened", () => {
        draw([foldedSection({ isOpen: true })])
        expect(screen.getByText("Tables").closest("a")?.getAttribute("href")).toBe("/app/tables")
    })

    it("tells the section it was opened, so the choice can be remembered", () => {
        const setIsOpen = vi.fn()
        draw([foldedSection({ setIsOpen })])
        fireEvent.click(screen.getByText(FOCUS_SECTION_TITLE))
        expect(setIsOpen).toHaveBeenCalledWith(true)
    })
})

describe("the folded section in the icon rail", () => {
    // The rail has no room for a disclosure, so the entry is an action that
    // opens the sidebar. Rendered as a link to "#" it would jump the page to
    // the top and tell assistive tech it was somewhere to go.
    it("is a button, not a link to nowhere", () => {
        const action = vi.fn()
        draw([{ title: FOCUS_SECTION_TITLE, icon: MoreHorizontal, variant: "ghost", path: "#", action }], true)
        const label = screen.getByText(FOCUS_SECTION_TITLE)
        expect(label.closest("button")).toBeTruthy()
        expect(label.closest("a")).toBeNull()
        fireEvent.click(label.closest("button")!)
        expect(action).toHaveBeenCalledTimes(1)
    })

    it("still routes an ordinary destination through a link", () => {
        draw([{ title: "Home", icon: MoreHorizontal, variant: "ghost", path: "/app/home" }], true)
        expect(screen.getByText("Home").closest("a")?.getAttribute("href")).toBe("/app/home")
    })

    // Collapsing the sidebar while on a folded page must not leave the rail
    // with nothing marked as current.
    it("marks itself current when the page you are on is folded inside it", () => {
        draw([{ title: FOCUS_SECTION_TITLE, icon: MoreHorizontal, variant: "sidebarActive", path: "#", action: () => {} }], true)
        const button = screen.getByText(FOCUS_SECTION_TITLE).closest("button")
        expect(button?.className).toContain("bg-accent")
    })
})

describe("the sidebar that assembles the rail", () => {
    // DesktopNavigationBar needs Redux, SWR and the router before it renders
    // anything at all, so the wiring is checked at the source. Passing the
    // unpartitioned list back in is a one-word edit that no other test here
    // would notice, and it puts every module back in the rail.
    it("hands the rail the folded list, not the full one", () => {
        const src = readFileSync(join(__dirname, "desktopNavigationBar.tsx"), "utf8")
        expect(src).toContain("links={primaryNavLinks}")
        expect(src).not.toContain("links={navLinks}")
    })
})

import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// What next/link was asked to do, readable from the anchor.
vi.mock("next/link", () => ({
  default: React.forwardRef(function MockLink(
    { href, prefetch, children, onPointerEnter, onFocus, onTouchStart, ...rest }: Record<string, any>,
    ref: React.Ref<HTMLAnchorElement>,
  ) {
    const { scroll: _scroll, ...anchor } = rest
    return (
      <a ref={ref} href={String(href)} data-prefetch-prop={String(prefetch)} onPointerEnter={onPointerEnter} onFocus={onFocus} onTouchStart={onTouchStart} {...anchor}>
        {children}
      </a>
    )
  }),
}))
vi.mock("react-redux", async (orig) => ({ ...(await orig<typeof import("react-redux")>()), useDispatch: () => vi.fn() }))

import { DesktopSideNavigationBar } from "@/components/navigationBar/desktop/desktopSideNavigationBar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { Hash, Home } from "@/lib/icons"
import type { DesktopNavType } from "@/types/nav"

afterEach(cleanup)

// Every sidebar link prefetched its whole route as soon as it was on screen,
// so opening Home loaded the code of every place in the sidebar (about 1.75 MB
// gzip, cold). On a desktop a link now prefetches when the pointer comes over
// it or the keyboard reaches it; the phone's tab bar still prefetches on sight.

const links: DesktopNavType[] = [
  { title: "Home", label: "", icon: Home, variant: "ghost", path: "/app/home" },
  {
    title: "channels",
    label: "",
    icon: Hash,
    variant: "ghost",
    path: "#",
    isOpen: true,
    setIsOpen: () => {},
    children: [{ title: "engineering", path: "/app/channel/c1", variant: "ghost", hue_id: "c1" }],
  },
]

function draw(isCollapsed: boolean) {
  return render(
    <MediaQueryProvider>
      <TooltipProvider>
        <DesktopSideNavigationBar isCollapsed={isCollapsed} links={links} />
      </TooltipProvider>
    </MediaQueryProvider>,
  )
}

const prefetchOf = (a: Element) => a.getAttribute("data-prefetch-prop")

describe("sidebar links prefetch on intent", () => {
  it("leaves a place's route alone until the pointer comes over its link", () => {
    draw(false)
    const home = screen.getByText("Home").closest("a")!
    const channel = screen.getByText("engineering").closest("a")!
    expect(prefetchOf(home)).toBe("false")
    expect(prefetchOf(channel)).toBe("false")
    fireEvent.pointerEnter(channel)
    expect(prefetchOf(channel)).toBe("true")
    expect(prefetchOf(home)).toBe("false")
  })

  it("takes the keyboard reaching a link, or a touch, as intent too", () => {
    draw(false)
    const home = screen.getByText("Home").closest("a")!
    fireEvent.focus(home)
    expect(prefetchOf(home)).toBe("true")
    const channel = screen.getByText("engineering").closest("a")!
    fireEvent.touchStart(channel)
    expect(prefetchOf(channel)).toBe("true")
  })

  it("does the same in the rail", () => {
    draw(true)
    const home = screen.getByText("Home").closest("a")!
    expect(prefetchOf(home)).toBe("false")
    fireEvent.pointerEnter(home)
    expect(prefetchOf(home)).toBe("true")
  })

  it("prefetches on sight only in the phone's tab bar, which gets no hover", () => {
    const root = join(__dirname, "..", "..", "..")
    const side = readFileSync(join(root, "components/navigationBar/desktop/desktopSideNavigationBar.tsx"), "utf8")
    expect(side).not.toMatch(/\bprefetch\b/)
    expect(side).not.toMatch(/from "next\/link"/)
    const tabs = readFileSync(join(root, "components/navigationBar/mobile/mobileBottomNavigationBar.tsx"), "utf8")
    expect(tabs).toMatch(/prefetch=\{true\}/)
  })
})

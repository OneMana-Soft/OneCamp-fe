import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// A new DM showed nowhere with the sidebar collapsed to the rail (⌘\, and
// every window under 1024px): the rail held projects and starred places,
// and the Inbox leaves DMs out (SN-BUG-8). It has Channels and DMs now, each
// saying what its folded section would (lib/nav/sidebarSignal): mentions of
// you in channels as "@2", other unread channels as a dot, and DMs as the
// number of conversations with something unread (SN-19).

vi.mock("next/link", () => ({
  default: React.forwardRef(function MockLink({ href, children, prefetch: _p, scroll: _s, ...rest }: Record<string, unknown>, ref: React.Ref<HTMLAnchorElement>) {
    return (
      <a ref={ref} href={String(href)} {...(rest as object)}>
        {children as React.ReactNode}
      </a>
    )
  }),
}))
vi.mock("react-redux", async (orig) => ({
  ...(await orig<typeof import("react-redux")>()),
  useDispatch: () => vi.fn(),
  useSelector: (pick: (s: unknown) => unknown) => pick({ users: { usersStatus: {} } }),
}))
vi.mock("@/components/navigationBar/desktop/SidebarHeader", () => ({
  WorkspaceMark: () => <span data-mark="" />,
  WorkspaceMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@/components/navigationBar/desktop/SidebarFoot", () => ({
  ProfileMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelfAvatar: () => <span data-self-avatar="" />,
}))
vi.mock("@/lib/ui/palette", () => ({ openPalette: vi.fn() }))

import { SidebarRail } from "@/components/navigationBar/desktop/SidebarRail"
import { rowSignal, sectionSignal } from "@/lib/nav/sidebarSignal"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MediaQueryProvider } from "@/context/MediaQueryContext"

afterEach(cleanup)

function rail({ channels, dms, on }: { channels: { unread_count?: number; mentions?: number }[]; dms: number; on?: "channel" | "chat" }) {
  const conversations = { channels: sectionSignal(channels), dms: rowSignal({ badge: true, unread_count: dms }), on }
  return render(
    <MediaQueryProvider>
      <TooltipProvider>
        <SidebarRail primary={[]} places={[]} isAdmin={false} onExpand={() => {}} peek={() => null} conversations={conversations} />
      </TooltipProvider>
    </MediaQueryProvider>,
  )
}

describe("the rail's Channels and DMs", () => {
  it("counts conversations with unread DMs as a badge and unread channels as a dot", () => {
    rail({ channels: [{ unread_count: 4 }], dms: 3 })
    const dms = screen.getByRole("link", { name: "DMs, 3 unread" })
    expect(dms.getAttribute("href")).toBe("/app/chat")
    expect(dms.querySelector(".shell-rail-badge")?.textContent).toBe("3")
    const channels = screen.getByRole("link", { name: "Channels, unread" })
    expect(channels.getAttribute("href")).toBe("/app/channel")
    expect(channels.querySelector(".shell-rail-dot")).toBeTruthy()
  })

  it("shows mentions of you in channels as @n", () => {
    rail({ channels: [{ unread_count: 4, mentions: 1 }, { unread_count: 1, mentions: 1 }], dms: 0 })
    const channels = screen.getByRole("link", { name: "Channels, 2 mentions" })
    expect(channels.querySelector(".shell-rail-badge")?.textContent).toBe("@2")
    expect(channels.querySelector(".shell-rail-dot")).toBeNull()
  })

  it("is quiet with nothing unread, and marks the one open", () => {
    rail({ channels: [], dms: 0, on: "chat" })
    expect(screen.getByRole("link", { name: "DMs" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("link", { name: "Channels" }).getAttribute("aria-current")).toBeNull()
  })
})

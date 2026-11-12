import { renders } from "@/lib/testing/reactRenders"
import { act, cleanup, screen, waitFor } from "@testing-library/react"
import { forwardRef, useState, type ReactNode, type Ref } from "react"
import { Provider } from "react-redux"
import { combineReducers, configureStore } from "@reduxjs/toolkit"
import { afterEach, describe, expect, it, vi } from "vitest"
import userSlice from "@/store/slice/userSlice"
import channelSlice from "@/store/slice/channelSlice"
import chatSlice from "@/store/slice/chatSlice"
import rightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import uiSlice from "@/store/slice/uiSlice"
import splitSlice from "@/store/slice/splitSlice"
import { renderAtAddress } from "@/lib/testing/nextAddress"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { DesktopNavigationBar } from "./desktopNavigationBar"

// H1, "the shell holds still" (FLUIDITY-LEAD-11, 5 Nov 2026). On a profiling
// build of beta 3750d5b14 every move drew the shell, and the sidebar with it:
// the sidebar was the frame the page sat in, so whatever drew the shell (the
// path, a split write, the first click) drew every section and row again.
// The sidebar is the page's sibling now: the frame drawing the page again
// draws none of it, and a move draws only what it changed (the row that was
// current and the one that is).
//
// The sidebar is drawn for real at a real address (lib/testing/nextAddress);
// what its leaves fetch stands in (each stand-in wrapped as the real one is,
// memo or not), and every component drawn is counted (lib/testing/reactRenders).
// A memo component is counted by its function's name, named apart from its
// binding (SideNav, NavSection, MoreNav, DocsNav): the test bundle names
// memo(function X) bound to X "X2". A name nothing drew throws.

const SELF = "a1110000-0000-4000-8000-000000000001"
const OTHER = "b2220000-0000-4000-8000-000000000002"
const GENERAL = "c4a70000-0000-4000-8000-000000000001"
const DESIGN = "c4a70000-0000-4000-8000-000000000002"
const PROJECT = "d5550000-0000-4000-8000-000000000003"

const { stand } = vi.hoisted(() => ({
  // A leaf that fetches, as one element, memo if the real one is.
  stand: async (real: unknown, name: string) => {
    const { memo, createElement } = await import("react")
    const Stub = () => createElement("i", { "data-stub": name })
    Stub.displayName = name
    return (real as { $$typeof?: symbol } | undefined)?.$$typeof === Symbol.for("react.memo") ? memo(Stub) : Stub
  },
}))

vi.mock("next/link", () => ({
  default: forwardRef(function MockLink({ href, prefetch: _p, scroll: _s, children, ...rest }: Record<string, unknown>, ref: Ref<HTMLAnchorElement>) {
    return (
      <a ref={ref} href={String(href)} {...rest}>
        {children as ReactNode}
      </a>
    )
  }),
}))
vi.mock("@/components/navigationBar/tablet/useShellBand", () => ({ useShellBand: () => "desktop", usePanelPlacement: () => "beside" }))
vi.mock("@/hooks/useHydrateUserSidebar", () => {
  const answer = { data: { data: { user_uuid: "a1110000-0000-4000-8000-000000000001", user_name: "Me", user_is_admin: false, user_overdue_task_count: 0 } } }
  return { useHydrateUserSidebar: () => answer }
})
vi.mock("@/hooks/useLater", async (orig) => ({ ...(await orig<object>()), useLaterList: () => ({ data: undefined }) }))
vi.mock("@/hooks/useNudgeCount", () => ({ useNudgeCount: () => 0 }))
// Recent boards (miro-46): nothing opened yet, so no section to draw.
vi.mock("@/lib/nav/placeRows", async (orig) => ({ ...(await orig<object>()), useRecentPlaces: () => [] }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => undefined, useBotKind: () => undefined, useBotKinds: () => undefined }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => undefined }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/components/navigationBar/desktop/SidebarHeader", async (orig) => {
  const real = await orig<typeof import("./SidebarHeader")>()
  return { ...real, SidebarHeader: await stand(real.SidebarHeader, "SidebarHeader") }
})
vi.mock("@/components/navigationBar/desktop/SidebarSearchRow", async (orig) => {
  const real = await orig<typeof import("./SidebarSearchRow")>()
  return { ...real, SidebarSearchRow: await stand(real.SidebarSearchRow, "SidebarSearchRow") }
})
vi.mock("@/components/navigationBar/desktop/SidebarFoot", async (orig) => {
  const real = await orig<typeof import("./SidebarFoot")>()
  return { ...real, SidebarFoot: await stand(real.SidebarFoot, "SidebarFoot") }
})
vi.mock("@/components/error/OfflineNotice", async (orig) => {
  const real = await orig<typeof import("@/components/error/OfflineNotice")>()
  return { ...real, FootPill: await stand(real.FootPill, "FootPill") }
})
vi.mock("@/components/docTree/DocsTreeGroups", async (orig) => ({ ...(await orig<object>()), default: await stand(undefined, "DocsTreeGroups") }))

afterEach(cleanup)

function store() {
  const reducer = combineReducers({
    users: userSlice.reducer,
    channel: channelSlice.reducer,
    chat: chatSlice.reducer,
    rightPanel: rightPanelSlice.reducer,
    ui: uiSlice.reducer,
    split: splitSlice.reducer,
  })
  const users = userSlice.reducer(undefined, { type: "@@init" })
  // Two channels, one DM and one project: enough rows for every section.
  const sidebar = {
    userChannels: [
      { ch_uuid: GENERAL, ch_name: "general", unread_post_count: 0 },
      { ch_uuid: DESIGN, ch_name: "design", unread_post_count: 2 },
    ],
    userChats: [
      {
        dm_grouping_id: `${SELF} ${OTHER}`,
        dm_unread: 0,
        dm_participants: [
          { user_uuid: SELF, user_name: "Me" },
          { user_uuid: OTHER, user_name: "Riya" },
        ],
      },
    ],
    userProjects: [{ project_uuid: PROJECT, project_name: "Launch" }],
  } as unknown as Partial<typeof users.userSidebar>
  return configureStore({ reducer, preloadedState: { users: { ...users, userSidebar: { ...users.userSidebar, ...sidebar } } } })
}

let redrawFrame: () => void = () => {}

/** The frame as the shell draws it: the page, drawn again whenever the shell is. */
function Frame() {
  const [n, setN] = useState(0)
  redrawFrame = () => setN((x) => x + 1)
  return (
    <DesktopNavigationBar>
      <p>the page, drawn {n}</p>
    </DesktopNavigationBar>
  )
}

async function sidebarAt(url: string) {
  const at = renderAtAddress(
    <Provider store={store()}>
      <MediaQueryProvider>
        <TooltipProvider>
          <Frame />
        </TooltipProvider>
      </MediaQueryProvider>
    </Provider>,
    url,
  )
  // The docs tree's chunk, the sidebar's settle timer and what follows its first draw.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50))
  })
  expect(screen.getByRole("link", { name: "general" })).toBeTruthy()
  // The docs tree drawn too (its chunk comes when Docs, open, first draws), so its count below says something.
  await waitFor(() => expect(document.querySelector('[data-stub="DocsTreeGroups"]')).not.toBeNull())
  return at
}

const current = () => [...document.querySelectorAll('aside [aria-current="page"]')].map((a) => a.textContent?.trim())
const SIDEBAR = ["SideNav", "NavSection", "SideNavLink", "PrimaryNav", "PrimaryRow", "MoreNav", "SidebarHeader", "SidebarSearchRow", "SidebarFoot", "FootPill", "DocsNav", "DocsTreeGroups"]
const sidebarDraws = () => SIDEBAR.reduce((a, n) => a + renders.of(n), 0)

describe("the sidebar holds still", () => {
  it("draws nothing of the sidebar when the shell draws the page again", async () => {
    await sidebarAt("/app/home")
    renders.reset()
    act(() => redrawFrame())
    expect(screen.getByText("the page, drawn 1")).toBeTruthy()
    expect(sidebarDraws(), renders.top()).toBe(0)
  })

  it("draws only the rows a move changed: Home to Inbox draws two primary rows and no section", async () => {
    const at = await sidebarAt("/app/home")
    expect(current()).toContain("Home")
    renders.reset()
    act(() => at.go("/app/inbox"))
    // The current row follows the page.
    expect(current()).toContain("Inbox")
    expect(current()).not.toContain("Home")
    for (const n of ["NavSection", "SideNavLink", "MoreNav", "SidebarHeader", "SidebarSearchRow", "SidebarFoot", "DocsNav", "DocsTreeGroups"]) expect(renders.of(n), `${n}: ${renders.top()}`).toBe(0)
    // Home's row and Inbox's; the row that became current draws once more, for its chip's fade (useChipFade).
    expect(renders.of("PrimaryRow"), renders.top()).toBeLessThanOrEqual(3)
  })

  it("draws one section and its one changed row when a channel opens", async () => {
    const at = await sidebarAt("/app/inbox")
    renders.reset()
    act(() => at.go(`/app/channel/${GENERAL}`))
    expect(current()).toContain("general")
    expect(renders.of("NavSection"), renders.top()).toBeLessThanOrEqual(1)
    // general's row, twice: once current, once for its chip's fade.
    expect(renders.of("SideNavLink"), renders.top()).toBeLessThanOrEqual(2)
    for (const n of ["SidebarHeader", "SidebarSearchRow", "SidebarFoot", "DocsNav", "DocsTreeGroups"]) expect(renders.of(n), `${n}: ${renders.top()}`).toBe(0)
  })
})

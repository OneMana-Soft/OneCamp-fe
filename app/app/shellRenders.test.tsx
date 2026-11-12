import { act, cleanup, fireEvent, within } from "@testing-library/react"
import { forwardRef, type ReactNode } from "react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import { afterEach, describe, expect, it, vi } from "vitest"
import rightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import splitSlice from "@/store/slice/splitSlice"
import { openInSplit, setActive, setHere, setRoom, setSizes, setSplitOn } from "@/store/slice/splitActions"
import { MAIN } from "@/lib/split"
import { AppRouterProvider } from "@/lib/navigation/appRouter"
import { renderAtAddress } from "@/lib/testing/nextAddress"
import { LayoutContent } from "./LayoutContent"

// The shell's render budget (fluid, 21 Oct 2026): an address write that
// leaves the path as it is (a calendar's date on each press of J, a list's
// filter, a page's tab) draws the shell 0 times. Next's useRouter() draws its
// caller again on every address write (lib/navigation/appRouter), and the
// shell's own hooks called it, so every such write drew the whole shell.
//
// The shell is drawn for real, with Next's own hooks reading Next's own
// contexts (lib/testing/nextAddress); what it holds stands in as one element
// each, and their own reads are the shell guard's (shellAddress.test.ts). The
// query's reader beside the shell, OpenFromUrl, stands in too: reading the
// query is its job.
//
// Draws are counted where they happen: the shell calls useBotKinds once a
// draw, and each stand-in counts its own. (A Profiler doesn't hear a draw
// that a context started below it, which is the kind counted here.)

// Hoisted with the mocks below, which run first. A stand-in draws what it holds.
const { draws, stub } = vi.hoisted(() => {
  const draws = new Map<string, number>()
  const count = (name: string) => draws.set(name, (draws.get(name) ?? 0) + 1)
  return {
    draws,
    count,
    stub: (name: string) => {
      const Stub = ({ children }: { children?: ReactNode }) => {
        count(name)
        return <div data-stub={name}>{children}</div>
      }
      Stub.displayName = name
      return Stub
    },
  }
})
const total = () => [...draws.values()].reduce((a, b) => a + b, 0)
const drawn = () => [...draws.entries()].map(([k, n]) => `${k} ${n}`).join(", ")
// The daily note's watch (AgentNoteOnOpen): how often it comes and goes.
const notes = vi.hoisted(() => ({ mounted: 0, unmounted: 0 }))

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false }) }))
vi.mock("@/components/navigationBar/tablet/useShellBand", () => ({ useShellBand: () => "desktop", usePanelPlacement: () => "beside" }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined }) }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKinds: () => void draws.set("Shell", (draws.get("Shell") ?? 0) + 1) }))
vi.mock("@/hooks/useOpenFromUrl", () => ({ useOpenFromUrl: () => undefined }))
vi.mock("@/lib/celebrateSoon", () => ({ warmBurstsWhenIdle: () => undefined }))
vi.mock("@/components/navigationBar/desktop/desktopNavigationBar", () => ({ DesktopNavigationBar: stub("DesktopNavigationBar") }))
vi.mock("@/components/navigationBar/mobile/mobileNavigationBar", () => ({ MobileNavigationBar: stub("MobileNavigationBar") }))
vi.mock("@/components/banner/NoticeBar", () => ({ NoticeStack: stub("NoticeStack") }))
vi.mock("@/components/banner/AdminBanners", () => ({ AdminBanners: stub("AdminBanners") }))
vi.mock("@/components/banner/FeaturesNotice", () => ({ FeaturesNotice: stub("FeaturesNotice") }))
vi.mock("@/context/LoadingContext", () => ({ SheetProgressBar: stub("SheetProgressBar") }))
vi.mock("@/components/error/PanelErrorBoundary", () => ({ PanelErrorBoundary: stub("PanelErrorBoundary") }))
// The shell's TaskInPlace warms the task sheet once the page is idle (lib/offline/warmAhead) through panelLoaders: a
// mock without it threw "No panelLoaders export" from that timer, as an unhandled error, whenever it fired in this file.
vi.mock("@/components/rightPanel/rightPanel", () => ({
  PreloadPanels: stub("PreloadPanels"),
  RightPanel: stub("RightPanel"),
  usePreloadPanels: () => undefined,
  panelLoaders: { task: async () => ({ warmTaskParts: () => undefined }) },
}))
vi.mock("@/components/ui/PageTransition", () => ({ PageTransition: stub("PageTransition") }))
vi.mock("@/components/ai/AgentNoteOnOpen", async () => {
  const { useEffect } = await import("react")
  const Drawn = stub("AgentNoteOnOpen")
  return {
    AgentNoteOnOpen: function AgentNoteOnOpen() {
      useEffect(() => {
        notes.mounted++
        return () => void notes.unmounted++
      }, [])
      return <Drawn />
    },
  }
})
vi.mock("@/components/time/RunningTimerChip", () => ({ RunningTimerChip: stub("RunningTimerChip") }))
vi.mock("@/components/split/SplitPane", () => ({ SplitPane: stub("SplitPane") }))
vi.mock("@/components/split/MeetingSplit", () => ({ MeetingSplit: stub("MeetingSplit") }))
vi.mock("@/components/split/Seam", () => ({ Seam: stub("Seam") }))
vi.mock("@/components/split/FocusPill", () => ({ FocusPill: stub("FocusPill") }))
vi.mock("@/components/shortcuts/ShortcutsDialog", () => ({ ShortcutsDialog: stub("ShortcutsDialog") }))
vi.mock("@/components/ui/overlaySheet", () => ({ OverlaySheet: stub("OverlaySheet") }))
vi.mock("@/components/onboarding/KeysTipLoader", () => ({ KeysTipLoader: stub("KeysTipLoader") }))
vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: stub("ResizablePanelGroup"),
  ResizablePanel: forwardRef<HTMLDivElement, { children?: ReactNode }>(function ResizablePanel({ children }, _ref) {
    draws.set("ResizablePanel", (draws.get("ResizablePanel") ?? 0) + 1)
    return <div data-stub="ResizablePanel">{children}</div>
  }),
}))

afterEach(cleanup)

function Page() {
  return <p>the page</p>
}

/** The shell at `url`, as the app draws it, once what follows its first draw has settled. */
async function shellAt(url: string) {
  draws.clear()
  const store = configureStore({ reducer: { rightPanel: rightPanelSlice.reducer, split: splitSlice.reducer } })
  const at = renderAtAddress(
    <Provider store={store}>
      <AppRouterProvider>
        <LayoutContent>
          <Page />
        </LayoutContent>
      </AppRouterProvider>
    </Provider>,
    url,
  )
  await settled()
  return { ...at, store }
}

/**
 * Until a beat goes by with nothing drawn: the effects that follow the first
 * draw, and whatever they start. A fixed 20 ms read the budget wrong under
 * load, when a late draw fell into the writes counted after it (CODE-REVIEW,
 * 22 Oct 2026).
 */
async function settled() {
  await vi.waitFor(
    async () => {
      const seen = total()
      await act(async () => {
        await new Promise((r) => setTimeout(r, 25))
      })
      expect(total()).toBe(seen)
    },
    { timeout: 5_000, interval: 0 },
  )
}

describe("the shell's render budget", () => {
  it("draws the shell 0 times on a write to the query alone", async () => {
    const at = await shellAt("/app/calendar?date=2026-10-21")
    expect(at.getByText("the page")).toBeTruthy()
    expect(draws.get("Shell")).toBeGreaterThan(0)
    const before = total()
    act(() => at.go("/app/calendar?date=2026-10-22"))
    act(() => at.go("/app/calendar?date=2026-10-22&view=week"))
    act(() => at.go("/app/calendar?view=week#today"))
    expect(total() - before).toBe(0)
  })

  // H1, "the shell holds still" (FLUIDITY-LEAD-11, 5 Nov 2026): on a
  // profiling build of beta 3750d5b14 the shell drew once or twice on every
  // move and on the first click, and ~300 chrome components with it (Home
  // 1,897 renders, Inbox 4,272). It read the path itself, and the whole split
  // slice, so `here` (written on every move) and `used` (the first click's
  // setActive) drew it though it draws neither. The sidebar and the page follow
  // the path on their own.
  it("draws the shell 0 times when the path moves", async () => {
    const at = await shellAt("/app/home")
    const before = total()
    act(() => at.go("/app/inbox"))
    act(() => at.go("/app/channel/c4a70000-0000-4000-8000-000000000002"))
    act(() => at.go("/app/channel/c4a70000-0000-4000-8000-000000000003"))
    await settled()
    expect(total() - before, drawn()).toBe(0)
  })

  // FollowRoute, the leaf beside the shell, writes the page's own item to split's `here` on each move (going to an
  // item open beside swaps the two, store/slice/splitSlice); the shell draws nothing for it (above).
  it("writes the page's item to split's here when the path moves (FollowRoute)", async () => {
    const at = await shellAt("/app/home")
    const here = () => at.store.getState().split.here
    expect(here()).toBeNull()
    act(() => at.go("/app/channel/c4a70000-0000-4000-8000-000000000002"))
    expect(here()).toEqual({ kind: "channel", id: "c4a70000-0000-4000-8000-000000000002" })
    act(() => at.go("/app/doc/d0c50000-0000-4000-8000-000000000001"))
    expect(here()).toEqual({ kind: "doc", id: "d0c50000-0000-4000-8000-000000000001" })
    act(() => at.go("/app/inbox"))
    expect(here()).toBeNull()
  })

  it("draws the shell 0 times on a split write that changes nothing it draws", async () => {
    const at = await shellAt("/app/channel/c4a70000-0000-4000-8000-000000000002")
    const before = total()
    act(() => {
      // The same item again, the switch as it is, the room as it is, sizes as they are.
      at.store.dispatch(setHere({ kind: "channel", id: "c4a70000-0000-4000-8000-000000000002" }))
      at.store.dispatch(setSplitOn(true))
      at.store.dispatch(setRoom(at.store.getState().split.room))
      at.store.dispatch(setSizes({}))
      // The page, already the active view: only `used` learns it.
      at.store.dispatch(setActive(MAIN))
    })
    expect(total() - before, drawn()).toBe(0)
  })

  it("draws the shell 0 times on the first pointerdown in the page", async () => {
    const at = await shellAt("/app/home")
    const before = total()
    const page = within(at.container).getByText("the page")
    act(() => void fireEvent.pointerDown(page))
    act(() => void fireEvent.focusIn(page))
    expect(total() - before, drawn()).toBe(0)
  })

  it("is counted: the shell draws again when what it draws moves (a view opened beside)", async () => {
    const at = await shellAt("/app/home")
    const before = draws.get("Shell") ?? 0
    act(() => void at.store.dispatch(openInSplit({ kind: "channel", id: "c4a70000-0000-4000-8000-000000000002" })))
    expect((draws.get("Shell") ?? 0) - before).toBeGreaterThan(0)
    await settled()
    expect(at.container.querySelectorAll('[data-stub="SplitPane"]').length).toBe(1)
  })
})

// V-385 (DESIGN-BUILD-101's call-stage look, 3 Nov): on a computer a call's page is a frame of its own
// (MeetingSplit), and the shell mounted the daily note's watch only in the phone's frame and the desktop shell. A move
// into a call unmounted it, ending its watch with a note up (that note sat on the call's stage until its own time ran
// out, and never came back), and a call's page opened first never asked for the note. The one watch now sits above
// every frame, in app/app/layout.tsx beside the shell (app/app/noteWatch.test.ts), so the shell mounts none.
describe("the daily note's watch", () => {
  const watching = (at: { container: HTMLElement }) => at.container.querySelectorAll('[data-stub="AgentNoteOnOpen"]').length

  it("is never the shell's, in any frame: a move into a call's page on a computer can't end it", async () => {
    const at = await shellAt("/app/home")
    expect(watching(at), "the desktop shell").toBe(0)
    act(() => at.go("/app/meet/instant"))
    await settled()
    expect(draws.get("MeetingSplit"), "the call's own frame").toBeGreaterThan(0)
    expect(watching(at), "a call's frame").toBe(0)
    expect(notes.mounted, "never mounted by the shell").toBe(0)
  })
})

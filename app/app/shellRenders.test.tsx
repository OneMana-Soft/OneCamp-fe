import { act } from "@testing-library/react"
import { forwardRef, type ReactNode } from "react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import { describe, expect, it, vi } from "vitest"
import rightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import splitSlice from "@/store/slice/splitSlice"
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
vi.mock("@/components/rightPanel/rightPanel", () => ({ PreloadPanels: stub("PreloadPanels"), RightPanel: stub("RightPanel"), usePreloadPanels: () => undefined }))
vi.mock("@/components/ui/PageTransition", () => ({ PageTransition: stub("PageTransition") }))
vi.mock("@/components/ai/AgentNoteOnOpen", () => ({ AgentNoteOnOpen: stub("AgentNoteOnOpen") }))
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
  return at
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

  it("is counted: the shell draws again when the path moves (it follows the page)", async () => {
    const at = await shellAt("/app/home")
    const before = draws.get("Shell") ?? 0
    act(() => at.go("/app/inbox"))
    expect((draws.get("Shell") ?? 0) - before).toBe(1)
  })
})

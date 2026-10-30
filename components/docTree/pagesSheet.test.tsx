// The render counter goes first: React must find its hook as it starts.
import { renders, resetRenders } from "@/components/tree/treeTestKit"

import * as React from "react"
import { readFileSync } from "node:fs"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import userSlice from "@/store/slice/userSlice"
import type { TreeNodeJSON } from "@/types/docGraph"

// fluid-06, Fix 3: the phone's Pages sheet. On beta it opened in 637 ms with
// 1,608 renders: its chunk and its three groups' levels were fetched as it
// was tapped, and every row mounted in the frame the sheet began to rise. Its
// chunk and first levels now warm on the docs home's quiet; the sheet draws at
// once, and its groups mount once the slide is under way, a group a frame.

const gets: string[] = []
const top = (space: string): TreeNodeJSON[] => Array.from({ length: 8 }, (_, i) => ({ kind: "doc", uuid: `${space}-page-${i}`, title: `${space} ${i}`, has_children: i === 0, can_edit: true }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: {
    get: async (url: string) => {
      gets.push(url)
      const space = new URL(url, "http://x").searchParams.get("space") ?? ""
      const nodes = space ? top(space) : []
      return { data: { data: { parent: "", nodes, hidden: 0, count: nodes.length } } }
    },
    post: vi.fn(),
  },
}))
const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch: vi.fn() }), usePathname: () => "/app/doc" }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: true, isDesktop: false }) }))
vi.mock("@/components/ui/overlayMode", () => ({ useSheetMode: () => true, SHEET_QUERY: "(max-width: 639px)" }))

// The sheet's chunk is large to compile the first time: done once, before
// any test is timed, so no test's work runs on into the next.
beforeAll(async () => {
  await import("./PagesSheet")
  await import("./pagesSheetWarm")
}, 60_000)

const frames: FrameRequestCallback[] = []
// The sheet's "landed without saying so" timer, held here: a loaded machine
// took longer than a rise's time between the test's own frames, and the
// groups came in on the timer before the test looked (a flake in a full run).
const late: Array<() => void> = []
beforeEach(async () => {
  gets.length = 0
  frames.length = 0
  late.length = 0
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => (frames.push(cb), frames.length))
  vi.stubGlobal("cancelAnimationFrame", () => {})
  const { LAND_MS } = await import("./PagesSheet")
  const real = window.setTimeout.bind(window)
  vi.spyOn(window, "setTimeout").mockImplementation(((cb: () => void, ms?: number, ...rest: unknown[]) =>
    ms === LAND_MS ? (late.push(cb), 0) : real(cb, ms, ...rest)) as unknown as typeof window.setTimeout)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const nextFrame = () => act(() => frames.splice(0).forEach((cb) => cb(performance.now())))

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={configureStore({ reducer: { users: userSlice.reducer } })}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SWRMutateBridge />
        {children}
      </SWRConfig>
    </Provider>
  )
}

describe("the Pages sheet (fluid-06, Fix 3)", () => {
  it("warms its chunk and its three groups' first levels when asked, on the docs home's quiet", async () => {
    const { warmPagesSheet } = await import("./pagesSheetWarm")
    render(<Shell>{null}</Shell>)
    await act(async () => void (await warmPagesSheet()))
    await waitFor(() => expect(gets.sort()).toEqual(["/doc/children?space=private&limit=50", "/doc/children?space=shared&limit=50", "/doc/children?space=workspace&limit=50"]))
    expect(readFileSync("components/doc/docListTabs.tsx", "utf8")).toMatch(/warmPagesSheet/)
  })

  it("draws the sheet at once, the first group once the slide is under way, and the rest once it has landed", async () => {
    const { warmPagesSheet } = await import("./pagesSheetWarm")
    const { default: PagesSheet } = await import("./PagesSheet")
    // The docs home, warmed on its quiet; then the sheet, from the same cache.
    const page = (open: boolean) => (
      <Shell>
        <Warm warm={warmPagesSheet} />
        {open ? <PagesSheet onClose={() => {}} /> : null}
      </Shell>
    )
    const { rerender } = render(page(false))
    await waitFor(() => expect(gets.filter((u) => u.startsWith("/doc/children"))).toHaveLength(3))
    await act(async () => {})
    resetRenders()
    rerender(page(true))
    const sheet = await screen.findByRole("dialog")
    // The frame the sheet begins to rise in has no rows to build.
    expect(sheet.querySelectorAll('[role="treeitem"]')).toHaveLength(0)
    expect(sheet.querySelector("[data-doc-tree-skeleton]")).not.toBeNull()
    await nextFrame()
    await nextFrame()
    await waitFor(() => expect(sheet.querySelectorAll('[data-doc-tree="workspace"] [role="treeitem"]').length).toBeGreaterThan(0))
    // The first screen is the first group's: the others wait out the slide
    // (LEAD-6, 21 Oct: 428 ms against 300 with every group built in it).
    for (let i = 0; i < 4; i++) await nextFrame()
    expect(sheet.querySelectorAll('[data-doc-tree="shared"] [role="treeitem"], [data-doc-tree="private"] [role="treeitem"]')).toHaveLength(0)
    // The sheet has landed: its own rise ends (a row's animation inside it is not its end).
    fireEvent.animationEnd(sheet.querySelector("[data-doc-tree-skeleton]") ?? sheet.firstElementChild!)
    await act(async () => {})
    expect(sheet.querySelectorAll('[data-doc-tree="private"] [role="treeitem"]')).toHaveLength(0)
    fireEvent.animationEnd(sheet)
    await waitFor(() => expect(sheet.querySelectorAll('[data-doc-tree="private"] [role="treeitem"]').length).toBeGreaterThan(0))
    expect(sheet.querySelectorAll('[data-doc-tree="shared"] [role="treeitem"]').length).toBeGreaterThan(0)
    // Warm levels: the sheet read no level of its own (the person, which
    // the shell has in the app, is asked here as the test has no shell).
    expect(gets.filter((u) => u.startsWith("/doc/children"))).toHaveLength(3)
    expect(renders().total, JSON.stringify(renders().top())).toBeLessThanOrEqual(400)
  })
})

describe("the Pages sheet without its rise's end (motion reduced)", () => {
  it("brings in the other groups once a rise's time has passed", async () => {
    const { default: PagesSheet } = await import("./PagesSheet")
    render(
      <Shell>
        <PagesSheet onClose={() => {}} />
      </Shell>,
    )
    await nextFrame()
    await nextFrame()
    const sheet = await screen.findByRole("dialog")
    await waitFor(() => expect(sheet.querySelectorAll('[data-doc-tree="workspace"] [role="treeitem"]').length).toBeGreaterThan(0))
    expect(sheet.querySelectorAll('[data-doc-tree="private"] [role="treeitem"]')).toHaveLength(0)
    // A rise's time passes.
    expect(late).toHaveLength(1)
    await act(async () => late.forEach((land) => land()))
    await waitFor(() => expect(sheet.querySelectorAll('[data-doc-tree="private"] [role="treeitem"]').length).toBeGreaterThan(0))
  })
})

describe("a page opened from the Pages sheet (fluid-06: the phone's doc-open INP)", () => {
  it("only navigates on the tap: the sheet goes with the old page, not in the tap's own work", async () => {
    const { default: PagesSheet } = await import("./PagesSheet")
    const onClose = vi.fn()
    render(
      <Shell>
        <PagesSheet onClose={onClose} />
      </Shell>,
    )
    for (let i = 0; i < 6; i++) await nextFrame()
    const row = await screen.findByRole("treeitem", { name: "workspace 1" })
    resetRenders()
    await act(async () => void row.click())
    expect(push).toHaveBeenCalledWith("/app/doc/workspace-page-1")
    expect(onClose).not.toHaveBeenCalled()
    expect(renders().total, JSON.stringify(renders().top())).toBeLessThanOrEqual(10)
  })
})

function Warm({ warm }: { warm: () => Promise<void> }) {
  React.useEffect(() => void warm(), [warm])
  return null
}

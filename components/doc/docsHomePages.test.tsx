import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"

// The phone's Pages button (fluid-06, the Pages sheet's open). Its open state
// lived in the docs home, so a tap on Pages rendered the whole home again
// (its tabs, its toolbar's popovers and menus, its list) in the tap's own
// work, and again as the sheet closed: about a hundred renders of the 545 the
// sheet's open cost on a phone (LEAD-6's names, 21 Oct). The button keeps
// its own state: the sheet opens and closes without the home.

const hoisted = vi.hoisted(() => ({ toolbar: 0, list: 0, sheetLoads: 0 }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/doc",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
}))
const get = vi.hoisted(() => vi.fn(async (url: string) => (void url, { data: { data: { docs: [], count: 0, next_cursor: "" } } })))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get } }))
vi.mock("@/hooks/useHydrateUserSidebar", () => ({ useSidenav: () => ({ data: { data: { user_uuid: "me" } } }) }))
vi.mock("@/components/doc/useCreateDoc", () => ({ useCreateDoc: () => ({ create: vi.fn(), busy: null }) }))
vi.mock("@/components/doc/NewDocButton", () => ({ NewDocButton: () => null }))
// The phone's app bar, drawn in place.
vi.mock("@/components/navigationBar/mobile/phoneBarActions", () => ({ PhoneBarActions: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@/components/doc/docListTabContent", () => ({
  DocListTabContent: () => {
    hoisted.list++
    return <div data-testid="list" />
  },
}))
vi.mock("@/components/doc/DocSearchResults", () => ({ DocSearchResults: () => null }))
vi.mock("@/components/doc/DocsToolbar", () => ({
  DocsToolbar: () => {
    hoisted.toolbar++
    return null
  },
}))
vi.mock("@/components/docTree/pagesSheetWarm", () => ({ warmPagesSheet: vi.fn(async () => {}) }))
vi.mock("@/components/docTree/PagesSheet", () => (hoisted.sheetLoads++, {
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Pages" data-pages-sheet="">
      <button type="button" onClick={onClose}>
        Close the sheet
      </button>
    </div>
  ),
}))

import { DocListTabs } from "./docListTabs"

afterEach(cleanup)

describe("the phone's Pages button", () => {
  // fluid-06: behind Suspense, React held its fallback 300 ms after the tap
  // even with the sheet's code in (its reveal throttle): the sheet opened in
  // 434 ms on a 4x phone. Its code comes on the home's quiet, and a tap draws
  // it in the tap's own render. First in the file: the code comes once.
  it("draws the sheet in the tap's own render, its code fetched on the home's quiet", async () => {
    vi.stubGlobal("matchMedia", (media: string) => ({ matches: true, media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }))
    try {
      render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
          <DocListTabs />
        </SWRConfig>,
      )
      await screen.findByTestId("list")
      expect(hoisted.sheetLoads).toBe(0)
      await waitFor(() => expect(hoisted.sheetLoads).toBe(1), { timeout: 5000 })
      fireEvent.click(screen.getByRole("button", { name: "Pages" }))
      // No await: on screen in the tap's own render.
      expect(screen.getByRole("dialog", { name: "Pages" })).toBeTruthy()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("opens and closes the Pages sheet without rendering the docs home again", async () => {
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <DocListTabs />
      </SWRConfig>,
    )
    await screen.findByTestId("list")
    // The home settles first: its counts are asked 400 ms in (each tab's and
    // the trash's), and it draws their answers.
    await waitFor(() => expect(get.mock.calls.filter(([url]) => url.endsWith("limit=1"))).toHaveLength(7))
    await act(async () => {})
    const before = { toolbar: hoisted.toolbar, list: hoisted.list }
    fireEvent.click(screen.getByRole("button", { name: "Pages" }))
    expect(await screen.findByRole("dialog", { name: "Pages" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Close the sheet" }))
    await act(async () => {})
    expect(screen.queryByRole("dialog", { name: "Pages" })).toBeNull()
    expect({ toolbar: hoisted.toolbar, list: hoisted.list }).toEqual(before)
  })
})

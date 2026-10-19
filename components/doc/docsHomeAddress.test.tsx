import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { SWRConfig } from "swr"

// The docs home's tab in the address. Writing it there is a navigation, and
// Next keeps only the latest: the tab the home picked for itself, written once
// Recent's first page came, cancelled a navigation the person had already
// started. Undo right after More's Delete then stayed on the docs home (N32,
// 1 run in 12). So only a tab the person picks goes into the address.

const hoisted = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/doc",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: hoisted.replace, push: hoisted.push, prefetch: vi.fn() }),
}))
// No doc opened yet: Recent is empty, so the home picks Workspace.
vi.mock("@/lib/axiosInstance", () => ({
  default: { get: async () => ({ data: { data: { docs: [], count: 0, next_cursor: "" } } }) },
  OWN_ERRORS: { suppressErrorToast: true },
}))
vi.mock("@/hooks/useHydrateUserSidebar", () => ({ useSidenav: () => ({ data: { data: { user_uuid: "me" } } }) }))
vi.mock("@/components/doc/useCreateDoc", () => ({ useCreateDoc: () => ({ create: vi.fn(), busy: null }) }))
vi.mock("@/components/doc/NewDocButton", () => ({ NewDocButton: () => null }))
vi.mock("@/components/navigationBar/mobile/phoneBarActions", () => ({ PhoneBarActions: () => null }))
vi.mock("@/components/doc/docListTabContent", () => ({
  DocListTabContent: ({ tab }: { tab: string }) => <div data-testid="list">{tab}</div>,
}))
vi.mock("@/components/doc/DocSearchResults", () => ({ DocSearchResults: () => null }))
vi.mock("@/components/doc/DocsToolbar", () => ({ DocsToolbar: () => null }))

import { DocListTabs } from "./docListTabs"

afterEach(() => {
  cleanup()
  hoisted.replace.mockClear()
})

function renderHome() {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <DocListTabs />
    </SWRConfig>,
  )
}

describe("the docs home's address", () => {
  it("keeps the tab it picks for you out of the address, so it never cancels where you are going", async () => {
    renderHome()
    expect(await screen.findByTestId("list")).toHaveTextContent("workspace")
    // A moment for any effect that would write it.
    await new Promise((r) => setTimeout(r, 50))
    expect(hoisted.replace).not.toHaveBeenCalled()
  })

  it("puts a tab you pick in the address, for Back and a reload", async () => {
    renderHome()
    expect(await screen.findByTestId("list")).toHaveTextContent("workspace")
    fireEvent.click(screen.getByRole("tab", { name: /Mine/ }))
    expect(screen.getByTestId("list")).toHaveTextContent("mine")
    expect(hoisted.replace).toHaveBeenCalledWith("/app/doc?tab=mine", { scroll: false })
  })
})

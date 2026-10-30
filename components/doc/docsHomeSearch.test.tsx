import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"

// The docs home's search (docs programme B5): it looks through every doc the
// person can open, so while its results show no tab is chosen, and choosing a
// tab leaves the search for that list. The one filter it takes, whose docs,
// stays in view: a filter set on the Workspace list once narrowed a search
// with nothing on screen saying so.

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/doc",
  useSearchParams: () => new URLSearchParams("tab=workspace"),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { get: async () => ({ data: { data: { docs: [], count: 3, next_cursor: "" } } }) },
}))
vi.mock("@/hooks/useHydrateUserSidebar", () => ({ useSidenav: () => ({ data: { data: { user_uuid: "me" } } }) }))
vi.mock("@/components/doc/useCreateDoc", () => ({ useCreateDoc: () => ({ create: vi.fn(), busy: null }) }))
vi.mock("@/components/doc/NewDocButton", () => ({
  NewDocButton: ({ space }: { space?: string }) => (
    <button type="button" data-space={space ?? "private"}>
      New doc
    </button>
  ),
}))
vi.mock("@/components/navigationBar/mobile/phoneBarActions", () => ({ PhoneBarActions: () => null }))
vi.mock("@/components/doc/docListTabContent", () => ({
  DocListTabContent: ({ tab }: { tab: string }) => <div data-testid="list">{tab}</div>,
}))
vi.mock("@/components/doc/DocSearchResults", () => ({
  DocSearchResults: ({ q, owner }: { q: string; owner?: string }) => <div data-testid="results">{`${q}|${owner ?? ""}`}</div>,
}))
vi.mock("@/components/doc/DocsToolbar", () => ({
  DocsToolbar: ({ tools, onOwner }: { tools: Record<string, boolean>; onOwner: (o: { uuid: string; name: string } | null) => void }) => (
    <div data-testid="toolbar" data-tools={Object.keys(tools).filter((k) => tools[k]).join(",")}>
      <button type="button" onClick={() => onOwner({ uuid: "maya", name: "Maya" })}>
        Maya&apos;s docs
      </button>
    </div>
  ),
}))

import { DocListTabs } from "./docListTabs"

afterEach(cleanup)

function renderHome() {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <DocListTabs />
    </SWRConfig>,
  )
}

const selected = () => screen.getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true").map((t) => t.dataset.value)

describe("the docs home's search", () => {
  it("chooses no tab while its results show, and a tab chosen leaves the search", async () => {
    renderHome()
    expect(await screen.findByTestId("list")).toHaveTextContent("workspace")
    expect(selected()).toEqual(["workspace"])
    expect(screen.getByTestId("toolbar").dataset.tools).toBe("sort,owner,space,view")
    // QA DSA-34 (14 Oct 2026): New doc on the Workspace tab made a private doc.
    expect(screen.getByRole("button", { name: "New doc" }).dataset.space).toBe("workspace")

    // A filter set on the Workspace list…
    fireEvent.click(screen.getByRole("button", { name: "Maya's docs" }))
    fireEvent.change(screen.getAllByRole("searchbox", { name: "Search docs" })[0], { target: { value: "launch" } })
    // …applies to the search with its control in view, and nothing else does.
    expect(await screen.findByTestId("results")).toHaveTextContent("launch|maya")
    expect(selected()).toEqual([])
    expect(screen.getByTestId("toolbar").dataset.tools).toBe("owner")
    // With none chosen, Tab still reaches the tabs, at the first.
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute("tabindex", "0")

    fireEvent.click(screen.getByRole("tab", { name: /Mine/ }))
    await waitFor(() => expect(screen.queryByTestId("results")).toBeNull())
    // QA DSA-34: New doc makes the open tab's kind of doc, a private one off
    // the Workspace tab.
    expect(screen.getByRole("button", { name: "New doc" }).dataset.space).toBe("private")
    expect(selected()).toEqual(["mine"])
    expect(screen.getByTestId("list")).toHaveTextContent("mine")
    for (const box of screen.getAllByRole("searchbox", { name: "Search docs" })) expect(box).toHaveValue("")
  })
})

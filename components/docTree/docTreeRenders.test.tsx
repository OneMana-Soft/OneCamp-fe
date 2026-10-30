// The render counter goes first: React must find its hook as it starts.
import { renders, resetRenders } from "@/components/tree/treeTestKit"

import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import userSlice from "@/store/slice/userSlice"
import type { TreeNodeJSON } from "@/types/docGraph"

// fluid-06's render budgets on the docs tree as the sidebar draws it (five a
// level, rows with their marks and menus), over a slice of the harness's
// workspace: 40 pages at the top, the Handbook holding 120. Targets from
// pages-budgets.json: a down-arrow 10 renders, the Handbook's chevron 150,
// Show more 700; an address change renders the two current places.

const nav = vi.hoisted(() => ({ path: "/app/doc/page-0003", listeners: new Set<() => void>() }))
vi.mock("next/navigation", async () => {
  const R = await import("react")
  return {
    useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
    usePathname: () =>
      R.useSyncExternalStore(
        (l: () => void) => {
          nav.listeners.add(l)
          return () => nav.listeners.delete(l)
        },
        () => nav.path,
      ),
  }
})
const goTo = (path: string) => {
  nav.path = path
  for (const l of [...nav.listeners]) l()
}

const page = (i: number, kids = 0): TreeNodeJSON => ({ kind: "doc", uuid: `page-${String(i).padStart(4, "0")}`, title: `Page ${i}`, has_children: kids > 0, can_edit: true })
const top: TreeNodeJSON[] = [{ kind: "doc", uuid: "handbook", title: "Handbook", has_children: true, can_edit: true }, ...Array.from({ length: 39 }, (_, i) => page(i + 1))]
const handbook: TreeNodeJSON[] = Array.from({ length: 120 }, (_, i) => ({ kind: "doc", uuid: `hb-${i}`, title: `Handbook ${i}`, has_children: false, can_edit: true }))

/** A level as GET /doc/children answers it, at the limit asked. */
function levelAt(url: string) {
  const q = new URL(url, "http://x").searchParams
  const limit = Number(q.get("limit") ?? 50)
  const all = q.get("parent") === "handbook" ? handbook : q.get("space") === "workspace" ? top : []
  return { data: { parent: q.get("parent") ?? "", nodes: all.slice(0, limit), hidden: 0, count: all.length } }
}
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { get: async (url: string) => ({ data: levelAt(url) }), post: vi.fn(async () => ({ data: { data: {} } })) },
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

import { DocTree } from "./DocTree"

function show() {
  render(
    <Provider store={configureStore({ reducer: { users: userSlice.reducer } })}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SWRMutateBridge />
        <DocTree space="workspace" label="Workspace pages" cap={5} />
      </SWRConfig>
    </Provider>,
  )
}
const top12 = () => JSON.stringify(renders().top())

beforeEach(() => {
  nav.path = "/app/doc/page-0003"
  window.localStorage.clear()
})
afterEach(cleanup)

describe("the docs tree's renders (fluid-06)", () => {
  it("moves focus down a row for at most 10 renders", async () => {
    show()
    const first = await screen.findByRole("treeitem", { name: "Handbook" })
    act(() => first.focus())
    resetRenders()
    act(() => void fireEvent.keyDown(first, { key: "ArrowDown" }))
    expect(screen.getByRole("treeitem", { name: "Page 1" })).toHaveFocus()
    expect(renders().total, top12()).toBeLessThanOrEqual(10)
  })

  it("opens the Handbook by its chevron for at most 150 renders", async () => {
    show()
    await screen.findByRole("treeitem", { name: "Handbook" })
    resetRenders()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Open Handbook" })))
    await screen.findByRole("treeitem", { name: "Handbook 0" })
    expect(renders().total, top12()).toBeLessThanOrEqual(150)
  })

  it("shows the rest of the top for at most 700 renders", async () => {
    show()
    await screen.findByRole("treeitem", { name: "Handbook" })
    resetRenders()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Show 35 more" })))
    await screen.findByRole("treeitem", { name: "Page 39" })
    expect(renders().total, top12()).toBeLessThanOrEqual(700)
  })

  it("renders the two current places when the address changes, not the tree", async () => {
    show()
    await screen.findByRole("treeitem", { name: "Page 3" })
    await waitFor(() => expect(screen.getByRole("treeitem", { name: "Page 3" })).toHaveAttribute("aria-current", "page"))
    resetRenders()
    act(() => goTo("/app/doc/page-0004"))
    expect(screen.getByRole("treeitem", { name: "Page 4" })).toHaveAttribute("aria-current", "page")
    const r = renders()
    expect(r.of("TreeRow"), top12()).toBeLessThanOrEqual(2)
    expect(r.total, top12()).toBeLessThanOrEqual(12)
  })
})

void React

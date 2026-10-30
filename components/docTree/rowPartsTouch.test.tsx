import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import { TooltipProvider } from "@/components/ui/tooltip"
import userSlice from "@/store/slice/userSlice"
import type { TreeNodeJSON } from "@/types/docGraph"

// A finger rests on nothing before it presses (fluid-06, the cold tree): on a
// touch screen a docs tree fetches its rows' menu, and where rows are chosen
// the bulk bar, once the page is quiet, so a "⋯" or a long press opens at
// once. With a mouse they wait for the pointer to rest (rowPartsAhead.test).

const asked = vi.hoisted(() => ({ menu: 0, bar: 0 }))
vi.mock("@/components/docTree/DocRowMenu", async (real) => (asked.menu++, real()))
vi.mock("@/components/docFiles/BulkBar", async (real) => (asked.bar++, real()))
const idle = vi.hoisted(() => [] as Array<() => void>)
vi.mock("@/lib/whenIdle", () => ({ whenIdle: (run: () => void) => (idle.push(run), () => {}) }))

const rows: TreeNodeJSON[] = [{ kind: "doc", uuid: "page-1", title: "Launch plan", has_children: false, can_edit: true }]
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { get: async () => ({ data: { data: { parent: "", nodes: rows, hidden: 0, count: rows.length } } }), post: vi.fn(), delete: vi.fn() },
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/app/project/p-1" }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: true, isDesktop: false }) }))
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(() => ({ id: "t", dismiss: vi.fn(), update: vi.fn() })) }))

import { DocTree } from "./DocTree"

const screenIs = (hoverNone: boolean) =>
  vi.stubGlobal("matchMedia", (media: string) => ({ matches: media === "(hover: none)" ? hoverNone : false, media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }))

async function showQuiet() {
  render(
    <Provider store={configureStore({ reducer: { users: userSlice.reducer } })}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SWRMutateBridge />
        <TooltipProvider>
          <DocTree space="project:p-1" label="Website relaunch's docs" dense={false} cap={50} selectable />
        </TooltipProvider>
      </SWRConfig>
    </Provider>,
  )
  await screen.findByRole("treeitem", { name: "Launch plan" })
  // The page is quiet: everything waiting for it runs.
  await act(async () => idle.splice(0).forEach((run) => run()))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  idle.length = 0
})

// In order: with a mouse first, while nothing has been fetched.
describe("a docs tree's row parts, on a quiet page", () => {
  it("wait for the pointer to rest where there's a mouse", async () => {
    screenIs(false)
    await showQuiet()
    await act(async () => {})
    expect(asked).toEqual({ menu: 0, bar: 0 })
  })

  it("come once the page is quiet on a touch screen: the menu, and the bar where rows are chosen", async () => {
    screenIs(true)
    await showQuiet()
    // (The bar's own import of the menu's colours can count the menu twice.)
    await waitFor(() => {
      expect(asked.menu).toBeGreaterThan(0)
      expect(asked.bar).toBe(1)
    })
  })
})

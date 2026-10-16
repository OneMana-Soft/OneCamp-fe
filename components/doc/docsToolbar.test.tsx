import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

// The docs home's sort and filters (docs programme B5): a filter counts only
// where its control shows, so a list that ignores it never offers "Clear
// filters"; and on a phone, which always lists rows, a list with nothing but
// cards-or-rows to change draws no empty band above it.

// One function across renders, as the hook's own is.
const makeRequest = vi.fn(async () => [])
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest }) }))

import { DocsToolbar } from "./DocsToolbar"

afterEach(cleanup)

const NONE = { sort: false, owner: false, space: false, view: true }
const MAYA = { uuid: "maya", name: "Maya" }

function renderBar(tools: typeof NONE, owner: typeof MAYA | null = null, off?: { sort?: string; owner?: string; space?: string }) {
  const store = configureStore({ reducer: { users: (s = { userSidebar: { userProjects: [{ project_uuid: "p1", project_name: "Q4 launch" }], userTeams: [] } }) => s } })
  return render(
    <Provider store={store}>
      <DocsToolbar
        tools={tools}
        sort="edited"
        onSort={() => {}}
        owner={owner}
        onOwner={() => {}}
        space={null}
        onSpace={() => {}}
        view="grid"
        onView={() => {}}
        off={off}
      />
    </Provider>,
  )
}

describe("the docs toolbar", () => {
  it("offers Clear filters only where the filter it clears applies", () => {
    renderBar(NONE, MAYA)
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull()
    cleanup()
    renderBar({ ...NONE, owner: true }, MAYA)
    expect(screen.getByRole("button", { name: /Owner: Maya/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy()
  })

  it("draws no band on a phone when cards or rows is all it holds", () => {
    const { container } = renderBar(NONE)
    expect(container.querySelector("[data-docs-toolbar]")?.className).toMatch(/max-sm:hidden/)
    cleanup()
    const withSort = renderBar({ ...NONE, sort: true })
    expect(withSort.container.querySelector("[data-docs-toolbar]")?.className).not.toMatch(/max-sm:hidden/)
  })

  // QA DSA-31 (14 Oct 2026): the row changed from tab to tab: the owner
  // filter on Workspace alone, and Recent had none. Every tab draws the same
  // row; what doesn't apply is dimmed, says why, and opens nothing.
  it("draws the same row on every tab, dimming what doesn't apply and saying why", async () => {
    const { tabToolsOff, tabTools } = await import("@/lib/utils/docTab")
    renderBar({ ...tabTools("recent"), view: true }, MAYA, tabToolsOff("recent"))
    for (const [name, why] of [[/Last edited/, "Recent is in the order you opened them"], [/Owner: anyone/, "Recent is what you opened"], [/All spaces/, "Recent is what you opened"]] as const) {
      const chipEl = screen.getByRole("button", { name })
      expect(chipEl.getAttribute("aria-disabled")).toBe("true")
      expect(chipEl.getAttribute("title")).toBe(why)
      fireEvent.click(chipEl)
      expect(screen.queryByRole("menu")).toBeNull()
    }
    // A filter that doesn't apply here is not offered for clearing either.
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull()
    cleanup()
    renderBar({ ...tabTools("mine"), view: true }, null, tabToolsOff("mine"))
    expect(screen.getByRole("button", { name: /Owner: anyone/ }).getAttribute("title")).toBe("Every doc in Mine is yours")
    expect(screen.getByRole("button", { name: /Last edited/ }).hasAttribute("aria-disabled")).toBe(false)
  })

  it("draws nothing when there is nothing to change", () => {
    const { container } = renderBar({ ...NONE, view: false })
    expect(container.querySelector("[data-docs-toolbar]")).toBeNull()
  })
})

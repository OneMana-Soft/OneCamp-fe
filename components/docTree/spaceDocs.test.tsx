import * as React from "react"
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import userSlice from "@/store/slice/userSlice"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { TreeNodeJSON } from "@/types/docGraph"

// A project's and a team's docs (docs programme B5, structure.md P1.9): the
// pages made in its space, and New doc making the next one there. Each page
// loads it as a chunk of its own, when its tab is shown. Docs & Files (docs
// F1b): "▾" beside New doc adds a folder, files or a link there, rows are
// chosen together, and files dropped on it, empty or not, upload to it.

const levels: Record<string, TreeNodeJSON[]> = {}
const post = vi.fn(async (url: string, body: unknown, config?: unknown) => {
  void body
  void config
  if (url === "/doc/files") return { data: { data: { kind: "doc", uuid: "up-1", title: "x", has_children: false, node_kind: "file" } } }
  return { data: { data: { doc_uuid: "made-0001", doc_title: "" } } }
})
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: {
    get: async (url: string) => ({ data: { data: { parent: "", nodes: levels[url] ?? [], hidden: 0, count: (levels[url] ?? []).length } } }),
    post: (...args: [string, unknown, unknown?]) => post(...args),
  },
}))
const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch: vi.fn() }), usePathname: () => "/app/project/p-1" }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(() => ({ id: "t", dismiss: vi.fn(), update: vi.fn() })) }))

import SpaceDocs from "./SpaceDocs"

function renderDocs(ui: React.ReactNode) {
  render(
    <Provider store={configureStore({ reducer: { users: userSlice.reducer } })}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <TooltipProvider>{ui}</TooltipProvider>
      </SWRConfig>
    </Provider>,
  )
}

beforeEach(() => {
  for (const k of Object.keys(levels)) delete levels[k]
  post.mockClear()
  push.mockClear()
})
afterEach(cleanup)

describe("a space's docs", () => {
  it("with none yet, says what goes there and makes the first in the space", async () => {
    renderDocs(<SpaceDocs space="project:p-1" name="Q4 launch" />)
    expect(await screen.findByRole("heading", { name: "No docs or files in this project yet" })).toBeTruthy()
    expect(screen.getByText("Plans, specs, files and links for Q4 launch go here. Drop files here to upload them.")).toBeTruthy()
    // One New doc, in the tab's band with the one primary at its end, as on
    // every project tab, and "▾" for the rest; the empty state offers
    // templates, not a second one.
    const band = document.querySelector<HTMLElement>("[data-work-toolbar]")!
    const buttons = Array.from(band.querySelectorAll("button")).map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim())
    expect(buttons).toEqual(["From a template", "New doc", "More to add"])
    fireEvent.click(screen.getByRole("button", { name: "New doc" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/doc/createDoc", { doc_title: "", space: "project:p-1", doc_private: true }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/doc/made-0001?new=1"))
  })

  it("shows its pages as a tree with a page's 36 px rows", async () => {
    levels["/doc/children?space=team%3At-1&limit=100"] = [{ kind: "doc", uuid: "rituals-01", title: "Team rituals", has_children: false, can_edit: true }]
    renderDocs(<SpaceDocs space="team:t-1" name="Launch team" variant="card" />)
    const row = await screen.findByRole("treeitem", { name: "Team rituals" })
    expect(row.closest("[data-doc-tree]")?.className).toMatch(/\[&_\.shell-row\]:h-9/)
    // The team page's card, titled as its Projects card is, with From a
    // template as its icon: three cards share the page's width.
    const card = row.closest<HTMLElement>("[data-space-docs]")!
    expect(card.querySelector("h2")?.textContent).toBe("Docs")
    const template = screen.getByRole("button", { name: "From a template" })
    expect(template.textContent?.trim()).toBe("")
    expect(screen.getByRole("button", { name: "New doc" })).toBeTruthy()
  })
})

describe("Docs & Files", () => {
  const files = () => post.mock.calls.filter(([url]) => url === "/doc/files").map(([, body]) => Object.fromEntries([...(body as FormData).entries()].map(([k, v]) => [k, typeof v === "string" ? v : (v as File).name])))

  it("adds a folder, files or a link from ▾", async () => {
    renderDocs(<SpaceDocs space="project:p-1" name="Q4 launch" />)
    await act(async () => fireEvent.keyDown(await screen.findByRole("button", { name: "More to add" }), { key: "Enter" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Folder" }))
    // The dialogs are a chunk of their own, loaded as the first one opens.
    expect(await screen.findByRole("textbox", { name: "Name" }, { timeout: 5000 })).toBeTruthy()
    cleanup()
    renderDocs(<SpaceDocs space="project:p-1" name="Q4 launch" />)
    await act(async () => fireEvent.keyDown(await screen.findByRole("button", { name: "More to add" }), { key: "Enter" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Link" }))
    expect(await screen.findByRole("textbox", { name: "Link" }, { timeout: 5000 })).toBeTruthy()
  })

  it("uploads what's chosen from Upload files to the space", async () => {
    renderDocs(<SpaceDocs space="project:p-1" name="Q4 launch" />)
    const input = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>("input[data-upload-input]")
      expect(el).not.toBeNull()
      return el!
    })
    const click = vi.spyOn(input, "click").mockImplementation(() => {})
    await act(async () => fireEvent.keyDown(screen.getByRole("button", { name: "More to add" }), { key: "Enter" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Upload files" }))
    expect(click).toHaveBeenCalled()
    await act(async () => fireEvent.change(input, { target: { files: [new File(["x"], "brief.pdf")] } }))
    await waitFor(() => expect(files()).toEqual([{ file: "brief.pdf", space: "project:p-1" }]))
  })

  it("takes files dropped on it while it's empty", async () => {
    renderDocs(<SpaceDocs space="project:p-1" name="Q4 launch" />)
    const zone = (await screen.findByRole("heading", { name: "No docs or files in this project yet" })).closest<HTMLElement>("[data-file-drop]")!
    const dataTransfer = { types: ["Files"], files: [new File(["x"], "deck.pptx")], dropEffect: "" }
    fireEvent(zone, createEvent.dragOver(zone, { dataTransfer }))
    expect(zone).toHaveAttribute("data-over", "true")
    fireEvent(zone, createEvent.drop(zone, { dataTransfer }))
    await waitFor(() => expect(files()).toEqual([{ file: "deck.pptx", space: "project:p-1" }]))
  })

  it("lets its rows be chosen together", async () => {
    levels["/doc/children?space=project%3Ap-1&limit=100"] = [{ kind: "doc", uuid: "plan-0001", title: "Plan", has_children: false, can_edit: true }]
    renderDocs(<SpaceDocs space="project:p-1" name="Q4 launch" />)
    await screen.findByRole("treeitem", { name: "Plan" })
    expect(screen.getByRole("tree")).toHaveAttribute("aria-multiselectable", "true")
  })
})

describe("its frame", () => {
  it("draws a project's tab in the frame every project tab does, not a centred column", () => {
    const src = readFileSync("components/docTree/SpaceDocs.tsx", "utf8")
    expect(src).toMatch(/className=\{workToolbar\}/)
    expect(src).toContain("<WorkState>")
    expect(src).not.toMatch(/mx-auto/)
  })

  it("stands the team card's heading in while its code arrives", () => {
    expect(readFileSync("components/team/TeamDesktop.tsx", "utf8")).toMatch(/loading: \(\) => <SpaceDocsCardFallback \/>/)
  })
})

describe("where it loads", () => {
  it("is a chunk of its own on a project's page and the team's, never on their first load", () => {
    const desktop = readFileSync("components/project/projectTaskDesktop.tsx", "utf8")
    expect(desktop).toMatch(/lazyView\(\(\) => import\("@\/components\/docTree\/SpaceDocs"\)\)/)
    expect(desktop).toMatch(/"docs"\] as const/)
    for (const f of ["components/project/projectListTabs.tsx", "components/team/TeamDesktop.tsx", "components/team/TeamListTabContent.tsx"]) {
      const src = readFileSync(f, "utf8")
      expect(src, f).toMatch(/dynamic\(\(\) => import\("@\/components\/docTree\/SpaceDocs"\)/)
      expect(src, f).not.toMatch(/^import .*docTree\/SpaceDocs"/m)
    }
  })
})

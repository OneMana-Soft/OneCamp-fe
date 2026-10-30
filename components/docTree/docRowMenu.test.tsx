import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import { SWRConfig } from "swr"

import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import userSlice from "@/store/slice/userSlice"

// A row's "⋯" by kind (docs F1b): a file offers its preview, download, a new
// version and its versions; a folder uploads and takes links; a link opens
// in a new tab and copies its address; every kind takes a colour (a submenu
// of named colours on a computer, the colour sheet on a phone) and Move to….
// On a phone the menu is a sheet, and Select starts choosing rows.

const sheet = vi.hoisted(() => ({ on: false }))
vi.mock("@/components/ui/overlayMode", () => ({ useSheetMode: () => sheet.on, SHEET_QUERY: "" }))
const post = vi.fn(async (url: string, body: unknown, config?: unknown): Promise<{ data: { data: unknown } }> => {
  void url
  void body
  void config
  return { data: { data: { count: 1 } } }
})
const get = vi.fn(async (url: string): Promise<{ data: unknown }> => ({ data: { msg: "ok", url: `https://files.example/${url.split("/").pop()}` } }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { get: (url: string) => get(url), post: (url: string, body: unknown, config?: unknown) => post(url, body, config) },
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/app/project/p-1" }))
const downloads = vi.fn()
vi.mock("@/lib/utils/file/downloadFile", () => ({ downloadFile: (url: string, name: string) => downloads(url, name) }))
const toasts = vi.fn()
const dialogs = vi.hoisted(() => ({ warm: vi.fn() }))
vi.mock("@/components/docFiles/useNodeDialogs", async (real) => ({ ...(await real<object>()), warmNodeDialogs: dialogs.warm }))
vi.mock("@/hooks/use-toast", () => ({ toast: (t: unknown) => (toasts(t), { id: "t", dismiss: vi.fn(), update: vi.fn() }) }))

import { DocRowMenu } from "./DocRowMenu"
import { watchInputModality } from "@/lib/ui/inputModality"

const file = { name: "brief.pdf", size_bytes: 2048, mime: "application/pdf", versions: 3, attachment_id: "att-3" }
const acts = {
  preview: vi.fn(),
  versions: vi.fn(),
  replace: vi.fn(),
  move: vi.fn(),
  colourSheet: vi.fn(),
  upload: vi.fn(),
  addLink: vi.fn(),
  select: vi.fn(),
}

function renderWith(node: React.ReactNode) {
  render(
    <Provider store={configureStore({ reducer: { users: userSlice.reducer } })}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SWRMutateBridge />
        {node}
      </SWRConfig>
    </Provider>,
  )
}
function renderMenu(props: Partial<React.ComponentProps<typeof DocRowMenu>>) {
  renderWith(<DocRowMenu doc={{ id: "n-1", title: "Item" }} canEdit open onOpenChange={() => {}} act={acts} {...props} />)
}
const labels = () => screen.getAllByRole("menuitem").map((m) => m.textContent?.trim())

beforeEach(() => {
  sheet.on = false
  post.mockClear()
  get.mockClear()
  downloads.mockClear()
  toasts.mockClear()
  for (const f of Object.values(acts)) f.mockClear()
  window.open = vi.fn() as unknown as typeof window.open
})
afterEach(cleanup)

describe("the dialogs a row's menu opens", () => {
  it("are asked for as the menu opens, not before", async () => {
    renderMenu({ open: undefined, onOpenChange: undefined, node: { kind: "file", file } })
    expect(dialogs.warm).not.toHaveBeenCalled()
    const more = screen.getByRole("button", { name: "More for Item" })
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false, pointerType: "mouse" })
    fireEvent.keyDown(more, { key: "Enter" })
    await screen.findAllByRole("menuitem")
    expect(dialogs.warm).toHaveBeenCalled()
  })
})

describe("a row's menu, by kind", () => {
  it("offers a file's preview, download, new version and versions, and no page inside it", async () => {
    renderMenu({ node: { kind: "file", file }, onAddInside: vi.fn() })
    expect(labels()).toEqual(["Preview", "Download", "Replace with a new version…", "See all versions", "Star", "Rename", "Colour", "Move to…", "Duplicate", "Copy link", "Move to trash"])
    fireEvent.click(screen.getByRole("menuitem", { name: "Download" }))
    await waitFor(() => expect(downloads).toHaveBeenCalledWith("https://files.example/att-3", "brief.pdf"))
    expect(get).toHaveBeenCalledWith("/doc/getFile/n-1/att-3")
  })

  it("offers a folder's uploads and links, and a page inside it", () => {
    renderMenu({ node: { kind: "folder", color: "moss" }, onAddInside: vi.fn() })
    expect(labels()).toEqual(["Add a page inside", "Upload files here", "Add a link here", "Star", "Rename", "Colour", "Move to…", "Duplicate", "Copy link", "Move to trash"])
    fireEvent.click(screen.getByRole("menuitem", { name: "Upload files here" }))
    expect(acts.upload).toHaveBeenCalled()
  })

  it("opens a link in a new tab, never the editor, and copies its address", () => {
    renderMenu({ node: { kind: "link", linkUrl: "https://figma.com/file/abc" } })
    expect(labels()).toEqual(["Open link", "Star", "Rename", "Colour", "Move to…", "Copy address", "Move to trash"])
    fireEvent.click(screen.getByRole("menuitem", { name: "Open link" }))
    expect(window.open).toHaveBeenCalledWith("https://figma.com/file/abc", "_blank", "noopener,noreferrer")
  })

  it("offers only what a reader may do", () => {
    renderMenu({ node: { kind: "file", file }, canEdit: false })
    expect(labels()).toEqual(["Preview", "Download", "See all versions", "Star", "Duplicate", "Copy link"])
  })
})

describe("a colour from the menu", () => {
  it("is a submenu of named colours on a computer, the current one checked, and a pick colours the row", async () => {
    renderMenu({ node: { kind: "folder", color: "moss" } })
    const colour = screen.getByRole("menuitem", { name: "Colour" })
    await act(async () => {
      fireEvent.pointerMove(colour)
      fireEvent.keyDown(colour, { key: "ArrowRight" })
    })
    const choices = await screen.findAllByRole("menuitemradio")
    expect(choices.map((c) => c.textContent?.trim())).toEqual(["No colour", "Moss", "Sun", "Lake", "Sky", "Dusk", "Berry"])
    expect(choices[1]).toHaveAttribute("aria-checked", "true")
    fireEvent.click(choices[6])
    await waitFor(() => expect(post).toHaveBeenCalledWith("/doc/color", { doc_uuids: ["n-1"], color: "berry" }, { suppressErrorToast: true }))
  })

  it("is the colour sheet on a phone, where the menu is a sheet with Select", () => {
    sheet.on = true
    renderMenu({ node: { kind: "file", file } })
    const menu = screen.getByRole("dialog")
    expect(within(menu).getAllByRole("button").map((b) => b.textContent?.trim())).toContain("Select")
    fireEvent.click(within(menu).getByRole("button", { name: "Colour…" }))
    expect(acts.colourSheet).toHaveBeenCalled()
    fireEvent.click(within(menu).getByRole("button", { name: "Select" }))
    expect(acts.select).toHaveBeenCalled()
  })
})

// Design review, 21 Oct (shot 11): the phone's sheet hid its row and named
// nothing, its actions ran on in one list, and Colour's empty square read
// as a box to tick under Select.
describe("the menu's shape", () => {
  it("names the item at the top of the phone's sheet, with its mark", () => {
    sheet.on = true
    renderMenu({ doc: { id: "n-1", title: "Launch brief.pdf" }, node: { kind: "file", file } })
    const menu = screen.getByRole("dialog", { name: "Launch brief.pdf" })
    const head = menu.querySelector<HTMLElement>("[data-sheet-header] [data-row-sheet-name]")!
    expect(head.textContent).toBe("Launch brief.pdf")
    expect(head.querySelector("[data-node-mark]")?.getAttribute("data-node-mark")).toBe("file")
  })

  it("groups the phone's actions: open, select, versions, organise, the trash", () => {
    sheet.on = true
    renderMenu({ node: { kind: "file", file } })
    const menu = screen.getByRole("dialog")
    const groups = [...menu.querySelectorAll<HTMLElement>("[data-sheet-group]")]
    expect(groups.map((g) => g.dataset.sheetGroup)).toEqual(["open", "select", "holds", "organise", "danger"])
    expect(groups.map((g) => within(g).getAllByRole("button").map((b) => b.textContent?.trim()))).toEqual([
      ["Preview", "Download"],
      ["Select"],
      ["Replace with a new version…", "See all versions"],
      ["Star", "Rename", "Colour…", "Move to…", "Duplicate", "Copy link"],
      ["Move to trash"],
    ])
    // A rule before each group but the first.
    expect(groups.map((g) => g.firstElementChild?.getAttribute("aria-hidden"))).toEqual([null, "true", "true", "true", "true"])
  })

  it("rules off the same groups in a computer's menu", () => {
    renderMenu({ node: { kind: "file", file }, onAddInside: vi.fn() })
    expect(screen.getAllByRole("separator")).toHaveLength(3)
  })

  it("shows the item's own colour on Colour, round, and a line across when it has none", () => {
    sheet.on = true
    renderMenu({ node: { kind: "folder", color: "moss" } })
    const glyph = (name: string) => within(screen.getByRole("dialog")).getByRole("button", { name }).querySelector<HTMLElement>("[data-colour-glyph]")!
    expect(glyph("Colour…").dataset.colourGlyph).toBe("moss")
    expect((glyph("Colour…").firstElementChild as HTMLElement).className).toMatch(/rounded-full/)
    cleanup()
    renderMenu({ node: { kind: "file", file } })
    expect(glyph("Colour…").dataset.colourGlyph).toBe("none")
    expect(glyph("Colour…").querySelector(".-rotate-45")).not.toBeNull()
  })
})

describe("a tree row's menu closed from the keys", () => {
  // In the tree the row's "⋯" is out of the tab order, and hidden again once
  // the menu lets the row go, so it can't take the focus back: after ⇧F10 and
  // Escape the focus was on <body>, and the arrows did nothing (F8,
  // REGRESSION-HUNT 26 Oct 2026). The keys go back to the row.
  function TreeRow({ onAddInside }: { onAddInside?: () => void }) {
    const [open, setOpen] = React.useState(true)
    return (
      <div role="treeitem" tabIndex={-1} aria-label="Item">
        <DocRowMenu doc={{ id: "n-1", title: "Item" }} canEdit open={open} onOpenChange={setOpen} act={acts} onAddInside={onAddInside} />
      </div>
    )
  }
  const row = () => screen.getByRole("treeitem", { name: "Item" })
  // Radix gives the focus back a task after the menu goes (FocusScope's
  // unmount), so a check that nothing moved it waits for that task.
  const closeFocusRan = () => act(() => new Promise<void>((done) => setTimeout(done, 0)))

  it("gives the focus back to the row", async () => {
    watchInputModality()
    renderWith(<TreeRow />)
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
    await waitFor(() => expect(document.activeElement).toBe(row()))
  })

  it("gives it back to the row from the phone's sheet too", async () => {
    // The sheet's dialog has no trigger of its own to give it to.
    sheet.on = true
    watchInputModality()
    renderWith(<TreeRow />)
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    await waitFor(() => expect(document.activeElement).toBe(row()))
  })

  it("leaves the focus where the item chosen put it", async () => {
    watchInputModality()
    renderWith(
      <>
        <TreeRow onAddInside={() => screen.getByRole("textbox", { name: "New page" }).focus()} />
        <input aria-label="New page" />
      </>,
    )
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Add a page inside" }), { key: "Enter" })
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    await closeFocusRan()
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "New page" }))
  })

  it("leaves the focus alone when a pointer chose", async () => {
    watchInputModality()
    renderWith(<TreeRow />)
    const item = screen.getByRole("menuitem", { name: "Move to…" })
    fireEvent.pointerDown(item)
    fireEvent.click(item)
    expect(acts.move).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    await closeFocusRan()
    expect(document.activeElement).toBe(document.body)
  })
})

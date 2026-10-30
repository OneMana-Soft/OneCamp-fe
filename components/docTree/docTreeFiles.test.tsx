import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { SWRConfig, useSWRConfig } from "swr"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import { TooltipProvider } from "@/components/ui/tooltip"
import userSlice from "@/store/slice/userSlice"
import type { TreeNodeJSON } from "@/types/docGraph"

// The doc tree with Docs & Files in it (docs F1b): each kind's mark and line
// of detail, "+" only where things go inside, each kind opening its own way
// (a page and a folder at their address, a folder known as one before its
// page asks; a file's preview; a link in a new tab), rows chosen together and
// coloured or moved at once, and files dropped on a folder, or on the tree,
// uploaded there. Served from memory through the real SWR cache.

const sheet = vi.hoisted(() => ({ on: false }))
vi.mock("@/components/ui/overlayMode", () => ({ useSheetMode: () => sheet.on, SHEET_QUERY: "" }))
const levels: Record<string, TreeNodeJSON[]> = {}
const post = vi.fn(async (url: string, body: unknown, config?: unknown): Promise<{ data: { data: unknown } }> => {
  void body
  void config
  if (url === "/doc/files") return { data: { data: { kind: "doc", uuid: "up-1", title: "x", has_children: false, node_kind: "file" } } }
  return { data: { data: { count: 2 } } }
})
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: {
    get: async (url: string) => ({ data: { data: { parent: "", nodes: levels[url] ?? [], hidden: 0, count: (levels[url] ?? []).length } } }),
    post: (url: string, body: unknown, config?: unknown) => post(url, body, config),
    delete: vi.fn(),
  },
}))
const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch: vi.fn() }), usePathname: () => "/app/project/p-1" }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: sheet.on, isDesktop: !sheet.on }) }))
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(() => ({ id: "t", dismiss: vi.fn(), update: vi.fn() })) }))
vi.mock("@/components/docFiles/FilePreview", () => ({ default: ({ file }: { file: { id: string } }) => <div role="dialog" data-file-preview={file.id} /> }))
const intent = vi.hoisted(() => vi.fn())
vi.mock("@/components/navigationBar/desktop/IntentLink", async (original) => ({ ...(await original<object>()), prefetchDocOnIntent: intent }))

import { DocTree } from "./DocTree"
import { toast } from "@/hooks/use-toast"
import { DOC_INTENT_MS } from "@/components/navigationBar/desktop/IntentLink"

// A page of 50 reads 100 (fluid-06, Fix 2).
const TOP = "/doc/children?space=project%3Ap-1&limit=100"
const file = (name: string, mime: string, size = 2048) => ({ name, size_bytes: size, mime, versions: 2, attachment_id: `att-${name}` })
const rows: TreeNodeJSON[] = [
  { kind: "doc", uuid: "folder-1", title: "Contracts", has_children: true, can_edit: true, node_kind: "folder", color: "moss", private: true },
  { kind: "doc", uuid: "page-1", title: "Launch plan", has_children: false, can_edit: true, color: "berry" },
  { kind: "doc", uuid: "pdf-1", title: "brief.pdf", has_children: false, can_edit: true, node_kind: "file", file: file("brief.pdf", "application/pdf", 1048576) },
  { kind: "doc", uuid: "link-1", title: "Launch designs", has_children: false, can_edit: true, node_kind: "link", link_url: "https://www.figma.com/file/abc" },
]

let cache: Map<string, unknown>
function CacheProbe() {
  cache = useSWRConfig().cache as unknown as Map<string, unknown>
  return null
}
function renderTree(props: Partial<React.ComponentProps<typeof DocTree>> = {}) {
  render(
    <Provider store={configureStore({ reducer: { users: userSlice.reducer } })}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SWRMutateBridge />
        <CacheProbe />
        <TooltipProvider>
          <DocTree space="project:p-1" label="Website relaunch's docs" dense={false} cap={50} selectable dropRoot={{ place: { space: "project:p-1" }, label: "Website relaunch" }} {...props} />
        </TooltipProvider>
      </SWRConfig>
    </Provider>,
  )
}
const row = (name: string) => screen.getByRole("treeitem", { name })

beforeEach(() => {
  sheet.on = false
  // A tree remembers which rows were left open (useTree's storageKey): each test starts shut.
  localStorage.clear()
  for (const k of Object.keys(levels)) delete levels[k]
  levels[TOP] = rows
  levels["/doc/children?parent=folder-1&limit=100"] = []
  post.mockClear()
  push.mockClear()
  window.open = vi.fn() as unknown as typeof window.open
})
afterEach(cleanup)

describe("rows by kind", () => {
  it("marks each kind, with a link's site and a file's size after the title, and a colour as a dot", async () => {
    renderTree()
    await screen.findByRole("treeitem", { name: "Contracts" })
    const mark = (name: string) => row(name).querySelector<HTMLElement>("[data-node-mark]")!
    expect(mark("Contracts").dataset.nodeMark).toBe("folder")
    expect(mark("Contracts").className).toMatch(/hue-moss/)
    // A page draws its own icon (fluid-06: one component fewer a row).
    expect(row("Launch plan").querySelector("[data-doc-icon]")).not.toBeNull()
    expect(mark("brief.pdf").dataset.nodeMark).toBe("file")
    expect(mark("Launch designs").dataset.provider).toBe("figma")
    expect(row("Launch designs").querySelector("[data-tree-meta]")?.textContent).toBe("figma.com")
    expect(row("brief.pdf").querySelector("[data-tree-meta]")?.textContent).toContain("1 MB")
    expect(row("Launch plan").querySelector("[data-colour-dot]")?.getAttribute("data-colour-dot")).toBe("berry")
    // A folder's colour is its tile, not a dot too.
    expect(row("Contracts").querySelector("[data-colour-dot]")).toBeNull()
    // Rows that can be chosen are neutral, chosen or not: the colour stays on
    // the mark, never on the row (design review, 21 Oct).
    for (const name of ["Contracts", "Launch plan", "brief.pdf"]) {
      expect(row(name).getAttribute("data-tone")).toBe("neutral")
      expect(row(name).hasAttribute("data-hue")).toBe(false)
    }
  })

  it("keeps a row's colour as its hover where rows aren't chosen (the sidebar)", async () => {
    renderTree({ selectable: false, dense: true })
    await screen.findByRole("treeitem", { name: "Contracts" })
    expect(row("Contracts").getAttribute("data-hue")).toBe("moss")
    expect(row("Contracts").hasAttribute("data-tone")).toBe(false)
  })

  // Design review, 21 Oct (shot 01): a page's wide list was a column of names.
  it("ends a page's row with who made its last change and when, the time alone when no one is named", async () => {
    const ago = new Date(Date.now() - 3 * 3_600_000).toISOString()
    const maya = { user_uuid: "u-2", user_name: "Maya Chen" }
    levels[TOP] = [
      { ...rows[0] },
      { ...rows[1], updated_at: ago, updated_by: maya },
      { ...rows[2], updated_at: ago },
      rows[3],
    ]
    renderTree()
    await screen.findByRole("treeitem", { name: "Launch plan" })
    const aside = (name: string) => row(name).querySelector<HTMLElement>("[data-tree-aside]")
    expect(aside("Launch plan")?.textContent).toBe("Maya · 3h ago")
    expect(aside("Launch plan")?.querySelector("[data-edited]")?.getAttribute("title")).toMatch(/^Maya Chen · /)
    expect(aside("Launch plan")?.className).toMatch(/tabular-nums/)
    // A server that doesn't say who: the time alone, never the owner.
    expect(aside("brief.pdf")?.textContent).toBe("3h ago")
    // Nothing to say, no line at all.
    expect(aside("Contracts")).toBeNull()
  })

  it("says no who or when in the sidebar's tree", async () => {
    const ago = new Date(Date.now() - 3 * 3_600_000).toISOString()
    levels[TOP] = [{ ...rows[1], updated_at: ago, updated_by: { user_uuid: "u-2", user_name: "Maya" } }]
    renderTree({ selectable: false, dense: true })
    await screen.findByRole("treeitem", { name: "Launch plan" })
    expect(row("Launch plan").querySelector("[data-tree-aside]")).toBeNull()
  })

  it("puts + only on a page and a folder", async () => {
    renderTree()
    await screen.findByRole("treeitem", { name: "Contracts" })
    expect(row("Contracts").querySelector("[data-tree-add]")).not.toBeNull()
    expect(row("Launch plan").querySelector("[data-tree-add]")).not.toBeNull()
    expect(row("brief.pdf").querySelector("[data-tree-add]")).toBeNull()
    expect(row("Launch designs").querySelector("[data-tree-add]")).toBeNull()
  })
})

describe("opening by kind", () => {
  it("opens a page and a folder at their address, the folder known as one before its page asks", async () => {
    renderTree()
    fireEvent.click(await screen.findByRole("treeitem", { name: "Launch plan" }))
    expect(push).toHaveBeenLastCalledWith("/app/doc/page-1")
    fireEvent.click(row("Contracts"))
    expect(push).toHaveBeenLastCalledWith("/app/doc/folder-1")
    expect((cache.get("/doc/getDocInfo/folder-1") as { data?: { data?: { doc_node_kind?: string } } })?.data?.data?.doc_node_kind).toBe("folder")
  })

  it("opens a file's preview and a link in a new tab, never the editor", async () => {
    renderTree()
    fireEvent.click(await screen.findByRole("treeitem", { name: "brief.pdf" }))
    // The preview is a chunk of its own, loaded as it first opens.
    expect(await screen.findByRole("dialog", {}, { timeout: 5000 })).toHaveAttribute("data-file-preview", "pdf-1")
    fireEvent.click(row("Launch designs"))
    expect(window.open).toHaveBeenCalledWith("https://www.figma.com/file/abc", "_blank", "noopener,noreferrer")
    expect(push).not.toHaveBeenCalled()
  })

  it("fetches a page ahead when a pointer rests on its row, and nothing for a folder, a file or a link", async () => {
    renderTree()
    await screen.findByRole("treeitem", { name: "Launch plan" })
    intent.mockClear()
    // Each pointer rests for the intent's wait, on the test's clock.
    vi.useFakeTimers()
    try {
      for (const name of ["Contracts", "brief.pdf", "Launch designs"]) {
        fireEvent.pointerOver(row(name))
        act(() => vi.advanceTimersByTime(DOC_INTENT_MS))
      }
      expect(intent).not.toHaveBeenCalled()
      // A page's row draws its own icon (fluid-06): it is still a page.
      fireEvent.pointerOver(row("Launch plan"))
      act(() => vi.advanceTimersByTime(DOC_INTENT_MS))
      expect(intent).toHaveBeenCalledWith("page-1")
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("on a touch screen", () => {
  // jsdom matches no hover media, so what a touch screen draws
  // ([@media(hover:none)]) is read from the classes; the e2e sees it at 390.
  it("shows a row's chevron beside its mark, a folder's as a page's, shut or open, and keeps every title in line", async () => {
    levels[TOP] = [...rows, { kind: "doc", uuid: "page-2", title: "Handbook", has_children: true, can_edit: true }]
    renderTree()
    await screen.findByRole("treeitem", { name: "Handbook" })
    const classes = (el: Element | null | undefined) => (el ? el.className.split(/\s+/) : null)
    const touch = (name: string) => {
      const toggle = row(name).querySelector("[data-tree-toggle]")
      return { slot: classes(row(name).querySelector("[data-tree-slot]")), toggle: classes(toggle), mark: classes(toggle?.previousElementSibling) }
    }
    for (const name of ["Contracts", "Handbook"]) {
      expect(touch(name).toggle).toContain("[@media(hover:none)]:flex")
      expect(touch(name).mark).not.toContain("hidden")
      expect(touch(name).mark).not.toContain("[@media(hover:none)]:hidden")
    }
    // A row with nothing inside has the same expand slot, empty, so its title starts where its neighbours' do.
    expect(touch("Launch plan").toggle).toBeNull()
    expect(touch("Launch plan").slot).toEqual(touch("Contracts").slot)
    expect(touch("Contracts").slot).toContain("[@media(hover:none)]:w-9")
    // Open, the folder keeps its tile beside the turned chevron.
    fireEvent.click(row("Contracts").querySelector("[data-tree-toggle]")!)
    await waitFor(() => expect(row("Contracts")).toHaveAttribute("aria-expanded", "true"))
    expect(touch("Contracts").mark).toContain("[@media(hover:none)]:flex")
    expect(touch("Contracts").toggle).toContain("flex")
  })
})

describe("a selection", () => {
  it("is coloured at once from the bulk bar", async () => {
    renderTree()
    fireEvent.click(await screen.findByRole("treeitem", { name: "brief.pdf" }), { metaKey: true })
    fireEvent.click(row("Launch designs"), { metaKey: true })
    const bar = await screen.findByRole("toolbar", { name: "Selected items" })
    expect(bar.textContent).toContain("2 selected")
    // Colour shows the hues to pick from, round: never an empty box beside the checks.
    const glyph = within(bar).getByRole("button", { name: "Colour" }).querySelector<HTMLElement>("[data-colour-glyph]")!
    expect(glyph.dataset.colourGlyph).toBe("pick")
    expect(glyph.className).toMatch(/rounded-full/)
    await act(async () => fireEvent.keyDown(within(bar).getByRole("button", { name: "Colour" }), { key: "Enter" }))
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Sky" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/doc/color", { doc_uuids: ["pdf-1", "link-1"], color: "sky" }, { suppressErrorToast: true }))
  })

  // What's chosen is only ever what's in sight: a row its folder hides when
  // shut leaves the selection, so the bar's Colour and Move never act on rows
  // the person can't see (code review of F1b).
  it("lets go of a chosen row its folder hides when shut", async () => {
    levels["/doc/children?parent=folder-1&limit=100"] = [{ kind: "doc", uuid: "nda-1", title: "NDA.pdf", has_children: false, can_edit: true, node_kind: "file", file: file("NDA.pdf", "application/pdf") }]
    renderTree()
    await screen.findByRole("treeitem", { name: "Contracts" })
    fireEvent.click(row("Contracts").querySelector("[data-tree-toggle]")!)
    await waitFor(() => expect(row("Contracts")).toHaveAttribute("aria-expanded", "true"))
    fireEvent.click(await screen.findByRole("treeitem", { name: "NDA.pdf" }, { timeout: 5000 }), { metaKey: true })
    fireEvent.click(row("Launch designs"), { metaKey: true })
    const bar = await screen.findByRole("toolbar", { name: "Selected items" })
    expect(bar.textContent).toContain("2 selected")
    fireEvent.click(row("Contracts").querySelector("[data-tree-toggle]")!)
    await waitFor(() => expect(screen.queryByRole("treeitem", { name: "NDA.pdf" })).toBeNull())
    expect(bar.textContent).toContain("1 selected")
  })

  it("is moved with Move to…, from the bar, and Undo puts the run back where it was", async () => {
    renderTree()
    fireEvent.click(await screen.findByRole("treeitem", { name: "Launch plan" }), { metaKey: true })
    fireEvent.click(row("brief.pdf"), { metaKey: true })
    fireEvent.click(within(await screen.findByRole("toolbar", { name: "Selected items" })).getByRole("button", { name: "Move to…" }))
    expect(await screen.findByText("Move 2 items to…", {}, { timeout: 5000 })).toBeTruthy()
    fireEvent.click(within(await screen.findByRole("list", { name: "Places to move to" })).getByRole("button", { name: "Contracts" }))
    fireEvent.click(await screen.findByRole("button", { name: "Move here" }))
    const moved = await waitFor(() => {
      const said = vi.mocked(toast).mock.calls.map(([t]) => t).find((t) => t.title === "Moved 2 items to “Contracts”")
      expect(said).toBeTruthy()
      return said!
    })
    post.mockClear()
    const undo = render(<>{moved.action}</>)
    await act(async () => fireEvent.click(within(undo.container).getByRole("button", { name: "Undo" })))
    // The last first, each right after the row it followed that stayed.
    await waitFor(() =>
      expect(post.mock.calls.filter(([url]) => url === "/doc/move").map(([, body]) => body)).toEqual([
        { doc_uuid: "pdf-1", space: "project:p-1", after_uuid: "folder-1", access: "keep" },
        { doc_uuid: "page-1", space: "project:p-1", after_uuid: "folder-1", access: "keep" },
      ]),
    )
  })

  it("starts on a phone from Select in a row's sheet, and a tap then chooses", async () => {
    sheet.on = true
    renderTree()
    fireEvent.contextMenu(await screen.findByRole("treeitem", { name: "brief.pdf" }))
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Select" }))
    const bar = await screen.findByRole("toolbar", { name: "Selected items" })
    expect(bar.textContent).toContain("1 selected")
    // Choosing Select opened nothing: the sheet's tap stays the sheet's.
    expect(document.querySelector("[data-file-preview]")).toBeNull()
    // jsdom never ends the sheet's closing animation, so the page stays
    // hidden from the accessibility tree behind it here.
    fireEvent.click(screen.getByRole("treeitem", { name: "Launch designs", hidden: true }))
    expect(bar.textContent).toContain("2 selected")
    expect(window.open).not.toHaveBeenCalled()
  })
})

describe("files dropped from outside", () => {
  const dropFiles = (el: HTMLElement, files: File[]) => {
    const dataTransfer = { types: ["Files"], files, dropEffect: "" }
    fireEvent(el, Object.assign(createEvent.dragOver(el, { dataTransfer }), {}))
    fireEvent(el, createEvent.drop(el, { dataTransfer }))
  }
  const sent = () => post.mock.calls.filter(([url]) => url === "/doc/files").map(([, body]) => Object.fromEntries([...(body as FormData).entries()].map(([k, v]) => [k, typeof v === "string" ? v : (v as File).name])))

  it("upload into the folder they're dropped on", async () => {
    renderTree()
    dropFiles(await screen.findByRole("treeitem", { name: "Contracts" }), [new File(["x"], "nda.pdf")])
    await waitFor(() => expect(sent()).toEqual([{ file: "nda.pdf", parent_uuid: "folder-1" }]))
  })

  it("upload to the tree's own place when dropped on anything else", async () => {
    renderTree()
    dropFiles(await screen.findByRole("treeitem", { name: "Launch plan" }), [new File(["x"], "mock.png")])
    await waitFor(() => expect(sent()).toEqual([{ file: "mock.png", space: "project:p-1" }]))
  })
})

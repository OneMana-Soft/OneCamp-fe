import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { SWRConfig, useSWRConfig } from "swr"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import userSlice from "@/store/slice/userSlice"
import type { DocListItem } from "@/types/docGraph"

// The docs home's lists with Docs & Files in them (docs F1b): each kind's
// mark and detail, and each opening its own way: a folder at its address,
// known as one before its page asks (and never prefetching a live copy it
// hasn't got); a file in its preview, in place; a link in a new tab, as a
// real link to its document.

vi.mock("@/components/ui/overlayMode", () => ({ useSheetMode: () => false, SHEET_QUERY: "" }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: vi.fn(async () => ({ data: {} })), post: vi.fn(async () => ({ data: { data: {} } })) } }))
const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch: vi.fn() }), usePathname: () => "/app/doc" }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/components/doc/docPreview", () => ({ DocPreview: () => <div data-doc-preview="" /> }))
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(() => ({ id: "t", dismiss: vi.fn(), update: vi.fn() })) }))
const preview = vi.hoisted(() => ({ warm: vi.fn() }))
vi.mock("@/components/docFiles/useNodeDialogs", async (real) => ({ ...(await real<object>()), warmFilePreview: preview.warm }))
vi.mock("@/components/docFiles/FilePreview", () => ({ default: ({ file }: { file: { id: string } }) => <div role="dialog" data-file-preview={file.id} /> }))

import { DocRow } from "./docRows"
import { DocCard } from "./docCard"

const folder: DocListItem = { doc_uuid: "folder-1", doc_title: "Contracts", path: [], doc_node_kind: "folder", doc_color: "moss", doc_private: true }
const file: DocListItem = {
  doc_uuid: "file-1",
  doc_title: "brief.pdf",
  path: [{ doc_uuid: "folder-1", doc_title: "Contracts" }],
  doc_node_kind: "file",
  doc_color: "berry",
  doc_file: { name: "brief.pdf", size_bytes: 1048576, mime: "application/pdf", versions: 3, attachment_id: "att-3" },
}
const page: DocListItem = { doc_uuid: "page-1", doc_title: "Launch plan", path: [] }
const link: DocListItem = { doc_uuid: "link-1", doc_title: "Launch designs", path: [], doc_node_kind: "link", doc_link_url: "https://www.figma.com/file/abc" }

let cache: Map<string, unknown>
function Probe() {
  cache = useSWRConfig().cache as unknown as Map<string, unknown>
  return null
}
function show(ui: React.ReactNode) {
  render(
    <Provider store={configureStore({ reducer: { users: userSlice.reducer } })}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SWRMutateBridge />
        <Probe />
        {ui}
      </SWRConfig>
    </Provider>,
  )
}

beforeEach(() => push.mockClear())
afterEach(cleanup)

describe("a list row, by kind", () => {
  it("opens a folder at its address, known as one, with no live copy fetched ahead", () => {
    show(<DocRow doc={folder} />)
    const row = screen.getByRole("link", { name: /^Contracts, folder/ })
    expect(row.getAttribute("href")).toBe("/app/doc/folder-1")
    // Its route is fetched on intent, never on sight (NodeLink), and no live copy.
    expect(row.getAttribute("data-prefetch")).toBe("off")
    fireEvent.touchStart(row)
    expect(row.getAttribute("data-prefetch")).toBe("intent")
    expect(row.querySelector('[data-node-mark="folder"]')?.className).toMatch(/hue-moss/)
    fireEvent.click(row)
    expect((cache.get("/doc/getDocInfo/folder-1") as { data?: { data?: { doc_node_kind?: string } } })?.data?.data?.doc_node_kind).toBe("folder")
  })

  it("opens a file's preview in place, its size and colour after its title", async () => {
    show(<DocRow doc={file} />)
    const row = screen.getByRole("link", { name: /^brief\.pdf, file, in Contracts/ })
    expect(row.querySelector('[data-node-mark="file"]')).not.toBeNull()
    expect(row.querySelector("[data-colour-dot]")?.getAttribute("data-colour-dot")).toBe("berry")
    expect(row.textContent).toContain("1 MB")
    fireEvent.click(row)
    expect(await screen.findByRole("dialog", {}, { timeout: 5000 })).toHaveAttribute("data-file-preview", "file-1")
  })

  it("is a real link to a link's document, in a new tab, with its site", () => {
    show(<DocRow doc={link} />)
    const row = screen.getByRole("link", { name: /^Launch designs, link/ })
    expect(row.getAttribute("href")).toBe("https://www.figma.com/file/abc")
    expect(row.getAttribute("target")).toBe("_blank")
    expect(row.getAttribute("rel")).toBe("noopener noreferrer")
    expect(row.textContent).toContain("figma.com")
  })

  it("offers each kind's own menu", async () => {
    show(<DocRow doc={file} canEdit />)
    fireEvent.pointerDown(screen.getByRole("button", { name: "More for brief.pdf" }), { button: 0, pointerType: "mouse" })
    fireEvent.keyDown(screen.getByRole("button", { name: "More for brief.pdf" }), { key: "Enter" })
    const menu = await screen.findByRole("menu")
    expect(within(menu).getByRole("menuitem", { name: "Replace with a new version…" })).toBeTruthy()
    expect(within(menu).getByRole("menuitem", { name: "See all versions" })).toBeTruthy()
  })
})

describe("a file's preview, fetched as it's about to be opened", () => {
  it("is asked for as a pointer comes over a file's row or card, or it's focused or touched; never for a page's", () => {
    show(
      <>
        <DocRow doc={page} canEdit />
        <DocRow doc={file} canEdit />
        <DocCard doc={file} href="/app/doc/file-1" />
      </>,
    )
    const intents = (el: Element) => {
      fireEvent.pointerEnter(el)
      fireEvent.focus(el)
      fireEvent.touchStart(el)
      fireEvent.touchEnd(el)
    }
    intents(document.querySelector('[data-doc-row="page-1"] a')!)
    expect(preview.warm).not.toHaveBeenCalled()
    intents(document.querySelector('[data-doc-row="file-1"] a')!)
    expect(preview.warm).toHaveBeenCalledTimes(3)
    intents(document.querySelector("[data-doc-card]")!)
    expect(preview.warm).toHaveBeenCalledTimes(6)
  })
})

describe("a card, by kind", () => {
  it("shows a file's glyph and a folder's tile where a page shows its first lines", () => {
    show(<DocCard doc={file} href="/app/doc/file-1" />)
    expect(document.querySelector("[data-doc-preview]")).toBeNull()
    expect(document.querySelector('[data-doc-card] [data-node-mark="file"]')).not.toBeNull()
    cleanup()
    show(<DocCard doc={folder} href="/app/doc/folder-1" />)
    expect(document.querySelector('[data-doc-card] [data-node-mark="folder"]')?.className).toMatch(/hue-moss/)
  })

  it("opens a link's document in a new tab", async () => {
    show(<DocCard doc={link} href="/app/doc/link-1" />)
    const card = document.querySelector<HTMLAnchorElement>("[data-doc-card]")!
    await waitFor(() => expect(card.getAttribute("href")).toBe("https://www.figma.com/file/abc"))
    expect(card.getAttribute("target")).toBe("_blank")
  })
})

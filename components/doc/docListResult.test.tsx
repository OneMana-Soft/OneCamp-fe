import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { DocInfoInterface } from "@/types/doc"

// What the docs list was handed on each render, to catch a frame where it is
// told "nothing, and done loading" before the docs it has are copied in.
const handed: { docList: DocInfoInterface[]; isLoading?: boolean }[] = []
let fetched: { data?: { data?: { docs: DocInfoInterface[] } }; isLoading: boolean } = { isLoading: false }
const makeRequest = vi.fn()
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => fetched }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { DocListResult, NewDocCard } from "./docListResult"
import { DocListTabPrivate } from "./docListTabPrivate"
import { DocListTabPublic } from "./docListTabPublic"

afterEach(() => {
  cleanup()
  handed.length = 0
  fetched = { isLoading: false }
  makeRequest.mockReset()
})

/** The drawing above an empty state, and the hue it is drawn in. */
function spotHue() {
  const svg = document.querySelector("[data-empty-illustration] svg")
  return svg ? /hue-(\w+)/.exec(svg.getAttribute("class") || "")?.[1] : undefined
}

const doc = (n: number) => ({ doc_uuid: `d${n}`, doc_title: `Doc ${n}` }) as DocInfoInterface

describe("an empty docs list", () => {
  it("with no docs at all, offers the first doc: the spot, three templates and one primary", () => {
    makeRequest.mockResolvedValue(undefined)
    render(<DocListResult docList={[]} withCreateCard />)
    expect(screen.getByRole("heading", { name: "Write the first doc" })).toBeTruthy()
    expect(screen.getByText("Notes, plans and decisions live here, beside the chat that made them.")).toBeTruthy()
    expect(spotHue()).toBe("sky")
    expect(document.querySelectorAll("[data-template-row]")).toHaveLength(3)
    fireEvent.click(screen.getByRole("button", { name: "New doc" }))
    expect(makeRequest).toHaveBeenCalledOnce()
    expect(makeRequest.mock.calls[0][0].payload).toEqual({ doc_title: "Untitled", doc_private: true })
  })

  it("after a search that found nothing, says what was searched, with a way to clear it", () => {
    const clear = vi.fn()
    render(<DocListResult docList={[]} searchQuery="roadmap" onClearSearch={clear} />)
    expect(screen.getByRole("heading", { name: "No docs match “roadmap”" })).toBeTruthy()
    expect(screen.queryByText("Write the first doc")).toBeNull()
    expect(spotHue()).toBe("lake")
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }))
    expect(clear).toHaveBeenCalledOnce()
  })

  it("while loading shows the skeleton, not an empty state", () => {
    render(<DocListResult docList={[]} isLoading withCreateCard />)
    expect(screen.queryByRole("heading")).toBeNull()
  })
})

describe("the new-doc card", () => {
  it("is no dashed wireframe: a sunken card with a blank doc and three template rows", () => {
    render(<NewDocCard />)
    const card = document.querySelector("[data-new-doc-card]")!
    expect(card.className).not.toMatch(/border-dashed/)
    expect(card.className).toMatch(/bg-sunken/)
    expect(screen.getByRole("button", { name: /Blank doc/ })).toBeTruthy()
    expect(card.querySelectorAll("[data-template-row]")).toHaveLength(3)
    expect(screen.getByRole("link", { name: /All templates/ })).toBeTruthy()
  })
})

describe("the docs tabs", () => {
  vi.mock("./docListResult", async (importOriginal) => {
    const real = await importOriginal<typeof import("./docListResult")>()
    return {
      ...real,
      DocListResult: (props: Parameters<typeof real.DocListResult>[0]) => {
        handed.push({ docList: props.docList, isLoading: props.isLoading })
        return real.DocListResult(props)
      },
    }
  })

  for (const [name, Tab] of [["private", DocListTabPrivate], ["public", DocListTabPublic]] as const) {
    it(`(${name}) never tell the list it is empty while the first page is on its way in`, () => {
      fetched = { data: { data: { docs: [doc(1), doc(2)] } }, isLoading: false }
      render(<Tab searchQuery="" />)
      expect(handed.length).toBeGreaterThan(0)
      expect(handed.filter((h) => h.docList.length === 0 && !h.isLoading)).toEqual([])
      expect(handed.at(-1)?.docList).toHaveLength(2)
    })

    it(`(${name}) show a search as loading until its answer comes`, async () => {
      let answer: (v: unknown) => void = () => {}
      makeRequest.mockReturnValue(new Promise((r) => (answer = r)))
      render(<Tab searchQuery="roadmap" />)
      expect(handed.filter((h) => h.docList.length === 0 && !h.isLoading)).toEqual([])
      await act(async () => answer({ docs: [] }))
      // Now it is known: nothing matched.
      expect(screen.getByRole("heading", { name: "No docs match “roadmap”" })).toBeTruthy()
    })
  }
})

describe("the docs list's frame on either tab", () => {
  it("loads as the card grid it will be, in the 1,040 px column", () => {
    render(<DocListResult docList={[]} isLoading withCreateCard />)
    const skeleton = screen.getByRole("status", { name: "Loading docs" })
    expect(skeleton.querySelector(".max-w-\\[1040px\\]")).toBeTruthy()
    expect(skeleton.querySelectorAll(".sm\\:h-\\[264px\\]").length).toBeGreaterThan(3)
  })

  it("says a failed load failed, with Try again, where it said there were no docs", () => {
    const onRetry = vi.fn()
    render(<DocListResult docList={[]} isError onRetry={onRetry} withCreateCard />)
    expect(screen.getByRole("heading", { name: /Couldn't load these docs/ })).toBeTruthy()
    expect(screen.queryByText("Write the first doc")).toBeNull()
  })
})

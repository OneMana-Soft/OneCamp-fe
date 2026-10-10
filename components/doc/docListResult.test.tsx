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

import { DocListResult } from "./docListResult"
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
  it("with no docs at all, draws a page over its words and its one action", () => {
    const onCreate = vi.fn()
    render(<DocListResult docList={[]} onCreate={onCreate} />)
    expect(screen.getByRole("heading", { name: "No documents yet" })).toBeTruthy()
    expect(screen.getByText("Create your first document to get started.")).toBeTruthy()
    expect(spotHue()).toBe("dusk")
    fireEvent.click(screen.getByRole("button", { name: "New document" }))
    expect(onCreate).toHaveBeenCalledOnce()
  })

  it("after a search that found nothing, says what was searched, not that there are no docs", () => {
    render(<DocListResult docList={[]} searchQuery="roadmap" />)
    expect(screen.getByRole("heading", { name: "No documents match “roadmap”." })).toBeTruthy()
    expect(screen.queryByText("No documents yet")).toBeNull()
    expect(spotHue()).toBe("lake")
  })

  it("while loading shows the skeleton, not an empty state", () => {
    render(<DocListResult docList={[]} isLoading onCreate={() => {}} />)
    expect(screen.queryByRole("heading")).toBeNull()
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
      render(<Tab searchQuery="" onCreate={() => {}} />)
      expect(handed.length).toBeGreaterThan(0)
      expect(handed.filter((h) => h.docList.length === 0 && !h.isLoading)).toEqual([])
      expect(handed.at(-1)?.docList).toHaveLength(2)
    })

    it(`(${name}) show a search as loading until its answer comes`, async () => {
      let answer: (v: unknown) => void = () => {}
      makeRequest.mockReturnValue(new Promise((r) => (answer = r)))
      render(<Tab searchQuery="roadmap" onCreate={() => {}} />)
      expect(handed.filter((h) => h.docList.length === 0 && !h.isLoading)).toEqual([])
      await act(async () => answer({ docs: [] }))
      // Now it is known: nothing matched.
      expect(screen.getByRole("heading", { name: "No documents match “roadmap”." })).toBeTruthy()
    })
  }
})

describe("the docs list's frame on either tab", () => {
  it("loads as the card grid it will be, not as text rows", () => {
    render(<DocListResult docList={[]} isLoading onCreate={vi.fn()} />)
    const skeleton = screen.getByRole("status", { name: "Loading docs" })
    expect(skeleton.querySelector(".max-w-\\[1400px\\]")).toBeTruthy()
    expect(skeleton.querySelectorAll(".h-64").length).toBeGreaterThan(3)
  })

  it("says a failed load failed, with Try again, where it said there were no docs", () => {
    const onRetry = vi.fn()
    render(<DocListResult docList={[]} isError onRetry={onRetry} onCreate={vi.fn()} />)
    expect(screen.getByRole("heading", { name: /Couldn't load these docs/ })).toBeTruthy()
    expect(screen.queryByText("No documents yet")).toBeNull()
  })

  it("puts its empty state near the top, where the cards start, not centred in the page", () => {
    render(<DocListResult docList={[]} onCreate={vi.fn()} />)
    const state = screen.getByRole("heading", { name: "No documents yet" }).closest("[class*='pt-10']")
    expect(state).toBeTruthy()
  })
})

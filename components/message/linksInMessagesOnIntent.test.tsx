import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { readdirSync, readFileSync } from "fs"

// The links drawn inside a message fetched the page they open as soon as they
// were on screen. A plain next/link prefetches on sight, so a phone scrolling a
// channel full of doc links paid for each doc's page and its code before
// anyone tapped one (DOCS-LEAD-2, 21 Oct). The cards go through IntentLink, as
// the sidebar's and the docs' links do: the page is fetched when a pointer
// comes over a card, the keyboard reaches it or a finger lands on it, and a
// doc's card also opens the doc's live copy once the pointer rests. The cards'
// code loads with the first message that has one.

const prefetched: string[] = []
vi.mock("@/lib/docPrefetch", () => ({ prefetchDoc: (id: string) => prefetched.push(id) }))
vi.mock("next/link", () => ({
  default: ({ prefetch, children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) => (
    <a data-next-prefetch={String(prefetch)} {...(rest as object)}>
      {children}
    </a>
  ),
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => ({
    isLoading: false,
    data: url.includes("/task/info/")
      ? { data: { task_name: "Ship the importer", task_status: "inProgress" } }
      : url.includes("/doc/getDocInfo/")
        ? { data: { doc_title: "Q4 launch plan" } }
        : url.includes("/project/info/")
          ? { data: { project_name: "Website" } }
          : undefined,
  }),
}))

const TASK = "3f2a1c9e-1111-4222-8333-944455556666"
const DOC = "7b6c5d4e-aaaa-4bbb-8ccc-ddddeeeeffff"
const PROJECT = "0a1b2c3d-1234-4567-89ab-cdef01234567"
const TEXT = `<p>See /app/task/${TASK}, /app/doc/${DOC} and /app/project/${PROJECT}</p>`

const { WorkLinkCards } = await import("./WorkLinkCards")
const { DOC_INTENT_MS } = await import("@/components/navigationBar/desktop/IntentLink")
// The cards' code is loaded once, before any test: the tests check what the
// cards draw and fetch, not how long the runner takes to load their code. In
// the first test that took ~1.1 s alone and over 5 s on a busy machine
// (V-91). lazyPart still draws its placeholder first, since its code reaches
// it only once the import resolves, so the skeletons are still there to see.
await import("./workLinkCardsBody")

const flush = () =>
  act(async () => {
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
  })

beforeEach(() => {
  prefetched.length = 0
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function cards() {
  const { container } = render(<WorkLinkCards text={TEXT} />)
  const links = () => Array.from(container.querySelectorAll<HTMLAnchorElement>("[data-work-cards] a"))
  await waitFor(() => expect(links()).toHaveLength(3))
  expect(links().map((a) => a.getAttribute("href"))).toEqual([`/app/task/${TASK}`, `/app/doc/${DOC}`, `/app/project/${PROJECT}`])
  return links()
}

describe("a link card in a message fetches what it opens on intent, not on sight", () => {
  it("holds a skeleton for each link while the cards' code loads, then fetches nothing while it is only on screen", async () => {
    const first = render(<WorkLinkCards text={TEXT} />)
    expect(first.container.querySelectorAll("[data-card-skeleton]")).toHaveLength(3)
    first.unmount()
    for (const a of await cards()) expect(a.getAttribute("data-next-prefetch")).toBe("false")
    await act(async () => {
      vi.advanceTimersByTime(DOC_INTENT_MS * 3)
    })
    await flush()
    expect(prefetched).toEqual([])
  })

  it("fetches its page when a pointer comes over it, the keyboard reaches it or a finger lands on it", async () => {
    const fires = [fireEvent.pointerEnter, fireEvent.focus, fireEvent.touchStart]
    const links = await cards()
    links.forEach((a, i) => {
      fires[i](a)
      expect(a.getAttribute("data-next-prefetch")).toBe("true")
    })
  })

  it("opens a doc's live copy once the pointer rests on the doc's card, and never for a task's or a project's", async () => {
    const [task, doc, project] = await cards()
    for (const a of [task, project]) {
      fireEvent.pointerEnter(a)
      fireEvent.pointerDown(a)
    }
    await act(async () => {
      vi.advanceTimersByTime(DOC_INTENT_MS * 2)
    })
    await flush()
    expect(prefetched).toEqual([])
    fireEvent.pointerEnter(doc)
    await act(async () => {
      vi.advanceTimersByTime(DOC_INTENT_MS)
    })
    await flush()
    expect(prefetched).toEqual([DOC])
  })
})

describe("no link drawn inside a message prefetches on sight", () => {
  // A message row is drawn hundreds of times in a channel: a link in it goes
  // through IntentLink, or is a next/link fetched only when pressed.
  it("every next/link in components/message says prefetch={false}", () => {
    const dir = "components/message"
    const onSight = readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .map((f) => ({ f, src: readFileSync(`${dir}/${f}`, "utf8") }))
      .filter(({ src }) => /from\s+["']next\/link["']/.test(src))
      .filter(({ src }) => (src.match(/<Link\b/g) || []).length !== (src.match(/\bprefetch=\{false\}/g) || []).length)
      .map(({ f }) => f)
    expect(onSight).toEqual([])
  })
})

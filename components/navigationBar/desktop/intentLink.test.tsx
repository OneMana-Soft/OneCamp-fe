import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { readFileSync } from "fs"

const prefetched: string[] = []
vi.mock("@/lib/docPrefetch", () => ({ prefetchDoc: (id: string) => prefetched.push(id) }))
vi.mock("next/link", () => ({
  default: ({ prefetch, children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) => (
    <a data-next-prefetch={String(prefetch)} {...(rest as object)}>{children}</a>
  ),
}))

import { DOC_INTENT_MS, IntentLink, docIdOfHref } from "@/components/navigationBar/desktop/IntentLink"

const DOC = "0b7f1c2e-1111-4a2b-9c3d-123456789abc"
const flush = () => act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)) })

beforeEach(() => {
  prefetched.length = 0
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("a link to a doc prefetches the doc on intent", () => {
  it("knows a doc's link from any other place's", () => {
    expect(docIdOfHref(`/app/doc/${DOC}`)).toBe(DOC)
    expect(docIdOfHref(`/app/doc/${DOC}?new=1`)).toBe(DOC)
    expect(docIdOfHref(`https://onecamp.example/app/doc/${DOC}/comment`)).toBe(DOC)
    expect(docIdOfHref({ pathname: `/app/doc/${DOC}` })).toBe(DOC)
    expect(docIdOfHref("/app/doc")).toBeNull()
    expect(docIdOfHref("/app/docs/x")).toBeNull()
    expect(docIdOfHref("/app/channel/abc")).toBeNull()
  })

  it("after the pointer rests on it, not when it only passes", async () => {
    const { getByText } = render(<IntentLink href={`/app/doc/${DOC}`}>Q4 launch plan</IntentLink>)
    const a = getByText("Q4 launch plan")
    fireEvent.pointerEnter(a)
    fireEvent.pointerLeave(a)
    await act(async () => { vi.advanceTimersByTime(DOC_INTENT_MS * 2) })
    await flush()
    expect(prefetched).toEqual([])
    fireEvent.pointerEnter(a)
    await act(async () => { vi.advanceTimersByTime(DOC_INTENT_MS) })
    await flush()
    expect(prefetched).toEqual([DOC])
    // The route's code is wanted too, as for any sidebar link.
    expect(a.getAttribute("data-prefetch")).toBe("intent")
  })

  it("at once on a focus, a touch or the press itself", async () => {
    for (const fire of [fireEvent.focus, fireEvent.touchStart, fireEvent.pointerDown]) {
      prefetched.length = 0
      const { getByText, unmount } = render(<IntentLink href={`/app/doc/${DOC}`}>Doc</IntentLink>)
      fire(getByText("Doc"))
      await flush()
      expect(prefetched).toEqual([DOC])
      unmount()
    }
  })

  it("never for a link to anywhere else", async () => {
    const { getByText } = render(<IntentLink href="/app/channel/abc">Design</IntentLink>)
    const a = getByText("Design")
    fireEvent.pointerEnter(a)
    fireEvent.focus(a)
    fireEvent.pointerDown(a)
    await act(async () => { vi.advanceTimersByTime(DOC_INTENT_MS * 2) })
    await flush()
    expect(prefetched).toEqual([])
  })

  it("loads the prefetch code only on intent: the sidebar never carries Yjs", () => {
    const src = readFileSync("components/navigationBar/desktop/IntentLink.tsx", "utf8")
    expect(src).toMatch(/import\("@\/lib\/docPrefetch"\)/)
    expect(src).not.toMatch(/^\s*import[^;]*from\s+["']@\/lib\/(docPrefetch|collabSession|collabSocket)["']/m)
  })
})

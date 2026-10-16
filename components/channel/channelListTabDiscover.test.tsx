import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Discover read one page of 20 channels in graph order, yours among them,
// and searched only that page: past 20 channels the rest never showed
// (SN-BUG-4). It pages /ch/discover now, and a search is asked of the server.

const ch = (n: number) => ({ ch_uuid: `c${n}`, ch_name: `alpha-${String(n).padStart(2, "0")}` })
const asked: string[] = []
const answers: Record<string, unknown> = {
  "/ch/discover?pageIndex=0&pageSize=20": { channels_list: Array.from({ length: 20 }, (_, i) => ch(i + 1)), pageCount: 2, has_more: true },
  "/ch/discover?pageIndex=1&pageSize=20": { channels_list: Array.from({ length: 5 }, (_, i) => ch(i + 21)), pageCount: 2, has_more: false },
  "/ch/discover?pageIndex=0&pageSize=20&search=alpha-2": { channels_list: Array.from({ length: 6 }, (_, i) => ch(i + 20)), pageCount: 1, has_more: false },
}
const cache = new Map<string, unknown>()
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    asked.push(url)
    if (!cache.has(url)) cache.set(url, { data: answers[url], isLoading: false, isError: false, mutate: vi.fn() })
    return cache.get(url)
  },
}))
// The list itself is drawn elsewhere; here, its rows and its "more".
vi.mock("@/components/channel/chnnelListResult", () => ({
  ChannelListResult: ({ channelList, onLoadMore, hasMore }: { channelList: { ch_name: string }[]; onLoadMore: () => void; hasMore: boolean }) => (
    <div>
      <ul>{channelList.map((c) => <li key={c.ch_name}>{c.ch_name}</li>)}</ul>
      {hasMore && <button onClick={onLoadMore}>more</button>}
    </div>
  ),
}))

const { ChannelListTabAllActive } = await import("./channelListTabAllActive")

afterEach(() => {
  cleanup()
  asked.length = 0
  cache.clear()
})

describe("the Discover tab", () => {
  it("pages through every channel to join, by name", () => {
    render(<ChannelListTabAllActive searchQuery="" />)
    expect(asked[0]).toBe("/ch/discover?pageIndex=0&pageSize=20")
    expect(screen.getAllByRole("listitem")).toHaveLength(20)
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "more" }))
    })
    expect(asked).toContain("/ch/discover?pageIndex=1&pageSize=20")
    const names = screen.getAllByRole("listitem").map((li) => li.textContent)
    expect(names).toHaveLength(25)
    expect(names[24]).toBe("alpha-25")
    expect(screen.queryByRole("button", { name: "more" })).toBeNull()
  })

  it("asks the server for what is typed, past the first page", () => {
    render(<ChannelListTabAllActive searchQuery="alpha-2" />)
    expect(asked).toContain("/ch/discover?pageIndex=0&pageSize=20&search=alpha-2")
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["alpha-20", "alpha-21", "alpha-22", "alpha-23", "alpha-24", "alpha-25"])
  })

  it("shows a page asked again in its place, each channel once", () => {
    const { rerender } = render(<ChannelListTabAllActive searchQuery="" />)
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "more" }))
    })
    expect(screen.getAllByRole("listitem")).toHaveLength(25)
    // The open page comes back changed (SWR revalidates it on focus): a
    // channel made since moved alpha-20 onto it, and alpha-22 was joined in
    // another tab.
    cache.set("/ch/discover?pageIndex=1&pageSize=20", {
      data: { channels_list: [20, 21, 23, 24, 25, 26].map(ch), pageCount: 2, has_more: false },
      isLoading: false,
      isError: false,
      mutate: vi.fn(),
    })
    rerender(<ChannelListTabAllActive searchQuery="" />)
    const names = screen.getAllByRole("listitem").map((li) => li.textContent)
    expect(names).toHaveLength(25)
    expect(new Set(names).size).toBe(25)
    expect(names).not.toContain("alpha-22")
    expect(names[24]).toBe("alpha-26")
  })

  it("starts again from the first page when the search is cleared", () => {
    const { rerender } = render(<ChannelListTabAllActive searchQuery="" />)
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "more" }))
    })
    rerender(<ChannelListTabAllActive searchQuery="alpha-2" />)
    rerender(<ChannelListTabAllActive searchQuery="" />)
    const names = screen.getAllByRole("listitem").map((li) => li.textContent)
    expect(names).toHaveLength(20)
    expect(names[0]).toBe("alpha-01")
    expect(screen.getByRole("button", { name: "more" })).toBeTruthy()
  })
})

import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The Archived tab offers Restore on each channel the reader may bring back:
// its admins and the workspace's admins (SN-BUG-9). A restored channel leaves
// the tab.

let workspaceAdmin = false
const list = {
  channels_list: [
    { ch_uuid: "c1", ch_name: "launch", ch_is_admin: true },
    { ch_uuid: "c2", ch_name: "offsite", ch_is_admin: false },
  ],
}
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) =>
    url === "/user/profile"
      ? { data: { data: { user_uuid: "me", user_is_admin: workspaceAdmin } } }
      : { data: url ? list : undefined, isLoading: false, isError: false, mutate: vi.fn() },
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => []) }) }))
vi.mock("react-redux", () => ({ useSelector: () => ({}), useDispatch: () => vi.fn() }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}) }))
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }))
vi.mock("@/components/channel/channelListChannel", () => ({ ChannelListChannel: ({ channelName }: { channelName: string }) => <span>{channelName}</span> }))
// jsdom lays nothing out, so the virtual list would draw no rows: every row here.
vi.mock("@/components/list/virtualInfiniteScroll", () => ({
  VirtualInfiniteScroll: <T,>({ items, renderItem }: { items: T[]; renderItem: (item: T, i: number) => React.ReactNode }) => <div>{items.map((it, i) => <React.Fragment key={i}>{renderItem(it, i)}</React.Fragment>)}</div>,
}))
const restoreChannel = vi.fn(async (_id: string) => {})
vi.mock("@/services/channelService", () => ({ restoreChannel: (id: string) => restoreChannel(id) }))

const { ChannelListTabArchive } = await import("./channelListTabArchive")

afterEach(() => {
  cleanup()
  workspaceAdmin = false
  restoreChannel.mockClear()
})

describe("the Archived tab", () => {
  it("offers Restore on the channels the reader is an admin of, and a restored one leaves", async () => {
    render(<ChannelListTabArchive searchQuery="" />)
    expect(screen.getByRole("button", { name: "Restore #launch" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Restore #offsite" })).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restore #launch" }))
    })
    expect(restoreChannel).toHaveBeenCalledWith("c1")
    expect(screen.queryByText("launch")).toBeNull()
    expect(screen.getByText("offsite")).toBeTruthy()
  })

  it("offers a workspace admin Restore on every one", () => {
    workspaceAdmin = true
    render(<ChannelListTabArchive searchQuery="" />)
    expect(screen.getByRole("button", { name: "Restore #launch" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Restore #offsite" })).toBeTruthy()
  })
})

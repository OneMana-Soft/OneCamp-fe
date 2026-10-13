import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react"
import useSWR, { SWRConfig } from "swr"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import type { ReactNode } from "react"
import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import { GetEndpointUrl } from "@/services/endPoints"
import { revalidateStreamBackedKeys, useMessageSyncManager } from "@/hooks/useMessageSyncManager"
import messageResyncSlice from "@/store/slice/messageResyncSlice"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function ChatList({ fetcher }: { fetcher: () => Promise<string> }) {
  const { data } = useSWR(GetEndpointUrl.GetUserLatestChatList, fetcher)
  return <p data-testid="list">{data ?? "loading"}</p>
}

// After a gap in the live connection, every list the stream keeps fresh is
// fetched again. It used to be handed undefined as its data while that
// happened, and every one of them went blank to its loading state.
describe("catching up after a gap in the live connection", () => {
  it("fetches the lists again and keeps them on screen until the answer lands", async () => {
    const pending: ((v: string) => void)[] = []
    const fetcher = vi.fn(() => new Promise<string>((resolve) => pending.push(resolve)))
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false }}>
        <SWRMutateBridge />
        <ChatList fetcher={fetcher} />
      </SWRConfig>,
    )
    await act(async () => pending.shift()?.("Maya, Jonas"))
    await waitFor(() => expect(screen.getByTestId("list").textContent).toBe("Maya, Jonas"))

    await act(async () => revalidateStreamBackedKeys())
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    expect(screen.getByTestId("list").textContent).toBe("Maya, Jonas")

    await act(async () => pending.shift()?.("Maya, Jonas, Sam"))
    await waitFor(() => expect(screen.getByTestId("list").textContent).toBe("Maya, Jonas, Sam"))
  })
})

function Sidebar({ fetcher }: { fetcher: () => Promise<string> }) {
  const { data } = useSWR(GetEndpointUrl.SelfProfileSideNav, fetcher)
  return <p data-testid="sidebar">{data ?? "loading"}</p>
}

// The sidebar holds each channel's unread badge and the Activity count, and
// isn't asked again on focus: after a gap it stayed as it was until a reload.
describe("catching up after a gap", () => {
  it("fetches the sidebar again too", async () => {
    let answer = "#launch 0"
    const fetcher = vi.fn(async () => answer)
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false }}>
        <SWRMutateBridge />
        <Sidebar fetcher={fetcher} />
      </SWRConfig>,
    )
    await waitFor(() => expect(screen.getByTestId("sidebar").textContent).toBe("#launch 0"))
    answer = "#launch 3"
    await act(async () => revalidateStreamBackedKeys())
    await waitFor(() => expect(screen.getByTestId("sidebar").textContent).toBe("#launch 3"))
  })
})

// The connection hook leaves the page's first connection out, so the first
// call here is the first RECONNECT. It was taken for the first connection and
// caught up on nothing: what was sent during the gap never appeared.
describe("the first reconnect", () => {
  it("catches up when the gap was long", () => {
    vi.useFakeTimers()
    const store = configureStore({ reducer: { [messageResyncSlice.name]: messageResyncSlice.reducer } })
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
    const { result } = renderHook(() => useMessageSyncManager(), { wrapper })
    const nonce = () => (store.getState() as { messageResync: { nonce: number } }).messageResync.nonce
    vi.advanceTimersByTime(31_000)
    act(() => result.current.handleConnectionEstablished())
    expect(nonce()).toBe(1)
  })

  it("doesn't when the gap was short", () => {
    vi.useFakeTimers()
    const store = configureStore({ reducer: { [messageResyncSlice.name]: messageResyncSlice.reducer } })
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
    const { result } = renderHook(() => useMessageSyncManager(), { wrapper })
    vi.advanceTimersByTime(5_000)
    act(() => result.current.handleConnectionEstablished())
    expect((store.getState() as { messageResync: { nonce: number } }).messageResync.nonce).toBe(0)
  })
})

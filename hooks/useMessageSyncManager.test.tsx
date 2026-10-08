import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import useSWR, { SWRConfig } from "swr"
import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import { GetEndpointUrl } from "@/services/endPoints"
import { revalidateStreamBackedKeys } from "@/hooks/useMessageSyncManager"

afterEach(cleanup)

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

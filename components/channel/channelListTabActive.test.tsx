import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// An empty Active tab offered only "Create a Channel", to someone whose team
// already talks in channels they hadn't found. It offers those first.

// Stable answers: a new object each render re-runs the list's effects forever.
const answers = vi.hoisted(() => ({
  fetched: { data: { channels_list: [] }, isLoading: false, isError: false, mutate: () => {} },
  post: { makeRequest: () => Promise.resolve(undefined), isSubmitting: false },
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => answers.fetched }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => answers.post }))
const dispatch = vi.fn()
vi.mock("react-redux", () => ({ useDispatch: () => dispatch }))

const { ChannelListTabActive } = await import("./channelListTabActive")

afterEach(cleanup)

describe("the Active tab with no channels", () => {
  it("offers the channels to join before making one", () => {
    const onDiscover = vi.fn()
    render(<ChannelListTabActive searchQuery="" onDiscover={onDiscover} />)
    expect(screen.getByText("You're not in any channels yet")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Discover channels" }))
    expect(onDiscover).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: "Create a channel" }))
    expect(dispatch).toHaveBeenCalled()
  })
})

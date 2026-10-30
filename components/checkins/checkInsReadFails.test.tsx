import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { OWN_ERRORS } from "@/lib/axiosInstance"

// A channel's check-ins whose read failed said "This channel has no check-ins
// yet", and offered an admin a first one (audit Q5). The read goes through the
// real useCheckIns; only the request is stood in for.
// read.retrying: a retry of the failed read is on its way.
const { again, fetchedWith, read } = vi.hoisted(() => ({ again: vi.fn(), fetchedWith: [] as unknown[][], read: { retrying: false } }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (...args: unknown[]) => {
    fetchedWith.push(args)
    return { data: undefined, isLoading: read.retrying, isError: new Error("Network Error"), mutate: again }
  },
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

const { ChannelCheckIns } = await import("@/components/checkins/ChannelCheckIns")

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  read.retrying = false
})

describe("a channel's check-ins that couldn't be read", () => {
  it("says so once, in place, offers nothing to set up, and tries again", () => {
    render(<ChannelCheckIns channelId="ch1" />)
    // In place only: the read keeps the app's error toast out of it.
    expect(fetchedWith.at(-1)?.[3]).toBe(OWN_ERRORS)
    expect(screen.queryByText(/no check-ins yet/)).toBeNull()
    expect(screen.queryByRole("button", { name: "New check-in" })).toBeNull()
    expect(screen.getByText("Couldn't load check-ins")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(again).toHaveBeenCalledTimes(1)
  })

  // SWR retries a failed read on its own every few seconds, with nothing held:
  // each retry swapped the failure for a spinner and back.
  it("keeps saying so while a retry runs, its button waiting", () => {
    read.retrying = true
    render(<ChannelCheckIns channelId="ch1" />)
    expect(screen.queryByLabelText("Loading check-ins")).toBeNull()
    expect(screen.getByText("Couldn't load check-ins")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Retrying…" }) as HTMLButtonElement).disabled).toBe(true)
  })
})

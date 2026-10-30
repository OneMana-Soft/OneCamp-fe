import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The notifications page's switches share one answer (usePreferenceSwitch).
// A toast's Undo runs after the other cards may have changed that answer, so
// it sets only its own switch back, on the answer as it is then. Here the
// answer is one store every card reads, as SWR's cache is.

const { store, post, toast } = vi.hoisted(() => {
  let value: unknown
  const subscribers = new Set<() => void>()
  return {
    store: {
      get: () => value,
      set: (next: unknown) => {
        value = next
        subscribers.forEach((notify) => notify())
      },
      subscribe: (notify: () => void) => {
        subscribers.add(notify)
        return () => void subscribers.delete(notify)
      },
    },
    post: vi.fn(),
    toast: vi.fn(),
  }
})
vi.mock("@/hooks/useFetch", async () => {
  const React = await import("react")
  return {
    useFetch: () => ({
      data: React.useSyncExternalStore(store.subscribe, store.get),
      isLoading: false,
      isError: undefined,
      mutate: async (next: unknown) => store.set(next),
    }),
  }
})
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post } }))
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))

import { DocViewsCard } from "./DocViewsCard"
import { ReadReceiptsCard } from "./ReadReceiptsCard"

beforeEach(() => {
  store.set({ data: { read_receipts: true, read_receipts_allowed: true, record_views: true } })
  post.mockReset().mockResolvedValue({})
  toast.mockReset()
})
afterEach(cleanup)

const checked = (name: string) => screen.getByRole("switch", { name }).getAttribute("aria-checked")

it("an Undo sets back only its own switch, keeping a change made on another card since", async () => {
  render(
    <>
      <ReadReceiptsCard />
      <DocViewsCard />
    </>,
  )
  await act(async () => void fireEvent.click(screen.getByRole("switch", { name: "Send and see read receipts" })))
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Read receipts: Off" })))
  await act(async () => void fireEvent.click(screen.getByRole("switch", { name: "Record my views" })))
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Record my views: Off" })))

  const [{ action }] = toast.mock.calls[0] as [{ action: { props: { onClick: () => Promise<void> } } }]
  await act(() => action.props.onClick())

  expect(post.mock.calls.map((c) => c[1])).toEqual([{ read_receipts: false }, { record_views: false }, { read_receipts: true }])
  expect(checked("Send and see read receipts")).toBe("true")
  expect(checked("Record my views")).toBe("false")
})

it("a failed save puts back only its own switch", async () => {
  render(
    <>
      <ReadReceiptsCard />
      <DocViewsCard />
    </>,
  )
  let fail: (reason: unknown) => void = () => undefined
  post.mockReturnValueOnce(new Promise((_, reject) => (fail = reject)))
  await act(async () => void fireEvent.click(screen.getByRole("switch", { name: "Send and see read receipts" })))
  await act(async () => void fireEvent.click(screen.getByRole("switch", { name: "Record my views" })))
  await act(async () => fail({ response: { status: 500, data: { msg: "Try again." } } }))

  expect(checked("Send and see read receipts")).toBe("true")
  expect(checked("Record my views")).toBe("false")
})

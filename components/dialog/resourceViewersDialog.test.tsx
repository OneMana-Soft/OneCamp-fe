import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// Viewed by says a failed read as a failure (N46): it used to catch the error,
// leave the list empty and say "No views yet" about a doc twelve people read.

vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))
const get = vi.fn()
vi.mock("@/lib/axiosInstance", () => ({ default: { get: (...a: unknown[]) => get(...a) } }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

import ResourceViewersDialog from "./resourceViewersDialog"

afterEach(() => {
  cleanup()
  get.mockReset()
})

const dialog = () => render(<ResourceViewersDialog open onOpenChange={() => {}} viewersEndpoint="/doc/getViewers" idParam="doc_uuid" resourceId="d" noun="doc" />)
const viewer = (n: number) => ({ user_uuid: `u${n}`, user_full_name: `Person ${n}`, last_viewed_at: new Date().toISOString() })

describe("who viewed a doc", () => {
  it("says a failed read failed, with Try again, and never that nobody viewed it", async () => {
    get.mockRejectedValueOnce({ message: "Network Error" })
    dialog()
    expect(await screen.findByText("Couldn't load who viewed this doc")).toBeTruthy()
    expect(screen.queryByText("No views yet")).toBeNull()
    get.mockResolvedValueOnce({ data: { data: [viewer(1)], count: 1 } })
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Person 1")).toBeTruthy()
  })

  it("says the server's reason for a refusal", async () => {
    get.mockRejectedValueOnce({ response: { status: 403, data: { msg: "Only the doc's owner and editors can see who viewed it." } } })
    dialog()
    expect(await screen.findByText("Only the doc's owner and editors can see who viewed it.")).toBeTruthy()
  })

  it("keeps the viewers it has when the next page fails, and tries that page again", async () => {
    get.mockResolvedValueOnce({ data: { data: [viewer(1)], count: 2, has_more: true } })
    dialog()
    await screen.findByText("Person 1")
    get.mockRejectedValueOnce({ message: "Network Error" })
    fireEvent.click(screen.getByRole("button", { name: "Load more" }))
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.getByText("Person 1")).toBeTruthy()
    get.mockResolvedValueOnce({ data: { data: [viewer(2)], count: 2, has_more: false } })
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Person 2")).toBeTruthy()
    expect(get).toHaveBeenLastCalledWith("/doc/getViewers?doc_uuid=d&pageIndex=1&pageSize=50", { suppressErrorToast: true })
  })

  it("shows its rows' shape while it loads, not an empty list", () => {
    get.mockReturnValue(new Promise(() => {}))
    dialog()
    expect(screen.getByRole("status", { name: "Loading viewers" })).toBeTruthy()
    expect(screen.queryByText("No views yet")).toBeNull()
  })
})

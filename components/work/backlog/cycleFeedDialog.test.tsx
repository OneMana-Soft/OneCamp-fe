import { afterEach, describe, expect, it, vi } from "vitest"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const post = vi.hoisted(() => vi.fn())
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post } }))
const confirm = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
const answers = vi.hoisted(() => ({ feed: { data: undefined as unknown, isError: undefined as unknown }, mutate: vi.fn() }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => (url === "/project/p-1/cycles/feed" ? { data: answers.feed.data, isError: answers.feed.isError, mutate: answers.mutate } : { data: undefined, mutate: answers.mutate }),
}))

import CycleFeedDialog from "./CycleFeedDialog"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

afterEach(() => {
  cleanup()
  post.mockReset()
  answers.mutate.mockReset()
  confirm.mockReset()
  answers.feed = { data: undefined, isError: undefined }
})

const feed = (f: Record<string, unknown>) => {
  answers.feed = { data: { data: f }, isError: undefined }
}

// linear-12 part 4: a project's cycles in another calendar, through a secret link of your own.
describe("showing a project's cycles in your calendar", () => {
  it("makes a link, gives it once, and Done closes", async () => {
    feed({ live: false })
    post.mockResolvedValue({ data: { data: { live: true, url: "https://api.test/public/cycles/s3cret.ics", created_at: "2026-10-20T10:00:00Z" } } })
    const closed = vi.fn()
    render(<CycleFeedDialog projectId="p-1" onClose={closed} />)
    expect(screen.getByRole("heading", { name: "Show cycles in your calendar" })).toBeTruthy()
    expect(screen.getByText("No link yet.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Make a link" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/project/p-1/cycles/feed", {}, OWN_ERRORS))
    const link = (await screen.findByRole("textbox", { name: "The cycles' calendar link" })) as HTMLInputElement
    expect(link.value).toBe("https://api.test/public/cycles/s3cret.ics")
    expect(screen.getByText(/only time it's shown/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(closed).toHaveBeenCalled()
  })

  it("asks before a new link stops the live one, and Stop ends it", async () => {
    feed({ live: true, created_at: "2026-10-20T10:00:00Z" })
    post.mockResolvedValue({ data: { data: null } })
    render(<CycleFeedDialog projectId="p-1" onClose={() => {}} />)
    expect(screen.getByText(/You have a link from/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Make a new link" }))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Make a new link?", destructive: true }))
    expect(post).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Stop the link" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/project/p-1/cycles/feed/stop", {}, OWN_ERRORS))
    expect(await screen.findByText("No link yet.")).toBeTruthy()
  })

  // One state for both actions spun Make a new link while the link stopped.
  it("while the link stops, Stop is busy and Make a new link waits", async () => {
    feed({ live: true, created_at: "2026-10-20T10:00:00Z" })
    let stopped = () => {}
    post.mockReturnValue(new Promise((resolve) => (stopped = () => resolve({ data: {} }))))
    render(<CycleFeedDialog projectId="p-1" onClose={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Stop the link" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Stop the link" }).getAttribute("aria-busy")).toBe("true"))
    const make = screen.getByRole("button", { name: "Make a new link" }) as HTMLButtonElement
    expect(make.getAttribute("aria-busy")).toBeNull()
    expect(make.disabled).toBe(true)
    stopped()
    expect(await screen.findByText("No link yet.")).toBeTruthy()
  })

  it("holds the link's place while it's read, and makes nothing before it knows whether a link is live", () => {
    render(<CycleFeedDialog projectId="p-1" onClose={() => {}} />)
    expect(screen.getByRole("status", { name: "Reading your link" })).toBeTruthy()
    expect((screen.getByRole("button", { name: "Make a link" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("says the server's reason when the workspace turned links off", async () => {
    feed({ live: false })
    post.mockRejectedValue({ isAxiosError: true, response: { status: 400, data: { msg: "Your workspace has turned off links to calendars." } } })
    render(<CycleFeedDialog projectId="p-1" onClose={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Make a link" }))
    expect((await screen.findByRole("alert")).textContent).toMatch(/turned off links to calendars|couldn't be made/)
  })
})

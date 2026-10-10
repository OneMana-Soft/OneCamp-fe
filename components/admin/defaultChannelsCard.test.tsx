import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// Where new members start: the admin sees #general as the default until they
// choose, picks public channels, and a refusal from the server is said in its
// own words. A failed load says so rather than showing an empty list.

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))

const api = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}))
vi.mock("@/services/settingsService", () => ({
  getDefaultChannels: api.get,
  setDefaultChannels: api.set,
}))

import DefaultChannelsCard, { forgetKeptChoice, sameChoice } from "./DefaultChannelsCard"

const general = { ch_uuid: "g", ch_name: "general" }
const news = { ch_uuid: "n", ch_name: "news" }
const random = { ch_uuid: "r", ch_name: "random" }

beforeEach(() => {
  api.get.mockResolvedValue({ channels: [general], chosen: false, available: [general, news, random] })
  api.set.mockImplementation(async (ids: string[]) => ({
    channels: [general, news, random].filter((c) => ids.includes(c.ch_uuid)),
    chosen: true,
    available: [general, news, random],
  }))
})
afterEach(() => {
  cleanup()
  forgetKeptChoice()
  toast.mockReset()
  api.get.mockReset()
  api.set.mockReset()
})

describe("choosing where new members start", () => {
  it("says where a new member opens, which is #general whenever it is chosen", () => {
    render(<DefaultChannelsCard />)
    expect(screen.getByText(/opens on #general when it's one of them, otherwise on the first/i)).toBeTruthy()
  })

  it("shows #general as the default until an admin chooses", async () => {
    render(<DefaultChannelsCard />)
    expect(await screen.findByText(/new members join #general/i)).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: "general" }).getAttribute("data-state")).toBe("checked")
    expect(screen.getByRole("checkbox", { name: "news" }).getAttribute("data-state")).toBe("unchecked")
    // Nothing to save, so no save bar: it appears once something changes.
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
    fireEvent.click(screen.getByRole("checkbox", { name: "news" }))
    expect(screen.getByRole("region", { name: "Unsaved changes" })).toBeTruthy()
  })

  it("loads as the list it will show, not a spinner", () => {
    api.get.mockReturnValue(new Promise(() => {}))
    const { container } = render(<DefaultChannelsCard />)
    expect(screen.getByLabelText("Loading the channels new members join")).toBeTruthy()
    expect(container.querySelector(".animate-spin")).toBeNull()
  })

  it("keeps an unsaved choice when the admin switches to another section and back", async () => {
    const first = render(<DefaultChannelsCard />)
    fireEvent.click(await screen.findByRole("checkbox", { name: "news" }))
    first.unmount()
    render(<DefaultChannelsCard />)
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "news" }).getAttribute("data-state")).toBe("checked"))
    expect(screen.getByRole("region", { name: "Unsaved changes" })).toBeTruthy()
  })

  it("saves the channels picked, in the order the list shows", async () => {
    render(<DefaultChannelsCard />)
    fireEvent.click(await screen.findByRole("checkbox", { name: "random" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "news" }))
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Save" })))
    expect(api.set).toHaveBeenCalledWith(["g", "n", "r"])
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "New members will join these channels" }))
    expect(screen.queryByText(/new members join #general/i)).toBeNull()
  })

  it("can choose none, and says what that means", async () => {
    render(<DefaultChannelsCard />)
    fireEvent.click(await screen.findByRole("checkbox", { name: "general" }))
    expect(screen.getByText(/start on Home/i)).toBeTruthy()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Save" })))
    expect(api.set).toHaveBeenCalledWith([])
  })

  it("says the server's reason when it refuses", async () => {
    api.set.mockRejectedValue({ response: { data: { msg: "New members can only join public channels that aren't archived." } } })
    render(<DefaultChannelsCard />)
    fireEvent.click(await screen.findByRole("checkbox", { name: "news" }))
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Save" })))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: "New members can only join public channels that aren't archived.",
      variant: "destructive",
    }))
  })

  it("says a failed load failed, with a way to try again", async () => {
    api.get.mockRejectedValueOnce(new Error("down"))
    render(<DefaultChannelsCard />)
    expect(await screen.findByText(/Couldn't load the channels new members join/)).toBeTruthy()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(await screen.findByRole("checkbox", { name: "general" })).toBeTruthy()
  })
})

describe("sameChoice", () => {
  it("ignores order", () => {
    expect(sameChoice(["a", "b"], ["b", "a"])).toBe(true)
    expect(sameChoice(["a"], ["a", "b"])).toBe(false)
  })
})

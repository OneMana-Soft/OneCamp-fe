import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Where new members start: the admin sees #general as the default until they
// choose, picks public channels, and a refusal from the server is said in its
// own words. A failed load says so rather than showing an empty list.
// Design v3 (admin A7): each tick saves at once (no dock), with the saved
// tick beside the channel; a refusal puts the box back and says why in place.

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

import DefaultChannelsCard, { landingOf, sameChoice, saveOrder } from "./DefaultChannelsCard"

const general = { ch_uuid: "g", ch_name: "general" }
const news = { ch_uuid: "n", ch_name: "news" }
const random = { ch_uuid: "r", ch_name: "random" }

beforeEach(() => {
  api.get.mockResolvedValue({ channels: [general], chosen: false, available: [general, news, random] })
  api.set.mockImplementation(async (ids: string[]) => ({
    channels: ids.map((id) => [general, news, random].find((c) => c.ch_uuid === id)!),
    chosen: true,
    available: [general, news, random],
  }))
})
afterEach(() => {
  cleanup()
  toast.mockReset()
  api.get.mockReset()
  api.set.mockReset()
})

describe("choosing where new members start", () => {
  it("says where a new member opens, which is #general whenever it is chosen", () => {
    render(<DefaultChannelsCard />)
    expect(screen.getByText(/open on #general when it's one of them, otherwise on the first/i)).toBeTruthy()
  })

  it("shows #general as the default until an admin chooses", async () => {
    render(<DefaultChannelsCard />)
    expect(await screen.findByText(/new members join #general/i)).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: "general" }).getAttribute("data-state")).toBe("checked")
    expect(screen.getByRole("checkbox", { name: "news" }).getAttribute("data-state")).toBe("unchecked")
    // Instant: never a dock.
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
  })

  it("loads as the list it will show, not a spinner", () => {
    api.get.mockReturnValue(new Promise(() => {}))
    const { container } = render(<DefaultChannelsCard />)
    expect(screen.getByLabelText("Loading the channels new members join")).toBeTruthy()
    expect(container.querySelector(".animate-spin")).toBeNull()
  })

  it("saves each tick at once, in the order the list shows", async () => {
    render(<DefaultChannelsCard />)
    const randomBox = await screen.findByRole("checkbox", { name: "random" })
    await act(async () => void fireEvent.click(randomBox))
    expect(api.set).toHaveBeenLastCalledWith(["g", "r"])
    await act(async () => void fireEvent.click(screen.getByRole("checkbox", { name: "news" })))
    expect(api.set).toHaveBeenLastCalledWith(["g", "n", "r"])
    expect(document.querySelector("[data-saved-tick]")?.textContent).toBe("Saved")
    expect(screen.queryByText(/new members join #general/i)).toBeNull()
    expect(toast).not.toHaveBeenCalled()
  })

  it("can choose none, and says what that means", async () => {
    render(<DefaultChannelsCard />)
    const generalBox = await screen.findByRole("checkbox", { name: "general" })
    await act(async () => void fireEvent.click(generalBox))
    expect(api.set).toHaveBeenCalledWith([])
    expect(screen.getByText(/start on Home/i)).toBeTruthy()
  })

  it("says the server's reason when it refuses, and puts the box back", async () => {
    api.set.mockRejectedValue({ response: { data: { msg: "New members can only join public channels that aren't archived." } } })
    render(<DefaultChannelsCard />)
    const box = await screen.findByRole("checkbox", { name: "news" })
    await act(async () => void fireEvent.click(box))
    expect(screen.getByRole("alert").textContent).toBe("New members can only join public channels that aren't archived.")
    expect(box.getAttribute("data-state")).toBe("unchecked")
  })

  it("says a failed load failed, with a way to try again", async () => {
    api.get.mockRejectedValueOnce(new Error("down"))
    render(<DefaultChannelsCard />)
    expect(await screen.findByText(/Couldn't load the channels new members join/)).toBeTruthy()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(await screen.findByRole("checkbox", { name: "general" })).toBeTruthy()
  })

  it("offers to open new members elsewhere only while #general isn't chosen", async () => {
    api.get.mockResolvedValue({ channels: [news, random], chosen: true, available: [general, news, random] })
    render(<DefaultChannelsCard />)
    await screen.findByRole("checkbox", { name: "news" })
    expect(screen.queryByRole("button", { name: "More for #news" })).toBeNull()
    expect(screen.getByRole("button", { name: "More for #random" })).toBeTruthy()
  })

  it("says there is nothing to choose from as an empty state, on the workspace tile", async () => {
    api.get.mockResolvedValue({ channels: [], chosen: false, available: [] })
    render(<DefaultChannelsCard />)
    const title = await screen.findByText("No public channels yet")
    const state = title.closest("div")?.parentElement as HTMLElement
    expect(state.querySelector(".hue-sun [data-empty-icon]")).toBeTruthy()
    expect(screen.queryByRole("checkbox")).toBeNull()
  })
})

describe("the landing channel", () => {
  it("is #general when chosen, otherwise the first saved", () => {
    expect(landingOf([news, general])).toBe("g")
    expect(landingOf([random, news])).toBe("r")
    expect(landingOf([])).toBeNull()
  })

  it("stays first in the saved order", () => {
    expect(saveOrder(["n", "r", "g"], [general, news, random], "r")).toEqual(["r", "g", "n"])
    expect(saveOrder(["n"], [general, news, random], "r")).toEqual(["n"])
  })
})

describe("sameChoice", () => {
  it("ignores order", () => {
    expect(sameChoice(["a", "b"], ["b", "a"])).toBe(true)
    expect(sameChoice(["a"], ["a", "b"])).toBe(false)
  })
})

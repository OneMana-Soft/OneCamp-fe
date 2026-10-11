import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// New channel and Edit channel read as one form.
//  - New channel asked for a second step ("Check availability", a second
//    orange button) before Create would wake up, in title case ("Channel
//    Name", "Channel Private", "Create Channel"), its switch straight after
//    its label. It checks the name by itself now, as Edit channel does.
//  - Edit channel stacked four bordered boxes (a card in a card, four times),
//    and three of its switches had no name.

const fetched: string[] = []
// Stable answers: a new object each render looped the dialog's reset effect.
const INFO = { data: { channel_info: { ch_name: "engineering", ch_private: false, ch_deleted_at: "0001-01-01T00:00:00Z", ch_post_policy: "everyone" } }, isLoading: false, mutate: () => {} }
const FREE = { data: { exists: false }, isLoading: false, mutate: () => {} }
const USED = { data: { exists: true }, isLoading: false, mutate: () => {} }
let TAKEN = false
const NONE = { data: undefined, isLoading: false, mutate: () => {} }
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url) fetched.push(url)
    if (url.includes("channelBasicInfo")) return INFO
    return url ? (TAKEN ? USED : FREE) : NONE
  },
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => ({ ch_uuid: "c9" })), isSubmitting: false }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

const { default: store } = await import("@/store/store")
const { default: CreateChannelDialog } = await import("./createChannelDialog")

afterEach(() => {
  cleanup()
  fetched.length = 0
  vi.useRealTimers()
})

describe("New channel", () => {
  it("checks the name by itself and offers one primary action", async () => {
    vi.useFakeTimers()
    render(<CreateChannelDialog dialogOpenState setOpenState={() => {}} />)
    expect(screen.queryByRole("button", { name: /check availability/i })).toBeNull()
    const create = () => screen.getByRole("button", { name: "Create channel" }) as HTMLButtonElement
    expect(create().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText("Channel name"), { target: { value: "launch-week" } })
    await act(async () => void vi.advanceTimersByTime(500))
    expect(fetched.some((u) => u.includes("ch_name=launch-week"))).toBe(true)
    expect(screen.getByText("#launch-week is free")).toBeTruthy()
    expect(create().disabled).toBe(false)
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy()
  })

  it("names its switch and writes its labels in sentence case", () => {
    render(<CreateChannelDialog dialogOpenState setOpenState={() => {}} />)
    expect(screen.getByLabelText("Private channel").getAttribute("role")).toBe("switch")
    expect(screen.queryByText("Channel Name")).toBeNull()
    expect(screen.queryByText("Channel Private")).toBeNull()
    expect(screen.queryByText("Create Channel")).toBeNull()
  })
})

describe("New channel, design v3 (C53)", () => {
  it("writes the name lowercase with hyphens, behind a # that is only decoration", () => {
    render(<CreateChannelDialog dialogOpenState setOpenState={() => {}} />)
    const field = screen.getByLabelText("Channel name") as HTMLInputElement
    fireEvent.change(field, { target: { value: "Launch Week" } })
    expect(field.value).toBe("launch-week")
    const hash = field.parentElement!.querySelector('[aria-hidden="true"]')!
    expect(hash.textContent).toBe("#")
    expect(screen.getByText("Channels are where a team talks, plans and decides.")).toBeTruthy()
  })

  it("offers another name when this one is taken", async () => {
    vi.useFakeTimers()
    TAKEN = true
    render(<CreateChannelDialog dialogOpenState setOpenState={() => {}} />)
    fireEvent.change(screen.getByLabelText("Channel name"), { target: { value: "general" } })
    await act(async () => void vi.advanceTimersByTime(500))
    expect(screen.getByText("Taken. Try #general-2")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Create channel" }) as HTMLButtonElement).disabled).toBe(true)
    TAKEN = false
  })
})


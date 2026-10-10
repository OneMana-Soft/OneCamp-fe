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
const NONE = { data: undefined, isLoading: false, mutate: () => {} }
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url) fetched.push(url)
    if (url.includes("channelBasicInfo")) return INFO
    return url ? FREE : NONE
  },
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => ({ ch_uuid: "c9" })), isSubmitting: false }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/components/ai/ChannelWeeklyReportSetting", () => ({ ChannelWeeklyReportSetting: () => null }))

const { default: store } = await import("@/store/store")
const { default: CreateChannelDialog } = await import("./createChannelDialog")
const { default: EditChannelDialog } = await import("./editChannelDialog")

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
    expect(screen.getByText("Name is available")).toBeTruthy()
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

describe("Edit channel", () => {
  it("lists its settings between hairlines, not in a box each, and names every switch", () => {
    render(
      <Provider store={store}>
        <EditChannelDialog dialogOpenState setOpenState={() => {}} channelId="c1" />
      </Provider>,
    )
    const list = document.querySelector("[data-channel-settings]")!
    expect(list.className).toContain("divide-y")
    const rows = [...list.querySelectorAll("[data-setting-row]")]
    expect(rows).toHaveLength(3)
    for (const row of rows) expect(row.className).not.toMatch(/\bborder\b|\brounded-lg\b/)
    for (const name of ["Private channel", "Announcement channel", "Archive channel"]) {
      expect(screen.getByLabelText(name).getAttribute("role")).toBe("switch")
    }
  })
})

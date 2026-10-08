import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const hook = {
  checkIns: [
    { id: "c1", question: "What did you work on today?", days: [1, 2, 3, 4, 5], time: "17:00", tz: "Asia/Kolkata", paused: false, next_run_at: "2026-10-08T11:30:00Z" },
  ],
  canEdit: true,
  isLoading: false,
  create: vi.fn().mockResolvedValue({}),
  edit: vi.fn().mockResolvedValue({}),
  setPaused: vi.fn().mockResolvedValue({}),
  remove: vi.fn().mockResolvedValue({}),
  askNow: vi.fn().mockResolvedValue({}),
}
vi.mock("@/hooks/useCheckIns", () => ({ useCheckIns: () => hook }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/lib/utils/timeZone", () => ({ browserTZ: () => "Europe/Berlin" }))

const { ChannelCheckIns } = await import("@/components/checkins/ChannelCheckIns")

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  hook.canEdit = true
})

describe("a channel's check-ins", () => {
  it("says what is asked and when", () => {
    render(<ChannelCheckIns channelId="ch1" />)
    expect(screen.getByText("What did you work on today?")).toBeTruthy()
    expect(screen.getByText(/Weekdays at 17:00 \(Asia\/Kolkata\) · next/)).toBeTruthy()
  })

  it("sets one up from a suggestion, in the reader's zone", async () => {
    render(<ChannelCheckIns channelId="ch1" />)
    fireEvent.click(screen.getByRole("button", { name: "New check-in" }))
    fireEvent.click(screen.getByRole("button", { name: "What will you work on this week?" }))
    // Mondays only: the suggestion set the days.
    expect(screen.getByRole("button", { name: "Mon" }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("button", { name: "Tue" }).getAttribute("aria-pressed")).toBe("false")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Set up check-in" })))
    expect(hook.create).toHaveBeenCalledWith({ question: "What will you work on this week?", days: [1], time: "09:30", tz: "Europe/Berlin" })
  })

  it("asks now, and pauses", async () => {
    render(<ChannelCheckIns channelId="ch1" />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ask now" })))
    expect(hook.askNow).toHaveBeenCalledWith("c1")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Pause the check-in" })))
    expect(hook.setPaused).toHaveBeenCalledWith("c1", true)
  })

  it("asks once for a double click", async () => {
    let finish: () => void = () => {}
    hook.askNow.mockImplementationOnce(() => new Promise<void>((r) => (finish = r)))
    render(<ChannelCheckIns channelId="ch1" />)
    const ask = screen.getByRole("button", { name: "Ask now" })
    fireEvent.click(ask)
    fireEvent.click(ask)
    expect(hook.askNow).toHaveBeenCalledTimes(1)
    await act(async () => finish())
  })

  it("shows a member the check-ins without the controls", () => {
    hook.canEdit = false
    render(<ChannelCheckIns channelId="ch1" />)
    expect(screen.getByText("What did you work on today?")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Ask now" })).toBeNull()
    expect(screen.queryByRole("button", { name: "New check-in" })).toBeNull()
  })
})

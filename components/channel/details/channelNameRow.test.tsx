import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Nothing in the app could rename a channel once Edit channel went
// (183ce33d); Details saved the old name with every change (SN-BUG-1).
// Details › About now has the name, and its admins rename it there: a name
// that follows the rule and isn't taken.

const taken = new Set(["design"])
const asked: string[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (!url) return { data: undefined }
    const name = decodeURIComponent(url.split("ch_name=")[1] ?? "")
    asked.push(name)
    return { data: { exists: taken.has(name) } }
  },
}))

const { ChannelNameRow } = await import("./channelNameRow")

afterEach(() => {
  cleanup()
  asked.length = 0
  vi.useRealTimers()
})

const type = (text: string) => {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: text } })
  act(() => {
    vi.advanceTimersByTime(500)
  })
}

describe("the channel's name in Details", () => {
  it("is shown to everyone, and only its admins can rename it", () => {
    const { rerender } = render(<ChannelNameRow name="launch" canRename={false} onRename={vi.fn()} />)
    expect(screen.getByText("#launch")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Rename channel" })).toBeNull()
    rerender(<ChannelNameRow name="launch" canRename onRename={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Rename channel" })).toBeTruthy()
  })

  // A rename kept "engineering qa", a name New channel never makes: it is
  // typed the way New channel types it, lower case with hyphens (QA F-16).
  it("renames to a free name that follows the rule, typed as New channel types it", async () => {
    vi.useFakeTimers()
    const onRename = vi.fn(async () => true)
    render(<ChannelNameRow name="launch" canRename onRename={onRename} />)
    fireEvent.click(screen.getByRole("button", { name: "Rename channel" }))
    type("Launch v2")
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("launch-v2")
    expect(asked).toContain("launch-v2")
    expect(screen.getByText("#launch-v2 is free.")).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }))
    })
    expect(onRename).toHaveBeenCalledWith("launch-v2")
    expect(screen.queryByLabelText("Name")).toBeNull()
  })

  it("won't save a taken name, or one the rule refuses", () => {
    vi.useFakeTimers()
    const onRename = vi.fn(async () => true)
    render(<ChannelNameRow name="launch" canRename onRename={onRename} />)
    fireEvent.click(screen.getByRole("button", { name: "Rename channel" }))
    type("design")
    expect(screen.getByText("#design is taken. Try another name.")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true)
    type("a")
    expect(screen.getByText(/needs at least 2 characters/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true)
    // Not asked about a name that couldn't be one.
    expect(asked).not.toContain("a")
    expect(onRename).not.toHaveBeenCalled()
  })

  // Review, 15 Oct 2026: typing a name in Japanese, the Enter that picks the
  // word saved the rename and closed the field, and the Escape that drops the
  // word threw the whole rename away (lib/keys/ime.ts). Safari's Enter says
  // keyCode 229 and not isComposing.
  it("leaves an input method's Enter and Escape to it", async () => {
    vi.useFakeTimers()
    const onRename = vi.fn(async () => true)
    render(<ChannelNameRow name="launch" canRename onRename={onRename} />)
    fireEvent.click(screen.getByRole("button", { name: "Rename channel" }))
    type("ローンチ")
    expect(screen.getByText("#ローンチ is free.")).toBeTruthy()
    const box = screen.getByLabelText("Name")
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter", isComposing: true })
      fireEvent.keyDown(box, { key: "Enter", keyCode: 229 })
      fireEvent.keyDown(box, { key: "Escape", isComposing: true })
    })
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Name")).toBe(box)
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" })
    })
    expect(onRename).toHaveBeenCalledWith("ローンチ")
  })
})

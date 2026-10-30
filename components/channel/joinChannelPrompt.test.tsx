import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { JoinChannelPrompt } from "./JoinChannelPrompt"

// Someone who isn't in a channel was told "you are not the member of the
// channel" above a bare "Join channel".

afterEach(cleanup)

describe("joining a channel you're not in", () => {
  it("says why you can't write, and joins by name", () => {
    const onJoin = vi.fn()
    render(<JoinChannelPrompt channelName="general" onJoin={onJoin} />)
    expect(screen.getByText("You're not in #general yet. Join to send messages here.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Join #general" }))
    expect(onJoin).toHaveBeenCalledTimes(1)
  })

  it("reads as this channel before the name is known, and waits while joining", () => {
    const onJoin = vi.fn()
    render(<JoinChannelPrompt channelName="" onJoin={onJoin} joining />)
    // Busy with its own join: it keeps its colours and takes no second press.
    const button = screen.getByRole("button", { name: "Joining…" })
    expect(button.getAttribute("aria-busy")).toBe("true")
    fireEvent.click(button)
    expect(onJoin).not.toHaveBeenCalled()
    expect(screen.getByText(/You're not in this channel yet/)).toBeTruthy()
  })

  it("is what both the desktop and the phone channel views show", () => {
    for (const file of ["chanelIdDesktop.tsx", "channelIdMobile.tsx"]) {
      const src = readFileSync(resolve(__dirname, file), "utf8")
      expect(src).toContain("<JoinChannelPrompt")
      expect(src).not.toContain("not the member of the channel")
    }
  })
})

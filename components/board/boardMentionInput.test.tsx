import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The board's comment box (miro-33): it says "(use @ to mention)" only where
// "@" finds someone. The people search is its caller's (a member's board page
// passes it in), so a board link's guest, who has none, is told nothing of
// mentions and searches no one, and the box carries no request code of its own.

import { BoardMentionInput } from "./boardMentionInput"

type Find = React.ComponentProps<typeof BoardMentionInput>["findPeople"]

function Box({ findPeople }: { findPeople?: Find }) {
  const [value, setValue] = React.useState("")
  return <BoardMentionInput value={value} onChange={setValue} onMentionedUsersChange={() => {}} placeholder="Add a comment…" findPeople={findPeople} />
}

const typeAt = async (box: HTMLElement) => {
  fireEvent.change(box, { target: { value: "@an" } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350)
  })
}

describe("a board comment box's words", () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("tells a member they can mention with @, and finds people with the caller's search", async () => {
    vi.useFakeTimers()
    const find = vi.fn().mockResolvedValue([{ user_uuid: "u-ann", user_name: "Ann Lee" }])
    render(<Box findPeople={find} />)
    const box = screen.getByRole("textbox")
    expect(box).toHaveAttribute("placeholder", "Add a comment… (use @ to mention)")
    await typeAt(box)
    expect(find).toHaveBeenCalledWith("an")
  })

  it("says nothing of mentions to someone who has no people, and searches no one", async () => {
    vi.useFakeTimers()
    render(<Box />)
    const box = screen.getByRole("textbox")
    expect(box).toHaveAttribute("placeholder", "Add a comment…")
    await typeAt(box)
    expect(screen.queryByRole("listbox")).toBeNull()
  })
})

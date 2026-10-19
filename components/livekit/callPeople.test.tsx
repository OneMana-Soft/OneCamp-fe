import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ParticipantKind } from "livekit-client"

// Step 3, part 2: who is in the call. The dock had no list and no count; the
// tiles counted screens, so a presenter counted twice.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))

import { CallPeoplePanel, peopleOf } from "./callPeople"

afterEach(cleanup)

const person = (identity: string, name: string, over: Record<string, unknown> = {}) => ({
  identity,
  name,
  isLocal: false,
  isMicrophoneEnabled: true,
  isCameraEnabled: true,
  kind: ParticipantKind.STANDARD,
  ...over,
})

describe("peopleOf", () => {
  it("counts people, never the transcription agent, with you first and the rest by name", () => {
    const rows = peopleOf([
      person("jonas", "Jonas Weber"),
      person("transcriber-bot", "Transcriber", { kind: ParticipantKind.AGENT }),
      person("sam", "Sam Rivera", { isLocal: true }),
      person("guest-7", "Guest: Priya", { isMicrophoneEnabled: false, isCameraEnabled: false }),
    ] as never)
    expect(rows.map((r) => r.name)).toEqual(["Sam Rivera", "Jonas Weber", "Priya"])
    expect(rows[0]).toMatchObject({ you: true })
    expect(rows[2]).toMatchObject({ guest: true, micOn: false, cameraOn: false })
  })
})

describe("the participants panel", () => {
  const rows = peopleOf([person("sam", "Sam Rivera", { isLocal: true }), person("maya", "Maya Chen", { isMicrophoneEnabled: false })] as never)

  it("says how many are in the call, and each one's name, with You and a muted microphone said in words", () => {
    render(<CallPeoplePanel people={rows} onClose={vi.fn()} />)
    const panel = screen.getByRole("complementary", { name: "Participants" })
    expect(within(panel).getByRole("heading").textContent).toMatch(/In the call\s*2/)
    const list = within(panel).getAllByRole("listitem")
    expect(list.map((li) => li.querySelector("[data-person-name]")?.textContent)).toEqual(["Sam Rivera", "Maya Chen"])
    expect(list[0].textContent).toContain("You")
    expect(within(list[1]).getByText("Microphone off")).toBeTruthy()
  })

  it("closes from its own button, and offers a host Remove for everyone but themselves", () => {
    const close = vi.fn()
    const remove = vi.fn()
    render(<CallPeoplePanel people={rows} onClose={close} onRemove={remove} />)
    fireEvent.click(screen.getByRole("button", { name: "Close participants" }))
    expect(close).toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "More for Sam Rivera" })).toBeNull()
    fireEvent.keyDown(screen.getByRole("button", { name: "More for Maya Chen" }), { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from call" }))
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ identity: "maya" }))
  })
})

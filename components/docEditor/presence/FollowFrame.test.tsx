import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { FollowFrame } from "./FollowFrame"

// The following frame on a touch screen (V-293): a phone has no Esc key, so the chip is a key hint, which a touch
// screen with no hover hides (app/globals.css, mobile T5); and Stop is touched across 44px (app/phone.css F3) while
// the pill keeps its size. A mouse sees both as they were. The rules are in those two files, for every key hint and
// every small control; this pins the frame's part in them.

const ANN = { id: "u-ann", name: "Ann Lee" }

afterEach(cleanup)

describe("the following frame", () => {
  it("shows Esc as a key hint, which a touch screen hides, and Stop as a control a finger takes across 44px", () => {
    render(<FollowFrame leader={ANN} said="Following Ann Lee. Press Esc to stop." onStop={() => {}} />)
    expect(screen.getByText(`Following ${ANN.name}`)).toBeTruthy()
    expect(screen.getByText("Esc").closest("[data-kbd-hint]"), "the Esc chip is a key hint").not.toBeNull()
    expect(screen.getByRole("button", { name: "Stop" }).hasAttribute("data-touch-target"), "Stop reaches a finger's 44px").toBe(true)
  })

  it("held on a presenter's view, has no key and no Stop", () => {
    render(<FollowFrame leader={ANN} said="" onStop={() => {}} held />)
    expect(screen.getByText("· held")).toBeTruthy()
    expect(screen.queryByText("Esc")).toBeNull()
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull()
  })
})

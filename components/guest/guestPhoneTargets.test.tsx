import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { GuestChannelActions, GuestGateComposer, PHONE_HIT } from "@/components/guest/guestChannel"

// Critic, 11 Oct. A guest is a client on their own phone, and the guest
// channel's controls were sized for a pointer: Continue was 32px beside a
// 44px name field, Send a 28px square, the name chip 28px and "Reply" 18px.
// And the client project's frame stopped at 1120px, which cut the board's
// Done column through its cards on a 1440 window.

const classes = (el: HTMLElement) => el.className.split(/\s+/)
afterEach(cleanup)

describe("the guest channel on a phone", () => {
  it("makes Continue the name field's height", () => {
    render(<GuestGateComposer name="" onName={() => {}} placeholder="Message #acme" onSend={async () => null} />)
    expect(classes(screen.getByRole("button", { name: "Continue" }))).toEqual(expect.arrayContaining(["h-11", "md:h-8"]))
  })

  it("makes Send a 44px square on a phone", () => {
    render(<GuestGateComposer name="Jordan" onName={() => {}} placeholder="Message #acme" onSend={async () => null} />)
    expect(classes(screen.getByRole("button", { name: "Send" }))).toContain("max-md:size-11")
  })

  it("gives the name chip a 44px target without moving it", () => {
    render(<GuestChannelActions name="Jordan Ellis" onRename={() => {}} />)
    const chip = screen.getByRole("button", { name: /change name/ })
    for (const c of PHONE_HIT.split(" ")) expect(classes(chip)).toContain(c)
    expect(PHONE_HIT).toMatch(/sm:after:hidden/)
  })

  it("gives Reply and Load earlier the same targets", () => {
    const src = readFileSync("app/guest/c/[token]/page.tsx", "utf8")
    expect(src).toMatch(/after:-inset-y-3\.5/)
    expect(src).toMatch(/rounded-\[14px\] px-3 \$\{PHONE_HIT\}/)
  })
})

describe("the client project's frame", () => {
  it("is wide enough for the board's four columns", () => {
    const src = readFileSync("app/guest/p/[token]/page.tsx", "utf8")
    const width = Number(/data-guest-project-frame=""[^>]*max-w-\[(\d+)px\]/.exec(src)?.[1])
    // Four 280px columns, three 12px gaps, 28px of sheet padding a side, and
    // the frame's own 16px a side.
    expect(width).toBeGreaterThanOrEqual(4 * 280 + 3 * 12 + 2 * 28 + 2 * 16)
  })
})

describe("the guest meeting's green room", () => {
  // Critic, 11 Oct: the green room is a size container, so it gives its parent
  // no width of its own; inside a shrink-to-fit column of 448px max it
  // collapsed to its padding, and the join form was a 32px white strip.
  it("takes the frame's full width and height", () => {
    const src = readFileSync("app/guest/m/[token]/page.tsx", "utf8")
    expect(src).toMatch(/data-guest-meeting="" className="flex w-full flex-1 flex-col/)
    expect(src).not.toMatch(/mx-auto flex max-w-md flex-col items-center px-4 pt-6/)
    expect(src).toMatch(/<PreJoin [^>]*embedded/)
  })
})

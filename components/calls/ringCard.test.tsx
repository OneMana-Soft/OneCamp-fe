import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import RingCard, { type RingCardProps } from "@/components/calls/RingCard"
import type { Ring } from "@/lib/calls/ring"
import { pinTestClock } from "@/lib/testing/testClock"

const NOW = Date.parse("2026-11-05T12:00:00Z")
const ring = (session: string, extra: Partial<Ring> = {}): Ring => ({
  session,
  caller: { uuid: `u-${session}`, name: "Maya Rao" },
  resource: { kind: "dm", uuid: `jonas u-${session}` },
  until: NOW + 30_000,
  quiet: false,
  ...extra,
})

function show(over: Partial<RingCardProps> = {}) {
  const props: RingCardProps = {
    rings: [ring("s1")],
    inCall: false,
    phone: false,
    groups: {},
    joining: {},
    focus: false,
    face: (who) => <span data-face={who.uuid} />,
    onAccept: vi.fn(),
    onDecline: vi.fn(),
    onHide: vi.fn(),
    ...over,
  }
  return { props, ...render(<RingCard {...props} />) }
}

afterEach(cleanup)

describe("a ring's card (slack-06 H2)", () => {
  pinTestClock()
  it("names who calls, and offers Decline and Accept", () => {
    const { props } = show()
    const card = screen.getByRole("region", { name: "Incoming call from Maya Rao" })
    expect(within(card).getByText("Calling you")).toBeTruthy()
    fireEvent.click(within(card).getByRole("button", { name: "Accept" }))
    expect(props.onAccept).toHaveBeenCalledWith(props.rings[0])
    fireEvent.click(within(card).getByRole("button", { name: "Decline" }))
    expect(props.onDecline).toHaveBeenCalledWith(props.rings[0])
  })

  it("says it once, assertively", () => {
    show()
    const said = document.querySelectorAll('[aria-live="assertive"]')
    expect(said.length).toBe(1)
    expect(said[0].textContent).toBe("Maya Rao is calling you")
  })

  it("names a group's call with its size", () => {
    show({ rings: [ring("s2", { resource: { kind: "group", uuid: "grp-1" } })], groups: { "grp-1": { name: "Launch crew", people: 5 } } })
    expect(screen.getByText("Calling Launch crew · 5 people")).toBeTruthy()
  })

  it("takes the focus to Accept only when the host says nobody is typing", () => {
    show({ focus: true })
    expect(document.activeElement?.textContent).toBe("Accept")
    cleanup()
    document.body.innerHTML = `<input id="f">`
    const field = document.getElementById("f") as HTMLElement
    field.focus()
    show({ focus: false })
    expect(document.activeElement).toBe(field)
  })

  it("is silent when quiet: the Silent chip, and no pulse", () => {
    show({ rings: [ring("s1", { quiet: true })] })
    expect(screen.getByLabelText("Silent ring: your notifications are paused or this chat is muted").textContent).toBe("Silent")
    expect(document.querySelector(".ring-pulse")).toBeNull()
    expect(document.querySelector(".ring-drain")).not.toBeNull()
  })

  it("pulses and drains when it rings aloud", () => {
    show()
    expect(document.querySelector(".ring-pulse")).not.toBeNull()
    expect(document.querySelector(".ring-drain")).not.toBeNull()
  })

  it("hides on Escape, without declining", () => {
    const { props } = show()
    fireEvent.keyDown(screen.getByRole("button", { name: "Accept" }), { key: "Escape" })
    expect(props.onHide).toHaveBeenCalledWith(props.rings[0])
    expect(props.onDecline).not.toHaveBeenCalled()
  })

  it("in another call: quieter, says so, and Accept reads Leave and join", () => {
    show({ inCall: true })
    expect(screen.getByText("Calling you · You're in a call")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Leave and join" })).toBeTruthy()
    expect(document.querySelector(".ring-pulse")).toBeNull()
  })

  it("while joining: Joining… and Decline waits; when that fails, says so and both work again", () => {
    show({ joining: { s1: "pending" } })
    expect(screen.getByRole("button", { name: "Joining…" }).getAttribute("aria-busy")).toBe("true")
    expect((screen.getByRole("button", { name: "Decline" }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    show({ joining: { s1: "failed" } })
    expect(screen.getByText("Couldn't join. Try again.")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Decline" }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole("button", { name: "Accept" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("shows two rings at most, newest first, and counts the rest", () => {
    show({ rings: [ring("s3", { caller: { uuid: "c", name: "Cy Park" } }), ring("s2", { caller: { uuid: "b", name: "Bo Lin" } }), ring("s1")] })
    const cards = screen.getAllByRole("region")
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual(["Incoming call from Cy Park", "Incoming call from Bo Lin"])
    expect(screen.getByText("+1 more calling")).toBeTruthy()
  })
  it("on a phone: the shared drawer, Decline on the left and Accept on the right in its pinned footer", () => {
    show({ phone: true })
    const foot = document.querySelector("[data-sheet-footer]") as HTMLElement
    expect([...foot.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Decline", "Accept"])
  })
})

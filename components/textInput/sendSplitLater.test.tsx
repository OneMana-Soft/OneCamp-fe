import { afterEach, describe, expect, it, vi } from "vitest"
import * as React from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"
import { SendSplit } from "./composerTools"

const LOAD = { timeout: 8000 }

afterEach(cleanup)
// Thursday 15 Oct 2026, 10:00 on this machine's clock.
pinTestClock(new Date(2026, 9, 15, 10, 0))

async function customTime() {
  fireEvent.keyDown(screen.getByRole("button", { name: "Send later" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: /Custom time/ }))
  return screen.findByRole("group", { name: "Pick a date and time" }, LOAD)
}

// D14: the composer's Custom time… was the browser's datetime-local box, and
// took only a time more than a minute ahead where the server takes 30
// seconds, with no word of why, and any time past the server's 120 days.
describe("the composer's Send later, Custom time…", () => {
  it("swaps the menu for the app's date and time fields and schedules what they say", { timeout: 20000 }, async () => {
    const onSchedule = vi.fn()
    render(<SendSplit nothingToSend={false} label="Send" onSend={() => {}} onSchedule={onSchedule} />)
    const group = await customTime()
    expect(document.querySelector("input[type='datetime-local']")).toBeNull()
    // Two hours ahead to begin with.
    expect(within(group).getByRole("button", { name: /^Time/ })).toHaveTextContent("12:00 PM")
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }))
    expect(onSchedule).toHaveBeenCalledWith(new Date(2026, 9, 15, 12, 0))
  })

  // CR-B44 F2: Custom time stayed open for the next opening, where the choices belong.
  it("opens on its choices again after a time picked there", { timeout: 20000 }, async () => {
    const onSchedule = vi.fn()
    render(<SendSplit nothingToSend={false} label="Send" onSend={() => {}} onSchedule={onSchedule} />)
    await customTime()
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }))
    expect(onSchedule).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    fireEvent.keyDown(screen.getByRole("button", { name: "Send later" }), { key: "Enter" })
    expect(await screen.findByRole("menuitem", { name: /Tomorrow morning/ }, LOAD)).toBeTruthy()
    expect(screen.queryByRole("group", { name: "Pick a date and time" })).toBeNull()
  })

  it("takes the server's window, and says why a time is out of it", { timeout: 20000 }, async () => {
    render(<SendSplit nothingToSend={false} label="Send" onSend={() => {}} onSchedule={() => {}} />)
    const group = await customTime()
    fireEvent.click(within(group).getByRole("button", { name: /^Time/ }))
    const box = await screen.findByLabelText("Type a time", {}, LOAD)
    fireEvent.change(box, { target: { value: "9:00" } })
    fireEvent.keyDown(box, { key: "Enter" })
    expect(await screen.findByText("Pick a time at least 30 seconds from now.")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Schedule" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("keeps its keys from the menu, so Tab and typing stay in the form", { timeout: 20000 }, async () => {
    render(<SendSplit nothingToSend={false} label="Send" onSend={() => {}} onSchedule={() => {}} />)
    const group = await customTime()
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    within(group).getByRole("button", { name: /^Date/ }).dispatchEvent(tab)
    // The menu prevents Tab inside itself; the form's own keys never reach it.
    expect(tab.defaultPrevented).toBe(false)
  })
})

// V-774 (DB-128 F1b): once a time went, the box empties and the chevron hides
// (aria-hidden, out of the tab order), yet the menu gave the focus back to it,
// a control no one could see or reach. The box takes it, as on a phone.
describe("the composer's Send later, after a time went", () => {
  // keep: the words stay after a time went, as a refused one leaves them, so the chevron can open again.
  function Composer({ onSchedule, keep = false }: { onSchedule: () => void; keep?: boolean }) {
    const [words, setWords] = React.useState(true)
    const box = React.useRef<HTMLTextAreaElement>(null)
    const focusBox = React.useCallback(() => box.current?.focus(), [])
    return (
      <>
        <textarea aria-label="Message" ref={box} />
        <SendSplit nothingToSend={!words} label="Send" onSend={() => {}} onSchedule={() => { onSchedule(); if (!keep) setWords(false) }} focusAfter={focusBox} />
      </>
    )
  }

  it("gives the focus to the box, never to the chevron that hid", { timeout: 20000 }, async () => {
    const onSchedule = vi.fn()
    render(<Composer onSchedule={onSchedule} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "Send later" }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: /Tomorrow morning/ }, LOAD))
    expect(onSchedule).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Message" })))
  })

  it("gives it back to the chevron when it closes with nothing picked", { timeout: 20000 }, async () => {
    const onSchedule = vi.fn()
    render(<Composer onSchedule={onSchedule} />)
    const chevron = screen.getByRole("button", { name: "Send later" })
    fireEvent.keyDown(chevron, { key: "Enter" })
    fireEvent.keyDown(await screen.findByRole("menu", {}, LOAD), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(chevron))
    expect(onSchedule).not.toHaveBeenCalled()
  })

  // CR-B51 T1: Custom time's Schedule is the other door a time goes through.
  it("gives the focus to the box after Custom time's Schedule too", { timeout: 20000 }, async () => {
    const onSchedule = vi.fn()
    render(<Composer onSchedule={onSchedule} />)
    await customTime()
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }))
    expect(onSchedule).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Message" })))
  })

  // CR-B51 T1: a time that went moves the focus for that close only.
  it("gives a later close with nothing picked back to the chevron", { timeout: 20000 }, async () => {
    const onSchedule = vi.fn()
    render(<Composer onSchedule={onSchedule} keep />)
    const chevron = screen.getByRole("button", { name: "Send later" })
    fireEvent.keyDown(chevron, { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: /Tomorrow morning/ }, LOAD))
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Message" })))
    fireEvent.keyDown(chevron, { key: "Enter" })
    fireEvent.keyDown(await screen.findByRole("menu", {}, LOAD), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(chevron))
    expect(onSchedule).toHaveBeenCalledTimes(1)
  })
})

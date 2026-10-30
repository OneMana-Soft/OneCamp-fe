import * as React from "react"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { OverlaySheet } from "./overlaySheet"
import { useEscapeClosesPanel } from "@/hooks/useEscapeClosesPanel"
import { escapeBelongsToLayer } from "@/lib/keys/escape"

afterEach(cleanup)

// The tablet's channel list and the right panel over a narrow page were a
// scrim and a sheet built by hand, aria-modal in name only: Tab walked out of
// them into the page behind (REVIEW-FE-SHELL). They share this sheet now.
function Page({ escape }: { escape?: "close" | "own" }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Channels
      </button>
      <button type="button">Behind</button>
      <OverlaySheet open={open} onClose={() => setOpen(false)} label="Channel list" escape={escape} className="tablet-list">
        <button type="button">engineering</button>
        <button type="button">design-crit</button>
      </OverlaySheet>
    </>
  )
}

const open = () => {
  const opener = screen.getByRole("button", { name: "Channels" })
  opener.focus()
  fireEvent.click(opener)
  return { opener, sheet: screen.getByRole("dialog", { name: "Channel list" }) }
}

describe("a sheet over the page", () => {
  it("takes focus into itself, and Tab and Shift+Tab go round it, never to the page behind", () => {
    render(<Page />)
    const { sheet } = open()
    expect(sheet.contains(document.activeElement)).toBe(true)
    const first = screen.getByRole("button", { name: "engineering" })
    const last = screen.getByRole("button", { name: "design-crit" })
    last.focus()
    fireEvent.keyDown(last, { key: "Tab" })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it("closes on Escape and gives focus back to what opened it", async () => {
    render(<Page />)
    const { opener } = open()
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it("closes on a tap on its scrim", () => {
    render(<Page />)
    open()
    fireEvent.click(document.querySelector(".shell-scrim")!)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("leaves Escape to its content when it says so, and isn't a layer over itself then", () => {
    render(<Page escape="own" />)
    const { sheet } = open()
    expect(sheet.getAttribute("data-overlay-sheet")).toBe("own-escape")
    const press = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    expect(escapeBelongsToLayer(press)).toBe(false)
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(screen.getByRole("dialog", { name: "Channel list" })).toBeTruthy()
  })

  // The sheet stops Radix closing it by marking the key, and the right panel
  // read a marked key as one a layer had used: Escape never closed the panel
  // over a narrow page (16 Oct). The sheet hands the press on instead.
  it("hands Escape on to the right panel, which closes on it", () => {
    function NarrowPage() {
      const [open, setOpen] = React.useState(true)
      useEscapeClosesPanel(open, () => setOpen(false))
      return open ? (
        <OverlaySheet open onClose={() => setOpen(false)} label="Side panel" escape="own">
          <button type="button">Copy task link</button>
        </OverlaySheet>
      ) : null
    }
    render(<NarrowPage />)
    const press = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    fireEvent(document.activeElement ?? document.body, press)
    expect(screen.queryByRole("dialog", { name: "Side panel" })).toBeNull()
    // Used by the panel: a toast showing waits for the next press.
    expect(escapeBelongsToLayer(press)).toBe(true)
  })

  it("is a layer over the page otherwise, for the right panel's Escape", () => {
    render(<Page />)
    open()
    expect(escapeBelongsToLayer(new KeyboardEvent("keydown", { key: "Escape" }))).toBe(true)
  })
})

describe("its uses", () => {
  it("are the tablet's channel list and the right panel over the page", async () => {
    const { readFileSync } = await import("node:fs")
    expect(readFileSync("components/navigationBar/tablet/TabletListPanel.tsx", "utf8")).toMatch(/<OverlaySheet open onClose=\{onClose\} label="Channels"/)
    const layout = readFileSync("app/app/LayoutContent.tsx", "utf8")
    // The right panel's ONE sheet (components/rightPanel/RightPanelSheet): over the page on a tablet or a narrow
    // window (LayoutContent), and on a phone's bottom edge (TaskInPlace). Neither draws a sheet of its own.
    const sheet = readFileSync("components/rightPanel/RightPanelSheet.tsx", "utf8")
    const inPlace = readFileSync("components/rightPanel/TaskInPlace.tsx", "utf8")
    expect(sheet).toMatch(/<OverlaySheet[\s\S]*?escape="own"[\s\S]*?data-panel-over=\{over \? "" : undefined\}/)
    expect(layout).toMatch(/<RightPanelSheet[^>]*\bover>/)
    expect(inPlace).toMatch(/<RightPanelSheet[^>]*shape="shell-panel-phone"/)
    for (const caller of [layout, inPlace]) expect(caller).not.toMatch(/<OverlaySheet/)
    expect(layout).not.toMatch(/className="shell-scrim"/)
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"

import { onEscape as answerEscape } from "@/lib/keys/onEscape"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog"
import { SearchInput } from "./search-input"

afterEach(cleanup)

function Controlled(props: Partial<React.ComponentProps<typeof SearchInput>> & { start?: string }) {
  const [value, setValue] = React.useState(props.start ?? "")
  return <SearchInput placeholder="Search people…" {...props} value={value} onValueChange={(v) => { setValue(v); props.onValueChange?.(v) }} />
}

describe("the search field", () => {
  it("is a searchbox named by its label, or by its placeholder without the dots", () => {
    render(<SearchInput placeholder="Search people…" value="" onValueChange={() => {}} />)
    expect(screen.getByRole("searchbox", { name: "Search people" })).toBeTruthy()
    cleanup()
    render(<SearchInput placeholder="Type to filter…" aria-label="Search channels" value="" onValueChange={() => {}} />)
    expect(screen.getByRole("searchbox", { name: "Search channels" })).toBeTruthy()
  })

  it("offers Clear only while there is text, and puts the caret back", () => {
    render(<Controlled />)
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull()
    const box = screen.getByRole("searchbox")
    fireEvent.change(box, { target: { value: "maya" } })
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }))
    expect((box as HTMLInputElement).value).toBe("")
    expect(document.activeElement).toBe(box)
  })

  it("clears on Escape and uses the press; empty, the press is onEscape's or goes on", () => {
    const onEscape = vi.fn()
    render(<Controlled start="maya" onEscape={onEscape} />)
    const box = screen.getByRole("searchbox")
    expect(box.hasAttribute("data-escape-own")).toBe(true)
    expect(fireEvent.keyDown(box, { key: "Escape" })).toBe(false)
    expect((box as HTMLInputElement).value).toBe("")
    expect(onEscape).not.toHaveBeenCalled()
    expect(fireEvent.keyDown(box, { key: "Escape" })).toBe(false)
    expect(onEscape).toHaveBeenCalledTimes(1)
    cleanup()
    render(<Controlled />)
    // Nothing to clear and no onEscape: the sheet or dialog under it hears it.
    expect(fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" })).toBe(true)
  })

  // What answers Esc says so while it has something to do with the press
  // (lib/keys/escapeGuard.test.ts, "Escape at what answers it"), and the one
  // Escape leaves the press to it in any layer (lib/keys/escape).
  it("says it answers Esc while it has text or an onEscape, and only then", () => {
    render(<Controlled start="maya" />)
    const box = screen.getByRole("searchbox")
    expect(box.hasAttribute("data-escape-own")).toBe(true)
    fireEvent.change(box, { target: { value: "" } })
    expect(box.hasAttribute("data-escape-own")).toBe(false)
    cleanup()
    render(<Controlled onEscape={() => {}} />)
    expect(screen.getByRole("searchbox").hasAttribute("data-escape-own")).toBe(true)
  })

  it("in a dialog, clears on the first Esc, and the next closes the dialog", () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Add people</DialogTitle>
          <DialogDescription>Find someone to add.</DialogDescription>
          <Controlled start="maya" />
        </DialogContent>
      </Dialog>,
    )
    const box = screen.getByRole("searchbox") as HTMLInputElement
    fireEvent.keyDown(box, { key: "Escape" })
    expect(box.value).toBe("")
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.keyDown(box, { key: "Escape" })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("on the page, takes the press it answers, and the page hears the next", () => {
    const page = vi.fn()
    const off = answerEscape("page", page)
    try {
      render(<Controlled start="maya" />)
      const box = screen.getByRole("searchbox") as HTMLInputElement
      fireEvent.keyDown(box, { key: "Escape" })
      expect(box.value).toBe("")
      expect(page).not.toHaveBeenCalled()
      fireEvent.keyDown(box, { key: "Escape" })
      expect(page).toHaveBeenCalledTimes(1)
    } finally {
      off()
    }
  })

  it("leaves an input method's Escape to it", () => {
    render(<Controlled start="ma" />)
    const box = screen.getByRole("searchbox")
    fireEvent.keyDown(box, { key: "Escape", isComposing: true })
    expect((box as HTMLInputElement).value).toBe("ma")
  })

  it("takes a toolbar's density: the caller's height and a 14px glyph", () => {
    const { container } = render(<SearchInput size="sm" className="h-8 w-[220px]" placeholder="Search tasks…" value="" onValueChange={() => {}} />)
    const group = screen.getByRole("group")
    expect(group.className.split(/\s+/)).toEqual(expect.arrayContaining(["h-8", "w-[220px]"]))
    expect(group.className).not.toContain("h-11")
    expect(container.querySelector("svg")!.getAttribute("class")).toContain("size-3.5")
  })

  it("shows its key hint while nothing is typed, and Clear in its place once something is", () => {
    render(<Controlled hint={<kbd>/</kbd>} />)
    expect(screen.getByText("/")).toBeTruthy()
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "q" } })
    expect(screen.queryByText("/")).toBeNull()
    expect(screen.getByRole("button", { name: "Clear search" })).toBeTruthy()
  })

  it("is 44px at every width on the search page, with an 18px glyph", () => {
    const { container } = render(<SearchInput size="lg" placeholder="Search…" value="" onValueChange={() => {}} />)
    const group = screen.getByRole("group").className.split(/\s+/)
    expect(group).toEqual(expect.arrayContaining(["h-11", "rounded-[10px]"]))
    expect(group).not.toContain("md:h-8")
    expect(container.querySelector("svg")!.getAttribute("class")).toContain("size-[18px]")
  })
})

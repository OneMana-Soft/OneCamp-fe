import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { onEscape } from "./onEscape"

// An input method's Escape (a word being made in Japanese, Chinese or
// Korean) drops the word: it is the input method's, mid-word (isComposing)
// and in Safari's press that comes after the word went (keyCode 229). Radix's
// layers hear Escape first, in the document, and closed on it from any field
// in them that didn't say it answers Escape; the page's layers heard Safari's.
// The one Escape (lib/keys/escape) keeps it from all of them at once, in the
// window, before any layer hears it.

afterEach(cleanup)

const composing = [
  { key: "Escape", isComposing: true },
  { key: "Escape", keyCode: 229 },
]

describe("an input method's Escape", () => {
  it("never closes a dialog, and a plain one still does", () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Rename</DialogTitle>
          <DialogDescription>{"The table's name."}</DialogDescription>
          <input aria-label="Name" />
        </DialogContent>
      </Dialog>,
    )
    const field = screen.getByLabelText("Name")
    for (const init of composing) fireEvent.keyDown(field, init)
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.keyDown(field, { key: "Escape" })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("never closes a popover", () => {
    const onOpenChange = vi.fn()
    render(
      <Popover open onOpenChange={onOpenChange}>
        <PopoverAnchor asChild>
          <button type="button">Guests</button>
        </PopoverAnchor>
        <PopoverContent>
          <input aria-label="Guest" />
        </PopoverContent>
      </Popover>,
    )
    for (const init of composing) fireEvent.keyDown(screen.getByLabelText("Guest"), init)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("is not the page's: no layer of the one Escape hears it", () => {
    const page = vi.fn(() => true)
    const stop = onEscape("page", page)
    try {
      render(<input aria-label="Search" />)
      for (const init of composing) fireEvent.keyDown(screen.getByLabelText("Search"), init)
      expect(page).not.toHaveBeenCalled()
      fireEvent.keyDown(screen.getByLabelText("Search"), { key: "Escape" })
      expect(page).toHaveBeenCalledTimes(1)
    } finally {
      stop()
    }
  })
})

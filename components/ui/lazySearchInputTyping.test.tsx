import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"

// The search field's chunk lands when a test says so: each test loads
// lazy-search-input afresh, and SearchInput's module waits on the gate.
const gate = vi.hoisted(() => {
  let open = () => {}
  let ready = Promise.resolve()
  return {
    reset: () => void (ready = new Promise<void>((r) => (open = r))),
    wait: () => ready,
    open: () => open(),
  }
})
vi.mock("@/components/ui/search-input", async (importOriginal) => {
  await gate.wait()
  return importOriginal()
})

let lazy: typeof import("./lazy-search-input")
beforeEach(async () => {
  gate.reset()
  vi.resetModules()
  lazy = await import("./lazy-search-input")
})
afterEach(cleanup)

function Field() {
  const [value, setValue] = React.useState("")
  return <lazy.LazySearchInput placeholder="Search…" value={value} onValueChange={setValue} />
}

const field = () => screen.getByRole<HTMLInputElement>("searchbox", { name: "Search" })

async function land() {
  await act(async () => {
    gate.open()
    await lazy.warmSearchInput()
  })
}

// On a cold /app/search, focusing the field fetched its chunk, and the field
// it drew swapped for SearchInput's as the chunk landed, under the typing:
// the focus fell to the page, and the keys after it with it (26 Oct 2026).
describe("a search field typed in as its chunk lands", () => {
  it("keeps the typing: the shared field takes the focus and the caret", async () => {
    render(<Field />)
    const standIn = field()
    standIn.focus()
    fireEvent.change(standIn, { target: { value: "abc" } })
    standIn.setSelectionRange(1, 2)
    await land()
    const shared = field()
    expect(shared).not.toBe(standIn)
    expect(shared.closest("[data-slot=input-group]")?.hasAttribute("data-search-input")).toBe(true)
    expect(document.activeElement).toBe(shared)
    expect(shared.value).toBe("abc")
    expect([shared.selectionStart, shared.selectionEnd]).toEqual([1, 2])
  })

  it("waits for an input method's word before it swaps, its last input included", async () => {
    render(<Field />)
    const standIn = field()
    standIn.focus()
    fireEvent.compositionStart(standIn)
    fireEvent.change(standIn, { target: { value: "かん" } })
    await land()
    expect(field()).toBe(standIn)
    // Safari ends the word, then puts it in: the field the word ends in takes it.
    fireEvent.compositionEnd(standIn)
    fireEvent.change(standIn, { target: { value: "漢" } })
    await waitFor(() => expect(field()).not.toBe(standIn))
    const shared = field()
    expect(document.activeElement).toBe(shared)
    expect(shared.value).toBe("漢")
  })

  it("leaves the focus where it is when the field wasn't in use", async () => {
    render(
      <>
        <input aria-label="Elsewhere" />
        <Field />
      </>,
    )
    const elsewhere = screen.getByRole("textbox", { name: "Elsewhere" })
    elsewhere.focus()
    const standIn = field()
    await land()
    expect(field()).not.toBe(standIn)
    expect(document.activeElement).toBe(elsewhere)
  })
})

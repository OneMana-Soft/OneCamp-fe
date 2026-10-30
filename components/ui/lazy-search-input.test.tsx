import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import * as React from "react"

import { LazySearchInput } from "./lazy-search-input"

afterEach(cleanup)

// A list's toolbar draws only its search glyph on the first screen; the field
// is a chunk of its own (app/firstLoad.test.ts), drawn as a field-shaped
// placeholder until it lands, then the shared SearchInput with its ref.
describe("the toolbar's search field, loaded on first use", () => {
  it("lands as the shared search field, its ref on the text", async () => {
    const ref = React.createRef<HTMLInputElement>()
    render(<LazySearchInput ref={ref} size="sm" placeholder="Search tasks…" value="" onValueChange={() => {}} />)
    const box = await screen.findByRole("searchbox", { name: "Search tasks" }, { timeout: 8000 })
    expect(ref.current).toBe(box)
    expect(box.closest("[data-slot=input-group]")).toBeTruthy()
  })
})

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { SearchField } from "./searchField"

afterEach(cleanup)

describe("a search field", () => {
  it("has a name of its own, not only a placeholder that typing hides", () => {
    render(<SearchField placeholder="Search docs by title…" value="launch" onChange={() => {}} />)
    expect(screen.getByRole("searchbox", { name: "Search docs by title" })).toBeTruthy()
  })

  it("takes a name when the placeholder is not one", () => {
    render(<SearchField placeholder="Type to filter…" ariaLabel="Search channels" value="" onChange={() => {}} />)
    expect(screen.getByRole("searchbox", { name: "Search channels" })).toBeTruthy()
  })
})

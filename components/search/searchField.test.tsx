import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { SearchField } from "./searchField"

// iOS zooms the page in on any text field under 16px when it takes focus, and
// leaves it zoomed. Every list's search box (channels, DMs, tasks, projects,
// teams, docs, goals) was 14px on a phone, so tapping one zoomed the page.

afterEach(() => cleanup())

const classes = (el: Element | null) => (el?.className ?? "").split(/\s+/)

describe("SearchField on a phone", () => {
  it("is 16px text and 44px tall on a phone, 14px and 32px from md up (design v3's field)", () => {
    render(<SearchField placeholder="Search channels…" value="" onChange={() => {}} />)
    const field = classes(screen.getByPlaceholderText("Search channels…"))
    expect(field).toEqual(expect.arrayContaining(["text-base", "md:text-sm", "h-11", "md:h-8"]))
    expect(field, "an unprefixed text-sm overrides the phone size").not.toContain("text-sm")
    expect(field).not.toContain("h-9")
  })

  it("gives clearing the search a thumb-sized target on a phone", () => {
    render(<SearchField placeholder="Search tasks…" value="launch" onChange={() => {}} />)
    expect(classes(screen.getByRole("button", { name: "Clear search" }))).toEqual(
      expect.arrayContaining(["h-11", "w-11", "md:h-5", "md:w-5"]),
    )
  })
})

describe("no field zooms the page on a touch screen", () => {
  it("raises any field set under 16px, on touch screens only", () => {
    const css = readFileSync("app/globals.css", "utf8")
    const block = css.slice(css.indexOf("NO ZOOM ON FOCUS"))
    expect(block).toMatch(/@media \(pointer: coarse\) \{\s*:is\(input:not\([^)]*\), textarea, select\):is\(\.text-sm, \.text-xs, \.text-2xs, \.text-3xs, [^)]*\) \{\s*font-size: 1rem;/)
    // The shared Input steps down to md:text-sm at 768, an iPad's width.
    const sizes = block.match(/textarea, select\):is\(([^)]*)\)/)?.[1] ?? ""
    for (const cls of ["md\\:text-sm", "sm\\:text-sm", "lg\\:text-sm", "md\\:text-xs"]) expect(sizes).toContain(`.${cls}`)
  })

  // Every size of the type scale under 16px, design v3's own among them
  // (text-ui, text-ui-sm, text-meta, text-body...): some fifty fields are set
  // in those, the OneCamp AI bar's and the alt text box among them, and the
  // rule knew only the base scale's, so each zoomed the page on an iPhone.
  it("raises a field in any size of the type scale under 16px, at every width", () => {
    const css = readFileSync("app/globals.css", "utf8")
    const block = css.slice(css.indexOf("NO ZOOM ON FOCUS"))
    const raised = (block.match(/textarea, select\):is\(([^)]*)\)/)?.[1] ?? "").split(",").map((c) => c.trim())
    const small = [...css.matchAll(/--text-([a-z0-9]+(?:-[a-z0-9]+)*): ([0-9.]+)rem;/g)].filter(([, , rem]) => Number(rem) < 1).map(([, name]) => name)
    expect(small).toEqual(expect.arrayContaining(["sm", "xs", "ui", "ui-sm", "meta", "micro", "body"]))
    for (const name of small) {
      for (const prefix of ["", "sm\\:", "md\\:", "lg\\:"]) expect(raised, `a field set in ${prefix.replace("\\", "")}text-${name}`).toContain(`.${prefix}text-${name}`)
    }
  })

  it("types into editors at 16px on touch screens, and still reads messages at 15px", () => {
    const css = readFileSync("components/minimal-tiptap/styles/index.css", "utf8")
    expect(css).toMatch(/\.minimal-tiptap-editor \.ProseMirror \{\s*font-size: 0\.9375rem;/)
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*\.minimal-tiptap-editor \.ProseMirror\[contenteditable="true"\] \{\s*font-size: 1rem;/)
  })
})

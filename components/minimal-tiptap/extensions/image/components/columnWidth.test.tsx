import type React from "react"
import { readFileSync } from "node:fs"
import { render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MeasuredContainer } from "@/components/minimal-tiptap/components/measured-container"
import { measureColumnWidth } from "./image-view-block"

// The editor's measured width (--editor-width) was an inherited custom
// property: each new width restyled every element of the doc, and a seam
// dragged beside it brought one every frame (split view, fluid-21, 21 Oct). It
// is registered as not inherited now (styles/index.css), so the one reader, an
// image sizing itself to the text column, reads it on the editor's container.

afterEach(() => vi.restoreAllMocks())

describe("an image in the editor", () => {
  it("sizes itself to the column the editor's container measured", () => {
    const { container } = render(
      <MeasuredContainer as="div" name="editor" style={{ "--editor-width": "640px" } as React.CSSProperties}>
        <figure>
          <div data-testid="image" />
        </figure>
      </MeasuredContainer>,
    )
    const host = container.querySelector<HTMLElement>('[data-measured="editor"]')
    const image = container.querySelector<HTMLElement>('[data-testid="image"]')
    expect(host).not.toBeNull()
    const read = vi.spyOn(window, "getComputedStyle")
    expect(measureColumnWidth(image)).toBe(640)
    expect(read.mock.calls.map(([el]) => el)).toEqual([host])
  })
})

describe("the editor's measured size", () => {
  it("is registered as not inherited, so a new width restyles its container alone", () => {
    const css = readFileSync("components/minimal-tiptap/styles/index.css", "utf8")
    for (const name of ["--editor-width", "--editor-height"]) {
      const rule = new RegExp(`@property ${name} \\{[^}]*inherits: false;[^}]*\\}`)
      expect(css, name).toMatch(rule)
    }
  })
})

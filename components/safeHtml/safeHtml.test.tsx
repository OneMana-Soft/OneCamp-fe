import * as React from "react"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { SafeHtml } from "./SafeHtml"

afterEach(cleanup)

const same = (html: string) => html

describe("SafeHtml", () => {
  it("keeps its content's elements when its parent draws again with the same HTML", () => {
    function Parent({ tick }: { tick: number }) {
      return (
        <div data-tick={tick}>
          <SafeHtml html="<p>The saved copy</p>" sanitizer={same} />
        </div>
      )
    }
    const { container, rerender } = render(<Parent tick={1} />)
    const before = container.querySelector("p")
    expect(before?.textContent).toBe("The saved copy")
    rerender(<Parent tick={2} />)
    rerender(<Parent tick={3} />)
    // React 19 writes innerHTML again for a new prop object: the paragraph
    // would be a new element, and one read a moment ago gone from the page.
    expect(container.querySelector("p")).toBe(before)
    expect(before?.isConnected).toBe(true)
  })

  it("draws new HTML when it changes", () => {
    const { container, rerender } = render(<SafeHtml html="<p>One</p>" sanitizer={same} />)
    rerender(<SafeHtml html="<p>Two</p>" sanitizer={same} />)
    expect(container.textContent).toBe("Two")
  })
})

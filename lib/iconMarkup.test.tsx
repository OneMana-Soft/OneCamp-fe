import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import * as React from "react"
import { ArrowUpRight } from "@/lib/icons"
import { iconMarkup } from "./iconMarkup"

describe("an icon as markup", () => {
  it("is the svg the icon draws, with no component around it", () => {
    const node = iconMarkup(ArrowUpRight, { className: "size-3", "aria-hidden": true })
    expect(React.isValidElement(node) && node.type).toBe("svg")
    const { container } = render(<>{node}</>)
    const drawn = render(<ArrowUpRight className="size-3" aria-hidden />).container
    expect(container.innerHTML).toBe(drawn.innerHTML)
  })

  it("leaves an icon of another make as it is", () => {
    function Dot(p: { className?: string }) {
      return <i className={p.className} />
    }
    const node = iconMarkup(Dot, { className: "x" })
    expect(React.isValidElement(node) && node.type).toBe(Dot)
  })
})

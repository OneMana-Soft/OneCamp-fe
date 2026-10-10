import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { ColorIcon } from "@/components/colorIcon/colorIcon"
import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"

afterEach(cleanup)

describe("a project's colour mark", () => {
  const id = "0c3b5f86-5911-49c9-9f0c-24a47241a6bd"

  it("is the project's camp hue, the one IdentityMark and the charts use", () => {
    const { container } = render(<ColorIcon name={id} size="dot" />)
    const el = container.firstElementChild!
    expect(el.getAttribute("data-hue")).toBe(hueFor(id))
    expect(el.className).toContain(HUE_CLASS[hueFor(id)])
    expect(el.className).toContain("bg-hue")
    expect(el.className).not.toMatch(/bg-\[#/)
  })

  it("lets a colour the owner picked win, and never shows the uuid", () => {
    const { container } = render(<ColorIcon name={id} chosen="emerald" size="xs" />)
    const el = container.firstElementChild!
    expect(el.getAttribute("data-hue")).toBe("moss")
    expect(el.getAttribute("title")).toBeNull()
    expect(el.getAttribute("aria-hidden")).toBe("true")
  })
})

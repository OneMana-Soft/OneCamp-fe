import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { ChatLoadingSkeleton } from "./ChatLoadingSkeleton"

// A loading conversation in the message row's own measures, so nothing jumps
// when the messages land: 48px circles on a 92px pitch became 36px avatars
// on the row's 54px.
afterEach(cleanup)

describe("ChatLoadingSkeleton", () => {
  it("draws rows the message row's shape", () => {
    const { container } = render(<ChatLoadingSkeleton />)
    const row = container.querySelector("[data-message-skeleton] > div")!
    expect(row.className).toContain("px-4")
    expect(row.className).toContain("py-1.5")
    expect(row.className).toContain("gap-3")
    expect(row.querySelector(".h-9.w-9.rounded-full")).toBeTruthy()
    expect(row.querySelector(".h-12")).toBeNull()
    expect(row.querySelector(".h-5")).toBeTruthy()
    expect(row.querySelector(".h-\\[22px\\]")).toBeTruthy()
  })
})

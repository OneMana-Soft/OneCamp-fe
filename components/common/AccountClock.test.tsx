import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

let kept: Record<string, unknown> | undefined
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: kept ? { data: kept } : undefined }) }))

import { AccountClock } from "./AccountClock"
import { clockTime, setAccountClock } from "@/lib/utils/date/clock"

afterEach(() => {
  cleanup()
  setAccountClock(undefined)
  window.localStorage.removeItem("onecamp:clock")
})

// Calendar A3b: the account's clock holds wherever a time is written.
describe("the account clock", () => {
  const afternoon = new Date(2026, 9, 12, 15, 10)

  it("applies the kept clock and remembers it for this device's next first paint", () => {
    kept = { clock: "24" }
    render(<AccountClock />)
    expect(clockTime(afternoon, { locale: "en-US" })).toBe("15:10")
    expect(window.localStorage.getItem("onecamp:clock")).toBe("24")
  })

  it("keeps what it has while the preferences are still on their way", () => {
    setAccountClock("12")
    kept = undefined
    render(<AccountClock />)
    expect(clockTime(afternoon, { locale: "en-GB" })).toBe("3:10 pm")
  })
})

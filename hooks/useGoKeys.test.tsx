import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { disarmGo } from "@/lib/goKeys"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

import { useGoKeys } from "./useGoKeys"

function Keys() {
  useGoKeys(true)
  return null
}

const at = (path: string) => window.history.replaceState({}, "", path)
const press = (...keys: string[]) => keys.forEach((key) => fireEvent.keyDown(document.body, { key }))

afterEach(() => {
  cleanup()
  push.mockReset()
  disarmGo()
  at("/")
})

describe("G then a letter", () => {
  it("goes there from any page: G then T is My tasks", () => {
    at("/app/home")
    render(<Keys />)
    press("g", "t")
    expect(push).toHaveBeenCalledWith("/app/myTask")
  })

  // The calendar's G is Google Calendar's "Go to a date"; a whiteboard's letters are its tools.
  it("gives way where the page's own keys take G", () => {
    for (const path of ["/app/calendar", "/app/board/b1"]) {
      at(path)
      render(<Keys />)
      press("g", "t")
      cleanup()
    }
    expect(push).not.toHaveBeenCalled()
  })

  it("still works on the calendar's other pages", () => {
    at("/app/calendar/booking")
    render(<Keys />)
    press("g", "h")
    expect(push).toHaveBeenCalledWith("/app/home")
  })
})

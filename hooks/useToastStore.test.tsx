import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"

// The toast store is module state, so each test gets a fresh copy of it.
let toastApi: typeof import("@/hooks/use-toast")
let Toaster: typeof import("@/components/ui/toaster").Toaster

const graph = () => Promise.all([import("@/hooks/use-toast"), import("@/components/ui/toaster")])
// Compiled once while the file is collected, which no hook's time limit
// covers: under load the first compile took the first test's setup past the
// hook's ten seconds. Each test then imports them afresh, which is quick.
await graph()

beforeEach(async () => {
  vi.resetModules()
  const [toasts, toaster] = await graph()
  toastApi = toasts
  Toaster = toaster.Toaster
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("showing a toast", () => {
  // 142 components call useToast() to get toast(). Each of them subscribed to
  // the toast list and re-rendered whenever any toast appeared or closed, with
  // their children: a toast over a 500-member admin list re-rendered 500 rows.
  // Only the Toaster draws the list, so only the Toaster listens to it.
  it("does not re-render the components that only show toasts", () => {
    let renders = 0
    function Caller() {
      toastApi.useToast()
      renders++
      return null
    }
    render(
      <>
        <Caller />
        <Toaster />
      </>,
    )
    const before = renders
    act(() => {
      toastApi.toast({ title: "Saved" })
    })
    expect(screen.getByText("Saved")).toBeTruthy()
    expect(renders).toBe(before)
  })

  // A toast asked for 20 seconds (the Later reminder) closed at the
  // provider's 5: the duration never reached the toast that keeps the time.
  it("stays as long as it was asked to", () => {
    vi.useFakeTimers()
    render(<Toaster />)
    act(() => {
      toastApi.toast({ title: "Reminder", duration: 20000 })
    })
    act(() => {
      vi.advanceTimersByTime(6000)
    })
    expect(screen.queryByText("Reminder")).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(15000)
    })
    expect(screen.queryByText("Reminder")).toBeNull()
  })
})

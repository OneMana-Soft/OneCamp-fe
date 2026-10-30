import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"

// V-67 (29 Oct): the toasts' foot slot is code that comes with the first field
// used (components/ui/toast.tsx). With no network it couldn't come, and nothing
// answered the failure: a page error, and the slot was never asked for again.
// Now the failure is said to whoever asked (lazyChunk: the one probe decides
// whether it was a deploy), and the next field used asks again.
const slot = vi.hoisted(() => ({ fails: 1, asked: 0, keep: vi.fn(() => () => {}) }))
vi.mock("@/lib/loadChunk", () => ({
  lazyChunk: () => ({
    warm: () => {},
    use: async (said: () => void) => {
      slot.asked++
      if (slot.fails-- > 0) {
        said()
        return null
      }
      return { keepOffTheField: slot.keep }
    },
  }),
}))

afterEach(cleanup)

describe("the toasts' foot slot", () => {
  it("asks again at the next field used when its code couldn't come, then stays", async () => {
    const { ToastProvider, ToastViewport } = await import("@/components/ui/toast")
    render(
      <ToastProvider>
        <ToastViewport />
      </ToastProvider>,
    )
    const field = document.body.appendChild(document.createElement("input"))
    fireEvent.focusIn(field)
    await vi.waitFor(() => expect(slot.asked).toBe(1))
    expect(slot.keep).not.toHaveBeenCalled()
    fireEvent.focusIn(field)
    await vi.waitFor(() => expect(slot.keep).toHaveBeenCalledTimes(1))
    expect(slot.asked).toBe(2)
    // Here now: no field asks again.
    fireEvent.focusIn(field)
    await new Promise((r) => setTimeout(r, 10))
    expect(slot.asked).toBe(2)
    field.remove()
  })
})

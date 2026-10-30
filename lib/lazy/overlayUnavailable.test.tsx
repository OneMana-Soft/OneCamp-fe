import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

// An overlay whose code couldn't come as it opened (lib/lazy/lazyPart's
// failure): the Pages sheet, the invite form, Docs & Files' dialogs. It says
// so once and closes once, however often the screen around it redraws.

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (t: unknown) => toast(t) }))

import { OverlayUnavailable } from "@/lib/lazy/overlayUnavailable"

afterEach(() => {
  cleanup()
  toast.mockClear()
})

describe("an overlay whose code couldn't come", () => {
  it("says so once and closes once, though its opener redraws with a new close", () => {
    const first = vi.fn()
    const { rerender } = render(<OverlayUnavailable title="Pages didn't open" onClose={first} />)
    const second = vi.fn()
    rerender(<OverlayUnavailable title="Pages didn't open" onClose={second} />)
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith({ title: "Pages didn't open", description: "Check your connection, then try again.", variant: "destructive" })
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })
})

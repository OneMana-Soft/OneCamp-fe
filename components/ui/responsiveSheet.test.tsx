import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// On a phone the responsive dialog is the shared sheet, and the sheet hugs
// what it holds: a short step's footer sits under its last field, and only a
// long one grows to the sheet's most (92dvh) and scrolls its body. A wide
// dialog's sheet was the large detent, 92dvh tall whatever it held, so the
// guided run's invite step left about 380px of blank sheet above its footer
// (DESIGN-BUILD-2, 20 Oct).
vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => true }))
vi.mock("next/dynamic", () => ({
  default: (load: () => Promise<{ default: React.ComponentType }>) => {
    const Lazy = (props: Record<string, unknown>) => {
      const [C, setC] = React.useState<React.ComponentType | null>(null)
      React.useEffect(() => {
        void load().then((m) => setC(() => m.default))
      }, [])
      return C ? <C {...props} /> : null
    }
    return Lazy
  },
}))

const { ResponsiveDialog } = await import("./responsive-dialog")

afterEach(cleanup)

describe("the responsive dialog on a phone", () => {
  it.each([false, true])("hugs what it holds, wide = %s", async (wide) => {
    render(
      <ResponsiveDialog title="Invite your team" footer={<button type="button">Send invitation</button>} onClose={() => {}} wide={wide}>
        <p>Add their addresses.</p>
      </ResponsiveDialog>,
    )
    const sheet = (await screen.findByRole("dialog")).closest("[data-v3-sheet]")
    expect(sheet?.getAttribute("data-detent")).toBe("medium")
    expect(sheet?.className.split(/\s+/)).not.toContain("h-[92dvh]")
  })
})

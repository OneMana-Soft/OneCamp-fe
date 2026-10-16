import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"

// Ctrl J opens the AI panel from anywhere, but not when something under the
// focus has already used the key: the reaction picker walks its grid with it,
// and every step toggled the panel too.

const dispatched: unknown[] = []
vi.mock("@/components/common/withFeature", () => ({ withAI: <P extends object>(C: React.ComponentType<P>) => C }))
vi.mock("next/navigation", () => ({ usePathname: () => "/app/home" }))
vi.mock("react-redux", () => ({
  useDispatch: () => (a: unknown) => dispatched.push(a),
  useSelector: (pick: (s: unknown) => unknown) => pick({ rightPanel: { rightPanelState: { isOpen: false, data: { aiChatOpen: false } } } }),
}))

const { default: AiQuickInvoke } = await import("@/components/ai/AiQuickInvoke")

afterEach(() => {
  cleanup()
  dispatched.length = 0
})

describe("Ctrl J", () => {
  it("opens the AI panel", () => {
    render(<AiQuickInvoke />)
    fireEvent.keyDown(document, { key: "j", ctrlKey: true })
    expect(dispatched).toHaveLength(1)
  })

  it("leaves the key alone when something under the focus already used it", () => {
    render(<AiQuickInvoke />)
    const picker = (e: Event) => e.preventDefault()
    document.addEventListener("keydown", picker, { capture: true })
    try {
      fireEvent.keyDown(document, { key: "j", ctrlKey: true })
    } finally {
      document.removeEventListener("keydown", picker, { capture: true })
    }
    expect(dispatched).toHaveLength(0)
  })
})

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

  it("leaves the key to a page's own Ctrl J on the document, even one that started listening after it", () => {
    // A table's Ctrl J opens its switcher from a listener on the document,
    // added again each time the page's state moves, so often after this one.
    // Two listeners on the document run in the order they were added: the
    // panel opened beside the switcher, and its field took the letters typed
    // next (tableKeys.spec :89, under load, 1 Nov).
    render(<AiQuickInvoke />)
    const page = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "j") e.preventDefault()
    }
    document.addEventListener("keydown", page)
    try {
      fireEvent.keyDown(document.body, { key: "j", ctrlKey: true })
    } finally {
      document.removeEventListener("keydown", page)
    }
    expect(dispatched).toHaveLength(0)
  })
})

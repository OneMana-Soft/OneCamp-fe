import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { readFileSync } from "node:fs"

vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({ rc: "agent" }) }))
const { TypingIndicator, typingCopy } = await import("./typyingIndicaator")

// Design v3 chat, C59: a whisper on a line that is always there.
describe("who is typing", () => {
  afterEach(cleanup)
  it("keeps its 22px line even when nobody types, so the composer never jumps", () => {
    const { container } = render(<TypingIndicator users={[]} />)
    const line = container.querySelector("[data-typing-line]")!
    expect(line.className).toContain("h-[22px]")
    expect(line.getAttribute("role")).toBe("status")
    expect(line.getAttribute("aria-live")).toBe("polite")
  })
  it("says it in words for one, two and several", () => {
    expect(typingCopy(["Maya Chen"])).toBe("Maya Chen is typing")
    expect(typingCopy(["Maya Chen", "Jonas Weber"])).toBe("Maya and Jonas are typing")
    expect(typingCopy(["A", "B", "C"])).toBe("Several people are typing")
  })
  it("says an agent is working, in its own ink", () => {
    const { container } = render(<TypingIndicator users={[{ user_uuid: "rc", user_name: "Release Captain", is_bot: true } as never]} />)
    expect(container.textContent).toContain("Release Captain is working")
  })
  it("never bounces", () => {
    expect(readFileSync("components/typingIndicator/typyingIndicaator.tsx", "utf8")).not.toMatch(/animate-bounce/)
  })
})

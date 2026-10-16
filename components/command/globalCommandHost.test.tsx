import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"

// MC-BUG-8: every answer that came later over MQTT was toasted "Reminder",
// an installed app's answer to its command too. The server says what each
// is, and only a reminder is titled "Reminder".

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
vi.mock("@/components/invite/MemberInviteDialog", () => ({ MemberInviteDialog: () => null }))
vi.mock("@/components/ai/MarkdownMessage", () => ({ default: ({ content }: { content: string }) => <p>{content}</p> }))
vi.mock("@/components/ui/CornerStack", () => ({ CornerCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

const { default: GlobalCommandHost } = await import("./GlobalCommandHost")

function arrive(detail: Record<string, unknown>) {
  act(() => void window.dispatchEvent(new CustomEvent("command-ephemeral", { detail })))
}

afterEach(() => {
  cleanup()
  toast.mockClear()
})

describe("a late command answer", () => {
  it("is titled by what it is: only a reminder says Reminder", () => {
    render(<GlobalCommandHost />)
    arrive({ response_type: "ephemeral", kind: "reminder", text: "⏰ Reminder: stretch" })
    arrive({ response_type: "ephemeral", kind: "app", text: "Created JIRA-12" })
    arrive({ response_type: "ephemeral", text: "From a server that doesn't say" })
    expect(toast.mock.calls.map(([t]) => [t.title, t.description])).toEqual([
      ["Reminder", "Reminder: stretch"],
      ["Reply from an app", "Created JIRA-12"],
      [undefined, "From a server that doesn't say"],
    ])
    // Its card wears a bell only when it is a reminder.
    expect([...document.querySelectorAll("svg.lucide")].map((s) => (s.classList.contains("lucide-bell") ? "bell" : s.classList.contains("lucide-zap") ? "zap" : "other")).filter((k) => k !== "other")).toEqual(["bell", "zap", "zap"])
  })
})

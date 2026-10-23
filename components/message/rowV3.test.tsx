import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// The message row of design v3 chat: the grid (C07), the reader's clock in
// tabular figures, the 760px measure, the ink hover, the row that is for you
// (C14), the agent's provenance (C11), sending without a fade (C30), the
// failed row's bar and strip (C31), and arrival only when it arrived (C18).

let kinds: Record<string, string> = {}
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined, isLoading: false, mutate: () => {} }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me", user_name: "Sam Rivera" } } }),
}))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => ({}) }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: (id?: string) => (id ? kinds[id] : undefined), useBotKindMap: () => kinds }))
vi.mock("@/components/textInput/textInput", () => ({
  default: ({ content }: { content?: string }) => <div data-testid="body">{content}</div>,
}))
vi.mock("@/lib/utils/useInternalLinkRouter", () => ({ useInternalLinkRouter: () => undefined }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => "/app/channel/c1" }))
vi.mock("@/components/message/AgentResultCards", () => ({ AgentResultCards: () => null }))
vi.mock("@/components/message/WorkLinkCards", () => ({ WorkLinkCards: () => null }))

const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: store } = await import("@/store/store")
const { BaseMessageCard } = await import("@/components/message/baseMessageCard")
const { PendingSendContext } = await import("@/components/message/sendStatus")

type Msg = Parameters<typeof BaseMessageCard>[0]["message"]
function row(message: Partial<Msg>, extra: Record<string, unknown> = {}) {
  const m = { uuid: "p1", bodyText: "<p>Load test is running now.</p>", from: { user_uuid: "maya", user_name: "Maya Chen" } as never, createdAt: "2026-10-10T09:01:00Z", ...message } as Msg
  return render(
    <Provider store={store}>
      <PendingSendContext.Provider value={{ retry: () => {}, edit: () => {}, discard: () => {} }}>
        <TooltipProvider>
          <BaseMessageCard message={m} mediaGetUrl="" rightPanelConfig={{}} hoverOptionsConfig={{}} addReaction={() => {}} removeReaction={() => {}} removePost={() => {}} updatePost={() => {}} {...extra} />
        </TooltipProvider>
      </PendingSendContext.Provider>
    </Provider>,
  )
}
const rowEl = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-message-row]")!

describe("a message row", () => {
  afterEach(() => {
    cleanup()
    kinds = {}
    vi.useRealTimers()
  })

  it("sits on the v3 grid with a 590 name, a tabular time and the 760px measure", () => {
    const { container } = row({})
    const el = rowEl(container)
    expect(el.className).toContain("grid-cols-[36px_minmax(0,1fr)]")
    expect(el.className).toContain("pl-5 pr-6")
    expect(el.className).toContain("hover:bg-hover")
    expect(el.className).not.toContain("bg-accent/40")
    expect(screen.getByRole("button", { name: "Maya Chen" }).className).toContain("font-semibold")
    expect(container.querySelector("time")!.className).toContain("tabular-nums")
    expect(container.querySelector(".chat-body")!.className).toContain("max-w-[760px]")
  })

  it("carries the accent ground, the bar and the accent time when it mentions the reader", () => {
    const { container } = row({ bodyText: '<p><span data-type="mention" data-id="me@0x1" data-label="Sam Rivera">@Sam Rivera</span> rollback steps?</p>' })
    const el = rowEl(container)
    expect(el.dataset.forMe).toBe("true")
    expect(el.className).toContain("bg-brand-muted/70")
    expect(el.className).toContain("before:bg-brand")
    expect(container.querySelector("time")!.className).toContain("text-brand-text")
  })

  it("says on whose behalf an agent acted, and only for an agent", () => {
    kinds = { rc: "agent", ci: "checkin" }
    const agent = row({ from: { user_uuid: "rc", user_name: "Release Captain", is_bot: true } as never, replyTo: { uuid: "q", text: "<p>status?</p>", createdAt: "2026-10-10T09:00:00Z", from: { user_uuid: "sam", user_name: "Sam Rivera" } as never } })
    const line = agent.container.querySelector("[data-provenance]")!
    expect(line.textContent).toContain("Acting for Sam Rivera")
    expect(line.textContent).toContain("can do only what Sam can")
    cleanup()
    expect(row({ from: { user_uuid: "ci", user_name: "Check-in", is_bot: true } as never }).container.querySelector("[data-provenance]")).toBeNull()
    cleanup()
    expect(row({}).container.querySelector("[data-provenance]")).toBeNull()
  })

  it("never dims a message on its way, and shows the clock after 600 ms, the word after 2 s", () => {
    vi.useFakeTimers()
    const { container } = row({ sendState: "sending", localId: "l1" })
    expect(container.innerHTML).not.toContain("opacity-60")
    const note = container.querySelector("[data-sending-note]")!
    expect(note.querySelector("svg")).toBeNull()
    act(() => { vi.advanceTimersByTime(650) })
    expect(note.querySelector("svg")).toBeTruthy()
    act(() => { vi.advanceTimersByTime(1500) })
    expect(container.querySelector("[data-sending-note]")!.textContent).toContain("Sending…")
  })

  it("marks a failed send with the danger bar, its alert and Try again first", () => {
    const { container } = row({ sendState: "failed", localId: "l1" })
    const el = rowEl(container)
    expect(el.dataset.failed).toBe("true")
    expect(el.className).toContain("before:bg-destructive")
    expect(container.querySelector("[data-failed-mark]")).toBeTruthy()
    const strip = container.querySelector("[role=alert][data-failed]")!
    expect(strip.querySelectorAll("button")[0].textContent).toContain("Try again")
  })

  it("rises in only when it arrived, your own from the composer's side", () => {
    expect(rowEl(row({}).container).className).not.toMatch(/animate-msg-in/)
    cleanup()
    expect(rowEl(row({}, { arrived: true }).container).className).toContain("animate-msg-in")
    cleanup()
    expect(rowEl(row({ sendState: "sending", localId: "l" }, { arrived: true }).container).className).toContain("animate-msg-in-own")
  })

  it("draws a Check-in's question as a prompt card with Answer, and only a Check-in's", () => {
    kinds = { ci: "checkin" }
    const { container } = row({ from: { user_uuid: "ci", user_name: "Check-in", is_bot: true } as never, bodyText: "<p>What did you work on today?</p>" })
    expect(container.querySelector("[data-checkin-card]")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Answer" })).toBeTruthy()
    cleanup()
    expect(row({}).container.querySelector("[data-checkin-card]")).toBeNull()
  })

  it("says (edited) with both times when the body changed after it was sent", async () => {
    const { withEditedMark } = await import("@/lib/chat/editedMark")
    const out = withEditedMark("<p>Numbers are in</p>", "Edited 10:42 · originally 10:31")
    expect(out).toBe('<p>Numbers are in<span class="msg-edited" title="Edited 10:42 · originally 10:31">(edited)</span></p>')
  })
})

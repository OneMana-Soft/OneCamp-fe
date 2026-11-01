import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

// TN-BUG-8: focus time holds a teammate's pushes as a pause does, but the bar
// above a DM knew only a pause and quiet hours, so during Maya's focus block
// Jonas was told nothing, or, once the server said "focus", that she was in
// quiet hours.

let status: { reason?: string; until?: string } | undefined
let calendar: { kind?: string; until?: string; words?: string; private?: boolean } | undefined
// The bar's two reads: their notifications (held) and their calendar now (calendar head 5c).
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    const answer = !url ? undefined : url.startsWith("/event/status/") ? calendar : status
    return { data: answer ? { data: answer } : undefined }
  },
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

const { HeldNotificationsBar } = await import("@/components/messages/heldNotificationsBar")

// Every until here is written from now, and the bar says it on now's clock.
pinTestClock()

const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString()
const aMinuteAgo = () => new Date(Date.now() - 60_000).toISOString()
const said = () => screen.getByRole("status").textContent
// The bar's sentence alone, beside its Notify anyway.
const sentence = (words: string | RegExp) => within(screen.getByRole("status")).getByText(words)
const notifyAnyway = () => screen.queryByRole("button", { name: "Notify anyway" })

beforeEach(() => {
  status = undefined
  calendar = undefined
})
afterEach(cleanup)

describe("the held bar above a DM", () => {
  it.each([
    ["focus", /^Maya is in focus time until .+\./],
    ["paused", /^Maya paused notifications until .+\./],
    ["quiet_hours", /^Maya is in quiet hours until .+\./],
  ])("says why for %s", (reason, words) => {
    status = { reason, until: "2026-10-13T10:30:00Z" }
    render(<HeldNotificationsBar userUUID="maya" name="Maya Chen" />)
    expect(said()).toMatch(words)
    expect(notifyAnyway()).toBeInTheDocument()
  })

  it("is not there when nothing is held", () => {
    status = {}
    render(<HeldNotificationsBar userUUID="maya" name="Maya Chen" />)
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("says They're, not They is, before their name has loaded", () => {
    status = { reason: "focus", until: "2026-10-13T10:30:00Z" }
    render(<HeldNotificationsBar userUUID="maya" />)
    expect(said()).toMatch(/^They're in focus time until .+\./)
  })
})

// gcal-9b: chat says what someone's calendar says now, in the server's words on the reader's clock.
describe("what their calendar says, on the same bar", () => {
  it.each([
    ["busy", "In a meeting until 3:00 PM", "Maya is in a meeting until 3:00 PM."],
    ["focus", "In focus until 12:00", "Maya is in focus until 12:00."],
    ["away", "Away until Monday", "Maya is away until Monday."],
  ])("says %s in a sentence, with nothing to notify", (kind, words, sentence) => {
    status = {}
    calendar = { kind, until: inAnHour(), words }
    render(<HeldNotificationsBar userUUID="maya" name="Maya Chen" />)
    expect(said()).toBe(sentence)
    expect(notifyAnyway()).toBeNull()
  })

  it("lets a hold outrank a meeting, and away outrank a hold, with Notify anyway while held", () => {
    status = { reason: "paused", until: "2026-10-13T10:30:00Z" }
    calendar = { kind: "busy", until: inAnHour(), words: "In a meeting until 3:00 PM" }
    const { unmount } = render(<HeldNotificationsBar userUUID="maya" name="Maya Chen" />)
    expect(sentence(/^Maya paused notifications until .+\. They'll see your messages then\.$/)).toBeTruthy()
    unmount()
    // Their messages wait past tonight's quiet hours: away is what the sender needs to know.
    status = { reason: "quiet_hours", until: "2026-10-13T10:30:00Z" }
    calendar = { kind: "away", until: inAnHour(), words: "Away until Monday" }
    render(<HeldNotificationsBar userUUID="maya" name="Maya Chen" />)
    expect(sentence("Maya is away until Monday.")).toBeTruthy()
    expect(notifyAnyway()).toBeInTheDocument()
  })

  // Each status is made as its test runs, on the clock the test set.
  it.each([
    ["kept private", () => ({ words: "", private: true })],
    ["saying nothing", () => ({ kind: "", words: "" })],
    ["ended (a read cached from earlier)", () => ({ kind: "busy", until: aMinuteAgo(), words: "In a meeting until 9:00 AM" })],
  ])("says nothing of a status %s", (_, s) => {
    status = {}
    calendar = s()
    render(<HeldNotificationsBar userUUID="maya" name="Maya Chen" />)
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("reads no calendar for a bot, and says They're before a name loads", () => {
    calendar = { kind: "busy", until: inAnHour(), words: "In a meeting until 3:00 PM" }
    const { unmount } = render(<HeldNotificationsBar userUUID="helper" name="Helper" isBot />)
    expect(screen.queryByRole("status")).toBeNull()
    unmount()
    render(<HeldNotificationsBar userUUID="maya" />)
    expect(said()).toBe("They're in a meeting until 3:00 PM.")
  })
})

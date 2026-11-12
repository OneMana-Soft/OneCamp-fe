import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import * as React from "react"
import { pinTestClock } from "@/lib/testing/testClock"
import { NotifyWhyPanel, type NotifyWhyPanelProps } from "@/components/notifications/NotifyWhyPanel"
import { causeWords, clockWords, stateWords, type TestAnswer, type WhyAnswer } from "@/lib/notifications/whyWords"

/*
 * "Why did or didn't I get this?" (A4 H3): the one lazy piece both doors open,
 * Settings > Notifications' Send me a test and an Inbox row's Why am I seeing
 * this?. Each answer, each verdict and each state is said in words of its own.
 */

afterEach(cleanup)
pinTestClock()

const ME = "11111111-1111-4111-8111-111111111111"
const inAnHour = () => new Date(Date.now() + 60 * 60_000).toISOString()

// The door the panel stands beside: the Inbox row's tool, or Send me a test.
const door = document.body.appendChild(document.createElement("button"))
function open(props: NotifyWhyPanelProps) {
  return render(<NotifyWhyPanel {...props} />)
}
const panel = async () => screen.findByRole("dialog")
// A time keeps its "AM" on its line (lib/utils/date/clock's no-break space); the page's text is read with plain spaces.
const spaced = (words: string) => words.replace(/\s+/g, " ")
const steps = (root: HTMLElement) => within(root).getAllByRole("listitem").map((li) => li.textContent)

const sent: TestAnswer = {
  user_id: ME,
  event_id: `test:${ME}:202611080631`,
  steps: [
    { step: "audience", verdict: "site", causes: ["notify.test"] },
    { step: "hold", verdict: "not_held" },
  ],
  decision: { user_id: ME, cause: "notify.test", to: ["push", "desktop"] },
  devices: { push_devices: 2, push_known: true, apps_open: 1, apps_known: true },
  told: ["push", "desktop"],
}

const test = (state: NotifyWhyPanelProps["state"], onAgain = vi.fn()) =>
  ({ kind: "test", state, onAgain, onClose: vi.fn(), door, id: "notify-panel" }) as NotifyWhyPanelProps
const why = (state: NotifyWhyPanelProps["state"], onAgain = vi.fn()) =>
  ({ kind: "why", state, place: "#launch", onAgain, onClose: vi.fn(), door, id: "notify-panel" }) as NotifyWhyPanelProps

describe("Send me a test's answer", () => {
  it("says each step in words: for you alone, nothing held it, push on two devices, the app open, sent to each", async () => {
    open(test({ status: "done", data: sent }))
    const root = await panel()
    expect(within(root).getByRole("heading", { name: "Test sent" })).toBeInTheDocument()
    const said = steps(root)
    expect(said).toContain("It was for you alone, as a test.")
    expect(said).toContain("Nothing held it back.")
    expect(said).toContain("Push is on for 2 devices.")
    expect(said).toContain("OneCamp is open in 1 app or tab, so a desktop notice shows there.")
    expect(root.querySelector('[data-delivery="push"]')?.textContent).toBe("PushSent")
    expect(root.querySelector('[data-delivery="desktop"]')?.textContent).toBe("Desktop noticeSent")
  })

  it.each([
    ["held:quiet_hours", "Held by your quiet hours until"],
    ["held:paused", "Held while your notifications are paused, until"],
    ["held:focus", "Held by your focus time until"],
  ])("a test %s says until when, and each delivery it held", async (verdict, words) => {
    const till = inAnHour()
    open(
      test({
        status: "done",
        data: {
          ...sent,
          steps: [sent.steps[0], { step: "hold", verdict }],
          decision: { user_id: ME, cause: "notify.test", to: [], held: ["push", "desktop"], hold_till: till },
          told: [],
        },
      }),
    )
    const root = await panel()
    expect(within(root).getByRole("heading", { name: "Test held" })).toBeInTheDocument()
    expect(steps(root)).toContain(`${words} ${clockWords(till)}.`)
    expect(root.querySelector('[data-delivery="push"]')?.textContent).toBe(`PushHeld until ${clockWords(till)}`)
  })

  it("says when it couldn't read the devices, and when none has push on or no app is open", async () => {
    open(test({ status: "done", data: { ...sent, devices: { push_devices: 0, push_known: false, apps_open: 0, apps_known: true } } }))
    let said = steps(await panel())
    expect(said).toContain("We couldn't check your devices for push.")
    expect(said).toContain("OneCamp isn't open anywhere right now, so no desktop notice can show.")
    cleanup()
    open(test({ status: "done", data: { ...sent, devices: { push_devices: 0, push_known: true, apps_open: 0, apps_known: false } } }))
    said = steps(await panel())
    expect(said).toContain("No device has push turned on.")
    expect(said).toContain("We couldn't check where OneCamp is open.")
  })

  it("sending again asks again; a test too soon says when the next can go and waits for it", async () => {
    const again = vi.fn()
    open(test({ status: "done", data: sent }, again))
    fireEvent.click(within(await panel()).getByRole("button", { name: "Send again" }))
    expect(again).toHaveBeenCalledTimes(1)
    cleanup()
    // Its own clock, running: the file's pinned one stands still.
    vi.useRealTimers()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const at = new Date(Date.now() + 40_000).toISOString()
      open(test({ status: "too_soon", retryAt: at }, again))
      const root = await panel()
      expect(within(root).getByRole("heading", { name: "One test a minute" })).toBeInTheDocument()
      expect(within(root).getByText(spaced(`You can send the next one at ${clockWords(at)}.`))).toBeInTheDocument()
      const button = within(root).getByRole("button", { name: "Send again" })
      expect(button).toBeDisabled()
      await act(async () => void vi.advanceTimersByTime(41_000))
      expect(button).toBeEnabled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("the demo says why it sends no test, and offers none", async () => {
    open(test({ status: "demo" }))
    const root = await panel()
    expect(within(root).getByRole("heading", { name: "Not in the demo" })).toBeInTheDocument()
    expect(within(root).getByText(/Everyone shares this demo account/)).toBeInTheDocument()
    expect(within(root).queryByRole("button", { name: "Send again" })).toBeNull()
  })

  it.each([
    [{ status: "loading" } as const, "Sending a test…"],
    [{ status: "offline" } as const, "Connect, then try again."],
    [{ status: "error" } as const, "Couldn't send a test. Try again."],
  ])("%o has its own words", async (state, words) => {
    open(test(state))
    expect(within(await panel()).getByText(words)).toBeInTheDocument()
  })
})

const record: WhyAnswer = {
  events: [
    {
      user_id: ME,
      event_id: "chat:post:p1:created",
      steps: [
        { step: "audience", verdict: "in", causes: ["chat.mention"] },
        { step: "access", verdict: "in_place" },
        { step: "cause", verdict: "chosen", causes: ["chat.mention"] },
        { step: "preference", verdict: "kept" },
        { step: "hold", verdict: "held" },
      ],
      decision: { user_id: ME, cause: "chat.mention", to: ["inbox"], held: ["push", "desktop"], hold_till: "2026-11-08T07:00:00Z" },
      deliveries: [
        { delivery: "inbox", state: "sent", at: "2026-11-08T06:31:00Z" },
        { delivery: "push", state: "held", hold_until: "2026-11-08T07:00:00Z", at: "2026-11-08T06:31:00Z" },
        { delivery: "desktop", state: "dropped", at: "2026-11-08T06:31:00Z" },
        { delivery: "email", state: "retracted", at: "2026-11-08T06:31:00Z" },
      ],
    },
  ],
}

describe("Why am I seeing this?", () => {
  it("says the cause in words, each step's verdict, and what was sent, held, dropped or taken back", async () => {
    open(why({ status: "done", data: record }))
    const root = await panel()
    expect(within(root).getByRole("heading", { name: "Why am I seeing this?" })).toBeInTheDocument()
    expect(within(root).getByText("Because you were mentioned.")).toBeInTheDocument()
    const said = steps(root)
    expect(said).toContain("It was meant for you.")
    expect(said).toContain("You're in #launch.")
    expect(said).toContain("The reason that counted: you were mentioned.")
    expect(said).toContain("Your notification settings let it through.")
    expect(said).toContain(`Held by your schedule until ${clockWords("2026-11-08T07:00:00Z")}.`)
    expect(root.querySelector('[data-delivery="inbox"]')?.textContent).toBe(`InboxSent ${clockWords("2026-11-08T06:31:00Z")}`)
    expect(root.querySelector('[data-delivery="push"]')?.textContent).toBe(`PushHeld until ${clockWords("2026-11-08T07:00:00Z")}`)
    expect(root.querySelector('[data-delivery="desktop"]')?.textContent).toBe("Desktop noticeNot sent: the message was deleted while it was held")
    expect(root.querySelector('[data-delivery="email"]')?.textContent).toBe("EmailTaken back: the message was deleted")
  })

  it("words a DM's place, nothing to hold and not held each its own way", async () => {
    const one = record.events[0]
    open({
      ...why({
        status: "done",
        data: {
          events: [
            { ...one, steps: [{ step: "access", verdict: "in_place" }, { step: "hold", verdict: "nothing_to_hold" }] },
            { ...one, event_id: "older", steps: [{ step: "hold", verdict: "not_held" }] },
          ],
        },
      }),
      place: "a direct message",
    } as NotifyWhyPanelProps)
    const said = steps(await panel())
    expect(said).toContain("You're in this conversation.")
    expect(said).toContain("Nothing to hold: it only went where it can't interrupt you.")
    expect(said).toContain("Nothing held it back.")
  })

  it.each(["chat.dm", "chat.mention", "chat.reply_to_you", "chat.reply", "chat.team", "chat.keyword", "chat.broadcast", "chat.message", "chat.reaction", "chat.call", "calendar.invited", "calendar.reminder"])(
    "the cause %s has words of its own",
    (cause) => {
      expect(causeWords(cause)).not.toBe(causeWords("something.else"))
      expect(causeWords(cause)).toMatch(/^[a-z@]/)
    },
  )

  it("every cause's words differ", () => {
    const all = ["chat.dm", "chat.mention", "chat.reply_to_you", "chat.reply", "chat.team", "chat.keyword", "chat.broadcast", "chat.message", "chat.reaction", "chat.call"].map(causeWords)
    expect(new Set(all).size).toBe(all.length)
  })

  it("no state's line starts by saying its heading again", () => {
    const states = [
      { status: "loading" },
      { status: "empty" },
      { status: "too_soon", retryAt: new Date().toISOString() },
      { status: "demo" },
      { status: "no_record" },
      { status: "offline" },
      { status: "error" },
    ] as const
    for (const kind of ["test", "why"] as const)
      for (const state of states) {
        const { title, line } = stateWords(kind, state)
        expect(line.toLowerCase().startsWith(title.toLowerCase()), `${kind}, ${state.status}: "${line}" under "${title}"`).toBe(false)
      }
  })

  it.each([
    [{ status: "no_record" } as const, "No record", "There's no record of how this reached you."],
    [{ status: "empty" } as const, "Nothing recorded", "Nothing was recorded about how this reached you."],
    [{ status: "offline" } as const, "You're offline", "Connect, then try again."],
    [{ status: "error" } as const, "Something went wrong", "Couldn't look that up. Try again."],
    [{ status: "loading" } as const, "Why am I seeing this?", "Looking it up…"],
  ])("%o says so in its own words", async (state, heading, words) => {
    open(why(state))
    const root = await panel()
    expect(within(root).getByRole("heading", { name: heading })).toBeInTheDocument()
    expect(within(root).getByText(words)).toBeInTheDocument()
  })

  it("rate-limited says when to try again; Try again asks again", async () => {
    const again = vi.fn()
    const at = new Date(Date.now() + 20_000).toISOString()
    open(why({ status: "too_soon", retryAt: at }, again))
    const root = await panel()
    expect(within(root).getByText(spaced(`Try again at ${clockWords(at)}.`))).toBeInTheDocument()
    cleanup()
    open(why({ status: "error" }, again))
    fireEvent.click(within(await panel()).getByRole("button", { name: "Try again" }))
    expect(again).toHaveBeenCalledTimes(1)
  })
})

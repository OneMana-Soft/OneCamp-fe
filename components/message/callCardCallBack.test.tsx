import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import EndedCallCard, { CallCard } from "./callCard"
import type { HuddleFacts } from "@/lib/calls/huddle"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const MISSED: HuddleFacts = { session: "s1", started: "2026-11-05T12:00:00Z", ended: "2026-11-05T12:00:31Z", seconds: 31, came: [], people: 0, missed: true }
const faces = () => null

afterEach(cleanup)

describe("a missed call's card: Call back (slack-06 H2)", () => {
  it("the one who was called: Missed call, and Call back in Join's place", () => {
    render(<CallCard facts={MISSED} inChannel={false} faces={faces} href="/app/meet/chat/sam" caller="Sam Rivera" />)
    expect(screen.getByText("Missed call")).toBeTruthy()
    const back = screen.getByRole("link", { name: "Call Sam back" })
    expect(back.textContent).toBe("Call back")
    expect(back.getAttribute("href")).toBe("/app/meet/chat/sam")
  })

  it("the one who called: No answer, and Call again", () => {
    render(<CallCard facts={MISSED} inChannel={false} faces={faces} href="/app/meet/chat/maya" caller="Sam Rivera" mine />)
    expect(screen.getByText("No answer")).toBeTruthy()
    expect(screen.queryByText("Missed call")).toBeNull()
    expect(screen.getByRole("link", { name: "Call again" }).getAttribute("href")).toBe("/app/meet/chat/maya")
  })

  it("a group's: Call the group back", () => {
    render(<CallCard facts={MISSED} inChannel={false} faces={faces} href="/app/meet/grp/g1" caller="Sam Rivera" group />)
    expect(screen.getByRole("link", { name: "Call the group back" }).textContent).toBe("Call back")
  })

  it("never in a channel, on a call that was answered, or without a door", () => {
    render(<CallCard facts={MISSED} inChannel faces={faces} href="/app/meet/ch/c1" caller="Sam Rivera" />)
    expect(screen.queryByRole("link")).toBeNull()
    cleanup()
    render(<CallCard facts={{ ...MISSED, missed: false, came: [{ uuid: "sam", name: "Sam Rivera" }], people: 2 }} inChannel={false} faces={faces} href="/app/meet/chat/sam" caller="Sam Rivera" />)
    expect(screen.queryByRole("link")).toBeNull()
    cleanup()
    render(<CallCard facts={MISSED} inChannel={false} faces={faces} caller="Sam Rivera" />)
    expect(screen.queryByRole("link")).toBeNull()
  })
})

// The post's own card reads who started the call from its facts (by, written
// at the call's end) against the person viewing: no prop from the message row.
describe("a missed call's post: who called, from its facts (slack-06 H2)", () => {
  const SAM = "u-sam"
  const ME = "u-maya"
  const missed = (by?: string): HuddleFacts => ({ ...MISSED, by, came: [{ uuid: SAM, name: "Sam Rivera" }], people: 1 })
  const DM = { kind: "chat" as const, id: "c1" }

  it("rang you: Missed call, and Call back to the DM's call", () => {
    render(<EndedCallCard facts={missed(SAM)} inChannel={false} faces={faces} at={DM} self={ME} />)
    expect(screen.getByText("Missed call")).toBeTruthy()
    const back = screen.getByRole("link", { name: "Call Sam back" })
    expect(back.textContent).toBe("Call back")
    expect(back.getAttribute("href")).toBe("/app/meet/chat/c1")
  })

  it("you started it: No answer, and Call again", () => {
    render(<EndedCallCard facts={missed(ME)} inChannel={false} faces={faces} at={DM} self={ME} />)
    expect(screen.getByText("No answer")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Call again" }).getAttribute("href")).toBe("/app/meet/chat/c1")
  })

  it("a group's: Call the group back", () => {
    render(<EndedCallCard facts={missed(SAM)} inChannel={false} faces={faces} at={{ kind: "group", id: "g1" }} self={ME} />)
    expect(screen.getByRole("link", { name: "Call the group back" }).getAttribute("href")).toBe("/app/meet/grp/g1")
  })

  it("a card written before its facts said who called: today's look, never Call back to its own starter", () => {
    render(<EndedCallCard facts={missed(undefined)} inChannel={false} faces={faces} at={DM} self={SAM} />)
    expect(screen.getByText("Missed call")).toBeTruthy()
    expect(screen.queryByText("No answer")).toBeNull()
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("never in a channel, nor without the reader", () => {
    render(<EndedCallCard facts={missed(SAM)} inChannel faces={faces} at={{ kind: "channel", id: "ch1" }} self={ME} />)
    expect(screen.queryByRole("link")).toBeNull()
    cleanup()
    render(<EndedCallCard facts={missed(SAM)} inChannel={false} faces={faces} at={DM} />)
    expect(screen.queryByRole("link")).toBeNull()
  })
})

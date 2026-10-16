import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { HubSegmented, HubTabs } from "@/components/activity/hubFrame"
import { HubError } from "@/components/activity/hubEmpty"
import { PendingSendContext, SendStatus } from "@/components/message/sendStatus"

// QA F-26: on a phone the Inbox's chips were 24px tall, its "All" tab 35px
// wide, Try again 28px and a failed send's buttons 24px. Chat's own controls
// carry data-touch-target, so each takes a finger's 44px (app/phone.css F3)
// without being drawn any bigger.

afterEach(cleanup)

const touchable = (el: Element) => el.hasAttribute("data-touch-target")

describe("chat's own controls take a finger's 44px", () => {
  it("every tab of the hub and every segment of its who-filter", () => {
    render(
      <>
        <HubTabs label="Inbox" value="all" onChange={() => {}} tabs={[{ value: "priority", label: "Priority" }, { value: "all", label: "All" }]} />
        <HubSegmented label="Show activity from" value="everyone" onChange={() => {}} segments={[{ value: "everyone", label: "Everyone" }, { value: "people", label: "People" }]} />
      </>,
    )
    const tabs = screen.getAllByRole("tab")
    expect(tabs).toHaveLength(2)
    for (const t of tabs) expect(touchable(t), t.textContent ?? "").toBe(true)
    for (const name of ["Everyone", "People"]) expect(touchable(screen.getByRole("button", { name }))).toBe(true)
  })

  it("Try again on a list that didn't load", () => {
    render(<HubError text="Your inbox isn't loading. Nothing has been lost." onRetry={() => {}} />)
    expect(touchable(screen.getByRole("button", { name: "Try again" }))).toBe(true)
  })

  it("a failed send's Try again, Edit and Delete", () => {
    render(
      <PendingSendContext.Provider value={{ retry: () => {}, edit: () => {}, discard: () => {} }}>
        <SendStatus state="failed" localId="local-1" />
      </PendingSendContext.Provider>,
    )
    for (const name of ["Try again", "Edit", "Delete"]) expect(touchable(screen.getByRole("button", { name })), name).toBe(true)
  })
})

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { GlanceLine, glanceLoading, glanceText } from "@/components/home/GlanceLine"

/**
 * Home's summary sentence (hub.md H4): what needs you, then what's next.
 * Unread channels and DMs left it for the sidebar.
 */
afterEach(cleanup)

const zero = { tasksDue: 0, overdue: 0, mentions: 0, agentRequests: 0 }
const next = { title: "Launch sync", time: "11:00" }

describe("the summary sentence", () => {
  it("puts what needs you before the next event", () => {
    expect(glanceText({ tasksDue: 1, overdue: 1, mentions: 1, agentRequests: 2 }, next)).toBe(
      "1 task due today, 1 overdue · 1 mention waiting · 2 agent requests · Next: Launch sync at 11:00",
    )
    const { container } = render(<GlanceLine counts={{ tasksDue: 1, overdue: 0, mentions: 1, agentRequests: 1 }} next={next} />)
    expect(container.textContent).toBe("1 task due today · 1 mention waiting · 1 agent request · Next: Launch sync at 11:00")
  })

  it("never counts unread channels or DMs", () => {
    const { container } = render(<GlanceLine counts={{ ...zero, tasksDue: 2 }} />)
    expect(container.textContent).not.toMatch(/unread|channel|message/)
  })

  it("has exact words when nothing needs you", () => {
    expect(glanceText(zero, next)).toBe("Nothing needs you. Next up: Launch sync at 11:00.")
    expect(glanceText(zero)).toBe("Nothing needs you today.")
    const { container } = render(<GlanceLine counts={zero} next={next} />)
    expect(container.textContent).toBe("Nothing needs you. Next up: Launch sync at 11:00.")
  })

  it("says overdue in danger ink", () => {
    render(<GlanceLine counts={{ ...zero, tasksDue: 1, overdue: 2 }} />)
    expect(screen.getByText("2 overdue").className).toMatch(/text-danger-ink/)
  })

  it("holds the line's place while the counts aren't in", () => {
    const { container } = render(<GlanceLine loading counts={zero} />)
    expect(container.textContent).not.toContain("Nothing needs you")
    expect(screen.getByRole("status", { name: "Counting what needs you" })).toBeTruthy()
  })
})

describe("glanceLoading", () => {
  it("waits for the sidenav answer", () => {
    expect(glanceLoading(undefined, {})).toBe(true)
  })
  it("waits the one render between the answer and the store", () => {
    expect(glanceLoading({ user_channels: [{}], user_dms: [] }, { userChannels: [], userChats: [] })).toBe(true)
    expect(glanceLoading({ user_channels: [{}], user_dms: [] }, { userChannels: [{}], userChats: [] })).toBe(false)
  })
})

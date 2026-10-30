import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

const read = vi.hoisted(() => ({ data: undefined as unknown, isError: undefined as unknown, mutate: vi.fn(), url: "" }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    read.url = url
    return { data: read.data, isError: read.isError, mutate: read.mutate }
  },
}))
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))

import { ForecastChip } from "./ForecastChip"

pinTestClock()

const forecast = (over: Record<string, unknown> = {}) => ({
  data: {
    project_uuid: "p1",
    state: "forecast",
    date: "2026-11-18",
    optimistic: "2026-11-12",
    pessimistic: "2026-11-27",
    by_pace: "2026-11-18",
    by_links: "2026-11-02",
    open: 12,
    unit: "points",
    per_week: 4.5,
    weeks: 4,
    held_by: [],
    held_count: 0,
    ...over,
  },
})

/**
 * Presses the chip and waits for its card: the card is a chunk of its own, fetched on the chip's first press. Its
 * slot draws the card's lines (a dl among them) while it comes, so the card is in when its words are: every card
 * says its pace.
 */
async function openCard(name: string): Promise<Element> {
  fireEvent.click(screen.getByRole("button", { name }))
  await waitFor(() => expect(document.querySelector("[data-forecast-card]")?.textContent).toContain("Pace"))
  return document.querySelector("[data-forecast-card]")!
}

afterEach(() => {
  cleanup()
  read.data = undefined
  read.isError = undefined
  read.mutate.mockReset()
})

// linear-20: the header's forecast chip, beside the project's health.
describe("the forecast chip", () => {
  it("asks for the project's forecast in the reader's zone, and holds its place while it's read", () => {
    const { container } = render(<ForecastChip projectId="p1" />)
    expect(read.url).toMatch(/^\/project\/p1\/forecast\?tz=/)
    expect(container.querySelector("[data-forecast='loading']")).not.toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("says when a failed read leaves nothing to show, and Try again reads it again; a refusal says nothing", () => {
    read.isError = new Error("down")
    render(<ForecastChip projectId="p1" />)
    fireEvent.click(screen.getByRole("button", { name: /Couldn't load the forecast\. Try again/ }))
    expect(read.mutate).toHaveBeenCalledTimes(1)
    cleanup()
    for (const status of [403, 404]) {
      read.isError = Object.assign(new Error("refused"), { isAxiosError: true, response: { status, data: {} } })
      const { container } = render(<ForecastChip projectId="p1" />)
      expect(container.innerHTML).toBe("")
      cleanup()
    }
  })

  it("says nothing for a project done, or with nothing to go on yet", () => {
    for (const state of ["done", "starting"]) {
      read.data = forecast({ state, date: null, optimistic: null, pessimistic: null })
      const { container } = render(<ForecastChip projectId="p1" />)
      expect(container.innerHTML).toBe("")
      cleanup()
    }
  })

  it("says when the work lands at its pace, and its card the range and the pace", async () => {
    read.data = forecast()
    render(<ForecastChip projectId="p1" />)
    expect(screen.getByRole("button", { name: "Lands ~18 Nov. How it's forecast" }).getAttribute("data-forecast")).toBe("pace")
    const card = await openCard("Lands ~18 Nov. How it's forecast")
    expect(card.textContent).toContain("12 Nov – 27 Nov")
    expect(card.textContent).toContain("4.5 points a week over the last 4 weeks, 12 points open")
    expect(card.textContent).not.toContain("Held up by")
  })

  it("carries the at-risk dot when late work it waits on moves the date, and names that work, each a link to its task", async () => {
    read.data = forecast({
      date: "2026-11-25",
      by_links: "2026-11-25",
      held_by: [
        { task_uuid: "t1", task_name: "Design review", external: false, days_late: 3 },
        { task_uuid: "t2", task_name: "Legal sign-off", external: true, project_name: "Marketing", days_late: 1 },
      ],
      held_count: 2,
    })
    render(<ForecastChip projectId="p1" />)
    const chip = screen.getByRole("button", { name: "Lands ~25 Nov, held up. How it's forecast" })
    expect(chip.getAttribute("data-forecast")).toBe("held")
    await openCard("Lands ~25 Nov, held up. How it's forecast")
    expect(screen.getByRole("link", { name: "Design review, 3 days late" }).getAttribute("href")).toBe("/app/task/t1")
    expect(screen.getByRole("link", { name: "Legal sign-off in Marketing, 1 day late" }).getAttribute("href")).toBe("/app/task/t2")
    expect(document.querySelector("[data-forecast-card]")!.textContent).not.toContain("and more late work")
  })

  it("names the first three late tasks, and says when more hold it up", async () => {
    const late = (n: number) => ({ task_uuid: `t${n}`, task_name: `Late ${n}`, external: false, days_late: 5 - n })
    read.data = forecast({ date: "2026-11-25", by_links: "2026-11-25", held_by: [late(1), late(2), late(3)], held_count: 4 })
    render(<ForecastChip projectId="p1" />)
    await openCard("Lands ~25 Nov, held up. How it's forecast")
    expect(screen.getAllByRole("link")).toHaveLength(3)
    expect(document.querySelector("[data-forecast-card]")!.textContent).toContain("and more late work")
  })

  it("says nothing of more late work when every late task is named", async () => {
    read.data = forecast({
      date: "2026-11-25",
      by_links: "2026-11-25",
      held_by: [{ task_uuid: "t1", task_name: "Design review", external: false, days_late: 3 }],
      held_count: 1,
    })
    render(<ForecastChip projectId="p1" />)
    expect((await openCard("Lands ~25 Nov, held up. How it's forecast")).textContent).not.toContain("and more late work")
  })

  it("says nothing of a very large project's size: its card is the plain card, with every task counted (DB-33, main 29 Oct)", async () => {
    read.data = forecast({ open: 6200, per_week: 150 })
    render(<ForecastChip projectId="p1" />)
    expect((await openCard("Lands ~18 Nov. How it's forecast")).textContent).toContain("150 points a week over the last 4 weeks, 6,200 points open")
    expect(document.querySelector("[data-forecast-cut]")).toBeNull()
    cleanup()
    read.data = forecast()
    render(<ForecastChip projectId="p1" />)
    await openCard("Lands ~18 Nov. How it's forecast")
    expect(document.querySelector("[data-forecast-cut]")).toBeNull()
  })

  it("says in one sentence how many open tasks the date follows, only when the server says it counted some of them (main 29 Oct 15:3x)", async () => {
    read.data = forecast({ open: 10000, unit: "tasks", per_week: 150, open_cut: { total: 10000, counted: 1000 } })
    render(<ForecastChip projectId="p1" />)
    await openCard("Lands ~18 Nov. How it's forecast")
    const cut = document.querySelectorAll("[data-forecast-cut]")
    expect(cut).toHaveLength(1)
    expect(cut[0].textContent).toBe(
      "This project has 10,000 open tasks, so the date follows what 1,000 of them wait on, the soonest due first; its pace and open work count them all.",
    )
    expect(document.querySelector("[data-forecast-card]")!.textContent).toContain("150 tasks a week over the last 4 weeks, 10,000 tasks open")
  })
})

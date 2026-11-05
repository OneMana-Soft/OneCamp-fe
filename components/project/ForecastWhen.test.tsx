import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"
import type { ProjectForecast } from "@/lib/work/forecast"
import { ForecastWhen } from "./ForecastWhen"

pinTestClock()
afterEach(cleanup)

const forecast = (over: Partial<ProjectForecast> = {}): ProjectForecast => ({
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
})

const late = [{ task_uuid: "t1", task_name: "Sign-off", external: false, days_late: 3 }]

describe("a project's forecast in a row that is a link", () => {
  it("says nothing with no forecast: not read yet, out of sight, done, or with nothing to go on yet", () => {
    for (const f of [undefined, forecast({ state: "done", date: null }), forecast({ state: "starting", date: null })]) {
      const { container } = render(<ForecastWhen forecast={f} />)
      expect(container.innerHTML).toBe("")
      cleanup()
    }
  })

  it("says when its open work lands, with nothing to press", () => {
    const { container } = render(<ForecastWhen forecast={forecast()} />)
    const when = container.querySelector("[data-forecast-when]")!
    expect(when.getAttribute("data-forecast-when")).toBe("pace")
    expect(when.textContent).toBe("Lands ~18 Nov")
    expect(container.querySelector("button, a, [tabindex]")).toBeNull()
  })

  it("held up by late work, it says so in words and with the at-risk dot, as the header's chip does", () => {
    const { container } = render(<ForecastWhen forecast={forecast({ held_by: late, held_count: 1, by_links: "2026-11-25", date: "2026-11-25" })} />)
    const when = container.querySelector("[data-forecast-when]")!
    expect(when.getAttribute("data-forecast-when")).toBe("held")
    expect(when.textContent).toBe("Lands ~25 Nov· held up")
    expect(when.children.length).toBe(3)
  })

  it("on a line that is one line (fit), it reads the same words in order, and its title says the whole forecast for a part that gave (V-280)", () => {
    const held = forecast({ held_by: late, held_count: 1, by_links: "2026-11-25", date: "2026-11-25" })
    const { container, rerender } = render(<ForecastWhen forecast={held} fit />)
    let words = container.querySelector("[data-forecast-words]")!
    expect(container.querySelector("[data-forecast-when]")!.textContent).toBe("Lands ~25 Nov · held up")
    expect(words.getAttribute("title")).toBe("Lands ~25 Nov · held up")
    // "held up" is a part of its own (it never gives), after the date that carries the " · " and gives with it.
    expect([...words.children].map((el) => el.textContent)).toEqual(["Lands ", "~25 Nov · ", "held up"])
    rerender(<ForecastWhen forecast={forecast()} fit />)
    words = container.querySelector("[data-forecast-words]")!
    expect(words.getAttribute("title")).toBe("Lands ~18 Nov")
    expect([...words.children].map((el) => el.textContent)).toEqual(["Lands ", "~18 Nov"])
    // Without fit (the chip, the table's cell) the face never gives, so it has no words box.
    rerender(<ForecastWhen forecast={held} />)
    expect(container.querySelector("[data-forecast-words]")).toBeNull()
  })

  it("what follows the forecast on its line (after) comes last, inside a fitted face's words, first in their order (V-280)", () => {
    const held = forecast({ held_by: late, held_count: 1, by_links: "2026-11-25", date: "2026-11-25" })
    const after = <span data-after="">, after the goal&apos;s date</span>
    const { container, rerender } = render(<ForecastWhen forecast={held} fit after={after} />)
    const words = container.querySelector("[data-forecast-words]")!
    expect(container.querySelector("[data-forecast-when]")!.textContent).toBe("Lands ~25 Nov · held up, after the goal's date")
    // In the reversed wrap the first in order is drawn last and never gives, so the words' spare room trails after it.
    const last = words.lastElementChild!
    expect(last.querySelector("[data-after]")).not.toBeNull()
    expect(last.className).toContain("-order-1")
    // Without fit it follows the face, a part of the line like the rest.
    rerender(<ForecastWhen forecast={held} after={after} />)
    expect(container.querySelector("[data-forecast-when]")!.textContent).toBe("Lands ~25 Nov· held up, after the goal's date")
    // Nothing to forecast: nothing follows either.
    rerender(<ForecastWhen forecast={undefined} fit after={after} />)
    expect(container.textContent).toBe("")
  })
})

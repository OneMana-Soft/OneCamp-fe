import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const answer = {
  aggregate: "count",
  group_by: "Item",
  buckets: [
    { label: "Booth", value: 2, count: 2 },
    { label: "Ads", value: 1, count: 1 },
  ],
  matched_rows: 3,
  scanned_rows: 3,
  distinct_groups: 2,
}
const aggregate = vi.hoisted(() => vi.fn())
const query = vi.hoisted(() => vi.fn())
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  aggregateTable: (...a: unknown[]) => aggregate(...a),
  queryRows: (...a: unknown[]) => query(...a),
}))

import { NO_RULES } from "@/lib/tables/viewRules"
import { rulesToSpec } from "@/lib/tables/query"
import { groupLabel } from "@/lib/tables/groups"
import { RulesPart } from "@/components/table/lazyParts"
import { DataTableChart } from "./DataTableChart"

// What the table's page hands the chart: the grid's own query and the grouped list's group names.
const USING = { rulesToSpec, groupLabel }

// In braces: a function beforeEach returns is its teardown, so the mock it returned was called once after every test.
beforeEach(() => {
  aggregate.mockResolvedValue(answer)
})
afterEach(() => {
  cleanup()
  aggregate.mockReset()
  query.mockReset()
  localStorage.clear()
})

describe("a table's chart controls", () => {
  it("are labelled in sentence case, quietly, like the rest of the app's forms", async () => {
    render(
      <DataTableChart
        using={USING}
        tableId="t"
        fields={[{ id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 }]}
        rules={NO_RULES}
      />,
    )
    await waitFor(() => expect(screen.getByText("Group by")).toBeTruthy())
    expect(screen.getByText("Group by").className).not.toMatch(/uppercase/)
    for (const name of ["Chart", "Group by", "Measure"]) expect(screen.getByRole("combobox", { name })).toBeTruthy()
  })

  it("sit in the toolbar row every view of the table has, at its height", async () => {
    render(
      <DataTableChart
        using={USING}
        tableId="t"
        fields={[{ id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 }]}
        rules={NO_RULES}
      />,
    )
    await waitFor(() => expect(screen.getByText("Group by")).toBeTruthy())
    const row = document.querySelector("[data-table-toolbar]") as HTMLElement
    expect(row).not.toBeNull()
    for (const name of ["Chart", "Group by", "Measure"]) {
      const trigger = screen.getByRole("combobox", { name })
      expect(row.contains(trigger)).toBe(true)
      expect(trigger.className).toMatch(/\bh-7\b/)
    }
    // The chart scrolls in the frame, as the grid does, on the sheet with no
    // border of its own (SvgChart draws none by default).
    const body = document.querySelector("[data-table-chart]") as HTMLElement
    expect(body.className).toMatch(/overflow-auto/)
    await waitFor(() => expect(body.querySelector("figure")).toBeTruthy())
    expect(body.querySelector("figure")?.className).not.toMatch(/\bborder\b/)
  })
})

// PTC-15 (QA 14 Oct): an answer with no buckets drew "Nothing to chart yet.
// Add rows to the table" over a table with rows.
describe("a table's chart and its page", () => {
  it("asks for no numbers until the page hands it the grid's query and the group names, and draws its skeleton meanwhile", async () => {
    const fields = [{ id: "item", table_id: "t", name: "Item", type: "text" as const, config: "{}", position: 0 }]
    // The page's rules chunk is in: the chart still waits for what the page hands it.
    await RulesPart.warm()
    const chart = render(<DataTableChart using={null} tableId="t" fields={fields} rules={NO_RULES} />)
    expect(screen.getByRole("status", { name: "Building the chart" })).toBeTruthy()
    expect(aggregate).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
    chart.rerender(<DataTableChart using={USING} tableId="t" fields={fields} rules={NO_RULES} />)
    await waitFor(() => expect(aggregate).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole("img", { name: "Count of rows by Item" })).toBeTruthy()
  })
})

describe("a table's chart that can't be drawn", () => {
  const fields = [{ id: "item", table_id: "t", name: "Item", type: "text" as const, config: "{}", position: 0 }]

  it("says it couldn't be loaded, with Try again, when the answer has no buckets", async () => {
    aggregate.mockResolvedValueOnce({})
    render(<DataTableChart using={USING} tableId="t" fields={fields} rules={NO_RULES} />)
    expect(await screen.findByText("Couldn't load this chart")).toBeTruthy()
    // The shared read-failure state, as every screen's.
    expect(document.querySelector('[data-load-failure="failed"]')).not.toBeNull()
    expect(screen.queryByText(/Nothing to chart yet/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
    await waitFor(() => expect(document.querySelector("[data-table-chart] figure")).toBeTruthy())
  })

  it("says so when the request fails", async () => {
    aggregate.mockRejectedValueOnce(new Error("offline"))
    render(<DataTableChart using={USING} tableId="t" fields={fields} rules={NO_RULES} />)
    expect(await screen.findByText("Couldn't load this chart")).toBeTruthy()
  })
})

// PTC-49 (QA 14 Oct): a chart grouped its rows by the first column, a bar a row.
describe("a table's chart at first", () => {
  it("groups by the first select, person or date column", async () => {
    const fields = [
      { id: "item", table_id: "t", name: "Item", type: "text" as const, config: "{}", position: 0 },
      { id: "cost", table_id: "t", name: "Cost", type: "number" as const, config: "{}", position: 1 },
      { id: "stage", table_id: "t", name: "Stage", type: "select" as const, config: "{}", position: 2 },
    ]
    render(<DataTableChart using={USING} tableId="t2" fields={fields} rules={NO_RULES} />)
    // OWN_ERRORS: the chart says a failed read in its own card.
    await waitFor(() => expect(aggregate).toHaveBeenCalledWith("t2", expect.objectContaining({ group_by: "stage", aggregate: "count" }), expect.anything()))
  })
})

// TABLES-BOARDS-11 (UX-TB-H3): the chart's numbers are the view's. It asked
// /aggregate for every row and kept its choices in this browser, so a view
// filtered to Q4 charted every quarter, and each reader saw their own chart.
describe("a table's chart in a view", () => {
  const ITEM = { id: "item", table_id: "t", name: "Item", type: "text" as const, config: "{}", position: 0 }
  const AMOUNT = { id: "amount", table_id: "t", name: "Amount", type: "number" as const, config: "{}", position: 1 }
  const STAGE = { id: "stage", table_id: "t", name: "Stage", type: "select" as const, config: JSON.stringify({ options: [{ id: "o1", label: "Q3" }, { id: "o2", label: "Q4" }] }), position: 2 }
  const OWNER = { id: "owner", table_id: "t", name: "Owner", type: "people" as const, config: "{}", position: 3 }
  const fields = [ITEM, AMOUNT, STAGE, OWNER]
  const INDEXED = { indexed: true, sorts_text: true }
  const Q4 = { sort: [], filters: [{ field: "stage", op: "is" as const, value: "Q4" }], match: "all" as const }
  const NONE = { sort: [], filters: [], match: "all" as const }

  it("asks the grid's query with the view's filter, grouped by its field, and draws each group", async () => {
    query.mockResolvedValue({ rows: [], total: 3, groups: [{ key: ["Q4"], count: 3 }] })
    render(<DataTableChart using={USING} tableId="t" fields={fields} rules={Q4} answers={INDEXED} look={null} onLook={vi.fn()} />)
    await waitFor(() => expect(document.querySelector("[data-table-chart] figure")).toBeTruthy())
    expect(query).toHaveBeenCalledWith("t", {
      spec: { filter: { op: "and", filters: [{ field: "field:stage", operator: "is", values: [{ text: "Q4" }] }] }, groups: [{ field: "field:stage" }] },
      n: 1,
      count: true,
    }, expect.anything())
    expect(aggregate).not.toHaveBeenCalled()
    // It says what it counts, over what: its caption, and its picture's name.
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Count of rows by Stage")
  })

  // UX-TB-H3 (moved from SvgChart.test.tsx in the cut): the chart's own layer writes each bar's value over it, for the eye
  // (the bar's name says it to a screen reader), where a band holds it; a line has none. jsdom draws no boxes: a bar's is stubbed.
  it("writes each bar's value over it, where its band holds it, and none on a line", async () => {
    Object.defineProperty(SVGElement.prototype, "getBBox", { configurable: true, value: () => ({ x: 0, y: 40, width: 20, height: 100 }) })
    try {
      query.mockResolvedValue({ rows: [], total: 8, groups: [{ key: ["Q3"], count: 3 }, { key: ["Q4"], count: 5 }] })
      const look = { type: "bar" as const, groupBy: "stage", op: "count" as const, valueField: "amount" }
      const bars = render(<DataTableChart using={USING} tableId="t" fields={fields} rules={Q4} answers={INDEXED} look={look} onLook={vi.fn()} />)
      await waitFor(() => expect(document.querySelectorAll("[data-table-chart] svg text[data-bar-value]")).toHaveLength(2))
      const marks = [...document.querySelectorAll("[data-table-chart] svg text[data-bar-value]")]
      expect(marks.map((t) => t.textContent)).toEqual(["3", "5"])
      expect(marks.map((t) => t.getAttribute("y"))).toEqual(["34", "34"])
      expect(marks[0].getAttribute("aria-hidden")).toBe("true")
      bars.unmount()
      // Thirty bands are too narrow for a number each: none is written.
      query.mockResolvedValue({ rows: [], total: 30, groups: Array.from({ length: 30 }, (_, i) => ({ key: [`G${i}`], count: i + 1 })) })
      const narrow = render(<DataTableChart using={USING} tableId="t" fields={fields} rules={Q4} answers={INDEXED} look={look} onLook={vi.fn()} />)
      await waitFor(() => expect(document.querySelectorAll("[data-table-chart] svg path[data-bar]")).toHaveLength(30))
      expect(document.querySelector("text[data-bar-value]")).toBeNull()
      narrow.unmount()
      query.mockResolvedValue({ rows: [], total: 8, groups: [{ key: ["Q3"], count: 3 }, { key: ["Q4"], count: 5 }] })
      render(<DataTableChart using={USING} tableId="t" fields={fields} rules={Q4} answers={INDEXED} look={{ ...look, type: "line" }} onLook={vi.fn()} />)
      await waitFor(() => expect(document.querySelector("[data-table-chart] figure svg")).toBeTruthy())
      expect(document.querySelector("text[data-bar-value]")).toBeNull()
    } finally {
      delete (SVGElement.prototype as { getBBox?: unknown }).getBBox
    }
  })

  // DB-136 F1: on a chart's first reveal its bars grow from the baseline (SvgChart's chart-bar-grow, each after its stagger),
  // and each value lands with its own bar: there but unseen (opacity 0) while that bar grows, shown once it has; under reduced
  // motion the bars are drawn at their size, and the values with them. jsdom runs no animation: each bar's grow is a stub
  // the test ends by hand, and a bar grows only while it has the class SvgChart gives a growing bar.
  it("shows each bar's value once its bar has grown in, and at once under reduced motion", async () => {
    type Grow = { animationName: string; playState: AnimationPlayState; finished: Promise<void>; land: () => void }
    const grows = new Map<Element, Grow>()
    const motion = (reduce: boolean) =>
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: (media: string) => ({ media, matches: reduce && media.includes("reduce"), onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }),
      })
    Object.defineProperty(SVGElement.prototype, "getBBox", { configurable: true, value: () => ({ x: 0, y: 40, width: 20, height: 100 }) })
    Object.defineProperty(Element.prototype, "getAnimations", {
      configurable: true,
      value(this: Element) {
        if (!this.classList.contains("chart-bar-grow")) return []
        let grow = grows.get(this)
        if (!grow) {
          let land = () => {}
          const finished = new Promise<void>((r) => (land = r))
          const made: Grow = {
            animationName: "chart-bar-grow",
            playState: "running",
            finished,
            land: () => {
              made.playState = "finished"
              land()
            },
          }
          grows.set(this, (grow = made))
        }
        // As a browser's: a grow that has run stays listed (it holds the bar's size), as finished.
        return [grow]
      },
    })
    const marks = () => [...document.querySelectorAll<SVGTextElement>("[data-table-chart] svg text[data-bar-value]")]
    const seen = () => marks().map((t) => t.style.opacity !== "0")
    const bars = () => [...document.querySelectorAll("[data-table-chart] svg path[data-bar]")]
    try {
      motion(false)
      query.mockResolvedValue({ rows: [], total: 8, groups: [{ key: ["Q3"], count: 3 }, { key: ["Q4"], count: 5 }] })
      const look = { type: "bar" as const, groupBy: "stage", op: "count" as const, valueField: "amount" }
      const first = render(<DataTableChart using={USING} tableId="t" fields={fields} rules={Q4} answers={INDEXED} look={look} onLook={vi.fn()} />)
      await waitFor(() => expect(bars().filter((b) => b.classList.contains("chart-bar-grow"))).toHaveLength(2))
      await waitFor(() => expect(marks().map((t) => t.textContent)).toEqual(["3", "5"]))
      // Both bars still growing: both values are written, and neither is seen.
      await waitFor(() => expect(seen()).toEqual([false, false]))
      // The first bar lands (the second, a stagger later, still grows): its value only.
      grows.get(bars()[0])!.land()
      await waitFor(() => expect(seen()).toEqual([true, false]))
      grows.get(bars()[1])!.land()
      await waitFor(() => expect(seen()).toEqual([true, true]))
      first.unmount()
      // Under reduced motion the bars don't grow, and their values are there at once.
      motion(true)
      render(<DataTableChart using={USING} tableId="t" fields={fields} rules={Q4} answers={INDEXED} look={look} onLook={vi.fn()} />)
      await waitFor(() => expect(marks()).toHaveLength(2))
      expect(bars().filter((b) => b.classList.contains("chart-bar-grow"))).toHaveLength(0)
      expect(seen()).toEqual([true, true])
    } finally {
      delete (SVGElement.prototype as { getBBox?: unknown }).getBBox
      Reflect.deleteProperty(Element.prototype, "getAnimations")
      Reflect.deleteProperty(window, "matchMedia")
    }
  })

  // CR-252 F2: a new filter on the open chart is a new question: it asks again, with that filter, and draws the new answer.
  it("asks again with the view's new filter while it is open, and draws the new numbers in place of the old", async () => {
    const names = () => [...document.querySelectorAll("[data-table-chart] svg path[data-bar]")].map((b) => b.getAttribute("aria-label"))
    query.mockResolvedValueOnce({ rows: [], total: 3, groups: [{ key: ["Q4"], count: 3 }] })
    const chart = render(<DataTableChart using={USING} tableId="t" fields={fields} rules={Q4} answers={INDEXED} look={null} onLook={vi.fn()} />)
    await waitFor(() => expect(names()).toEqual(["Count of rows · Q4: 3"]))
    const Q3 = { ...Q4, filters: [{ field: "stage", op: "is" as const, value: "Q3" }] }
    query.mockResolvedValueOnce({ rows: [], total: 2, groups: [{ key: ["Q3"], count: 2 }] })
    chart.rerender(<DataTableChart using={USING} tableId="t" fields={fields} rules={Q3} answers={INDEXED} look={null} onLook={vi.fn()} />)
    await waitFor(() => expect(names()).toEqual(["Count of rows · Q3: 2"]))
    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[1][1]).toEqual({
      spec: { filter: { op: "and", filters: [{ field: "field:stage", operator: "is", values: [{ text: "Q3" }] }] }, groups: [{ field: "field:stage" }] },
      n: 1,
      count: true,
    })
  })

  it("keeps its choices with the view, not in this browser", async () => {
    query.mockResolvedValue({ rows: [], total: 3, groups: [{ key: ["Q4"], count: 3, summaries: { "field:amount": { sum: 4200 } } }] })
    const onLook = vi.fn()
    render(<DataTableChart using={USING} tableId="t" fields={fields} rules={Q4} answers={INDEXED} look={{ type: "bar", groupBy: "stage", op: "sum", valueField: "amount" }} onLook={onLook} />)
    await waitFor(() => expect(query).toHaveBeenCalled())
    expect(query.mock.calls[0][1].spec.summaries).toEqual([{ field: "field:amount", fns: ["sum"] }])
    fireEvent.click(screen.getByRole("combobox", { name: "Chart" }))
    fireEvent.click(await screen.findByRole("option", { name: "Pie" }))
    expect(onLook).toHaveBeenLastCalledWith({ type: "pie", groupBy: "stage", op: "sum", valueField: "amount" })
    expect(localStorage.getItem("onecamp:tableChart:t")).toBeNull()
  })

  it("moves a look this browser kept into the view, once, and forgets it", async () => {
    query.mockResolvedValue({ rows: [], total: 0, groups: [] })
    localStorage.setItem("onecamp:tableChart:t", JSON.stringify({ chartType: "line", groupBy: "stage", op: "max", valueField: "amount" }))
    const onLook = vi.fn()
    render(<DataTableChart using={USING} tableId="t" fields={fields} rules={NONE} answers={INDEXED} look={null} onLook={onLook} />)
    await waitFor(() => expect(onLook).toHaveBeenCalledWith({ type: "line", groupBy: "stage", op: "max", valueField: "amount" }))
    expect(localStorage.getItem("onecamp:tableChart:t")).toBeNull()
  })

  it("says it shows every row when the view's filter can't go to a chart, and reads every row", async () => {
    aggregate.mockResolvedValue(answer)
    render(<DataTableChart using={USING} tableId="t" fields={fields} rules={Q4} answers={INDEXED} look={{ type: "bar", groupBy: "owner", op: "count", valueField: "amount" }} onLook={vi.fn()} />)
    expect(await screen.findByText("Showing every row: this view's filters can't apply to a chart yet.")).toBeTruthy()
    expect(aggregate).toHaveBeenCalledWith("t", expect.objectContaining({ group_by: "owner", aggregate: "count" }), expect.anything())
    expect(query).not.toHaveBeenCalled()
  })

  it("says no rows match the view's filters when none do, with Clear filters", async () => {
    query.mockResolvedValue({ rows: [], total: 0, groups: [] })
    const onClear = vi.fn()
    render(<DataTableChart using={USING} tableId="t" fields={fields} rules={Q4} answers={INDEXED} look={null} onLook={vi.fn()} onClear={onClear} />)
    // The table views' one "no match" state (TableViewState no-match), as the board's and the calendar's.
    expect(await screen.findByText("No rows match these filters")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it("keeps the last numbers while offline, and says so", async () => {
    query.mockResolvedValueOnce({ rows: [], total: 3, groups: [{ key: ["Q4"], count: 3 }] })
    const view = render(<DataTableChart using={USING} tableId="t" fields={fields} rules={Q4} answers={INDEXED} look={null} onLook={vi.fn()} />)
    await waitFor(() => expect(document.querySelector("[data-table-chart] figure")).toBeTruthy())
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    query.mockRejectedValueOnce(new Error("Network Error"))
    view.rerender(<DataTableChart using={USING} tableId="t" fields={fields} rules={Q4} answers={INDEXED} look={null} onLook={vi.fn()} total={4} />)
    expect(await screen.findByText("Offline · showing the last numbers")).toBeTruthy()
    expect(document.querySelector("[data-table-chart] figure")).toBeTruthy()
    online.mockRestore()
  })

  it("says it couldn't load, with Try again, when it goes offline with nothing drawn yet", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    query.mockRejectedValueOnce(new Error("Network Error"))
    render(<DataTableChart using={USING} tableId="t" fields={fields} rules={Q4} answers={INDEXED} look={null} onLook={vi.fn()} />)
    expect(await screen.findByText("Couldn't load this chart")).toBeTruthy()
    expect(screen.queryByText("Offline · showing the last numbers")).toBeNull()
    online.mockRestore()
  })

  it("says the server's own words when it won't group the view's rows that way", async () => {
    const why = "Grouped this way, the rows fall into more than 1,000 groups: group by a field with fewer values, or a date by a longer period"
    query.mockRejectedValueOnce(Object.assign(new Error("Request failed with status code 422"), { response: { status: 422, data: { msg: why } } }))
    render(<DataTableChart using={USING} tableId="t" fields={fields} rules={Q4} answers={INDEXED} look={null} onLook={vi.fn()} />)
    expect(await screen.findByText(why)).toBeTruthy()
    expect(screen.queryByText("Couldn't load this chart")).toBeNull()
  })

  it("says a count that came without its groups (past the server's budget) is no answer, with Try again", async () => {
    query.mockResolvedValueOnce({ rows: [], total: 5 })
    render(<DataTableChart using={USING} tableId="t" fields={fields} rules={Q4} answers={INDEXED} look={null} onLook={vi.fn()} />)
    expect(await screen.findByText(/take too long to count right now/)).toBeTruthy()
    expect(screen.queryByText(/No rows match/)).toBeNull()
    query.mockResolvedValueOnce({ rows: [], total: 5, groups: [{ key: ["Q4"], count: 5 }] })
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
    await waitFor(() => expect(document.querySelector("[data-table-chart] figure")).toBeTruthy())
  })

  it("draws the look the view keeps now, never a choice made before another view was applied", async () => {
    query.mockResolvedValue({ rows: [], total: 3, groups: [{ key: ["Q4"], count: 3 }] })
    const view = render(<DataTableChart using={USING} tableId="t" fields={fields} rules={Q4} answers={INDEXED} look={null} onLook={vi.fn()} />)
    fireEvent.click(screen.getByRole("combobox", { name: "Chart" }))
    fireEvent.click(await screen.findByRole("option", { name: "Pie" }))
    // The page keeps the look (onLook) and hands it back; a view applied with none hands back null: the first field, as a bar.
    view.rerender(<DataTableChart using={USING} tableId="t" fields={fields} rules={Q4} answers={INDEXED} look={null} onLook={vi.fn()} />)
    expect(screen.getByRole("combobox", { name: "Chart" }).textContent).toMatch(/Bar/)
  })

  it("takes a finger's 44px on each of its choices, though drawn at the toolbar's height", async () => {
    query.mockResolvedValue({ rows: [], total: 3, groups: [{ key: ["Q4"], count: 3 }] })
    render(<DataTableChart using={USING} tableId="t" fields={fields} rules={Q4} answers={INDEXED} look={{ type: "bar", groupBy: "stage", op: "sum", valueField: "amount" }} onLook={vi.fn()} />)
    // app/phone.css F3: a control with data-touch-target takes a tap across 44px under a finger.
    for (const name of ["Chart", "Group by", "Measure", "Of field"]) expect(screen.getByRole("combobox", { name }).hasAttribute("data-touch-target")).toBe(true)
  })
})

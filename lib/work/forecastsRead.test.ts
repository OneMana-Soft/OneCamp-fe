import { describe, expect, it } from "vitest"
import { FORECASTS_PAGE, forecastsPaths } from "@/lib/work/forecastsRead"

describe("the reads of many projects' forecasts", () => {
  const id = (n: number) => `0000000${n}`.slice(-8) + "-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

  it("asks nothing with no projects", () => {
    expect(forecastsPaths([], "Asia/Kolkata")).toEqual([])
  })

  it("asks once for a list, each project once, in lower case and id order, so a new sort asks the same", () => {
    const paths = forecastsPaths(["B-2", "a-1", "b-2", "c-3"], "Asia/Kolkata")
    expect(paths).toEqual(["/project/forecasts?ids=a-1,b-2,c-3&tz=Asia%2FKolkata"])
    expect(forecastsPaths(["c-3", "B-2", "a-1"], "Asia/Kolkata")).toEqual(paths)
  })

  it("reads more than the server takes at once in pages, leaving no project out", () => {
    const ids = Array.from({ length: 2 * FORECASTS_PAGE + 50 }, (_, n) => id(n))
    const paths = forecastsPaths([...ids].reverse(), "UTC")
    const asked = paths.map((p) => new URL(p, "http://x").searchParams.get("ids")!.split(","))
    expect(asked.map((page) => page.length)).toEqual([FORECASTS_PAGE, FORECASTS_PAGE, 50])
    expect(asked.flat()).toEqual(ids)
    expect(paths.every((p) => p.endsWith("&tz=UTC"))).toBe(true)
  })
})

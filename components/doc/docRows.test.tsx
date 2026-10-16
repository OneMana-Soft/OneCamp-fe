import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { Marked, pathLabel, titleOf, whenOf } from "./docRows"

afterEach(cleanup)

describe("a doc as a row", () => {
  it("names the pages above it, and a page the viewer can't open as …, never by name (I12)", () => {
    expect(pathLabel([{ doc_uuid: "a", doc_title: "Engineering" }, { doc_uuid: "b", doc_title: "RFCs" }])).toBe("Engineering › RFCs")
    expect(pathLabel([{ redacted: true }, { doc_uuid: "b", doc_title: "" }])).toBe("… › Untitled")
    expect(pathLabel(undefined)).toBe("")
  })

  it("shows a doc nobody named by its placeholder (D-6)", () => {
    expect(titleOf("  ")).toBe("Untitled")
    expect(titleOf("Launch plan")).toBe("Launch plan")
  })

  it("says when it changed, or when it was opened on Recent", () => {
    const hour = new Date(Date.now() - 3600_000).toISOString()
    expect(whenOf({ doc_updated_at: hour }).short).toBe("1h ago")
    expect(whenOf({ doc_updated_at: "", viewed_at: hour }, "viewed").short).toBe("1h ago")
    expect(whenOf({}).short).toBe("")
  })

  it("marks the words a search found as text, never as the passage's HTML", () => {
    const { container } = render(<Marked passage={'we <mark>launch</mark> on <img src=x onerror="alert(1)"> Tuesday'} />)
    expect(container.querySelectorAll("mark")).toHaveLength(1)
    expect(container.querySelector("mark")?.textContent).toBe("launch")
    expect(container.querySelector("img")).toBeNull()
  })
})

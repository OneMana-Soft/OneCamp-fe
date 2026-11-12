import { afterEach, describe, expect, it, vi } from "vitest"
import { printHost, printTitled } from "./print"

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("printing under a title", () => {
  it("names the PDF after the title, gives the page's title back, and calls done once the dialog closes", () => {
    vi.useFakeTimers()
    document.title = "OneCamp"
    let during = ""
    vi.spyOn(window, "print").mockImplementation(() => {
      during = document.title
    })
    const done = vi.fn()
    printTitled("Launch retro", done)
    expect(during).toBe("Launch retro")
    window.dispatchEvent(new Event("afterprint"))
    expect(document.title).toBe("OneCamp")
    expect(done).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it("gives the title back a moment after print() returns where no afterprint comes, but leaves what was printed until it does", () => {
    // iOS Safari's print() can return before its dialog has drawn the page.
    vi.useFakeTimers()
    document.title = "OneCamp"
    vi.spyOn(window, "print").mockImplementation(() => {})
    const done = vi.fn()
    printTitled("Launch retro", done)
    vi.advanceTimersByTime(1500)
    expect(document.title).toBe("OneCamp")
    expect(done).not.toHaveBeenCalled()
    window.dispatchEvent(new Event("afterprint"))
    expect(done).toHaveBeenCalledTimes(1)
  })
})

const fillWith = (text: string) => (host: HTMLElement) => void host.appendChild(document.createElement("p")).append(text)

describe("printing a host of its own", () => {
  afterEach(() => document.querySelectorAll("[data-demo-print], style[data-demo-print-style]").forEach((n) => n.remove()))

  it("prints what it was given alone, under the title, with its style only while printing, and takes both away when the dialog closes", () => {
    let seen = ""
    let title = ""
    vi.spyOn(window, "print").mockImplementation(() => {
      seen = document.querySelector("[data-demo-print]")?.textContent ?? ""
      title = document.title
    })
    printHost("demo", fillWith("Page one"), "[data-demo-print] p{color:red}", "Launch retro")
    expect(seen).toBe("Page one")
    expect(title).toBe("Launch retro")
    expect(document.querySelector("[data-demo-print]")?.parentElement).toBe(document.body)
    expect(document.querySelector("style[data-demo-print-style]")?.textContent).toBe(
      "@media screen{[data-demo-print]{display:none}}@media print{@page{margin:12mm}html,body{background:#fff!important}body>*:not([data-demo-print]){display:none!important}[data-demo-print]{color-scheme:light}[data-demo-print] thead{display:table-header-group}[data-demo-print] tr{break-inside:avoid}[data-demo-print] p{color:red}}",
    )
    window.dispatchEvent(new Event("afterprint"))
    expect(document.querySelector("[data-demo-print]")).toBeNull()
    expect(document.querySelector("style[data-demo-print-style]")).toBeNull()
  })

  it("keeps a print until its dialog says it closed, and the next print of that name takes it away", () => {
    // iOS Safari's print() can return before its dialog draws the page.
    vi.spyOn(window, "print").mockImplementation(() => {})
    printHost("demo", fillWith("First"), "", "One")
    expect(document.querySelectorAll("[data-demo-print]")).toHaveLength(1)
    printHost("demo", fillWith("Second"), "", "Two")
    expect(Array.from(document.querySelectorAll("[data-demo-print]")).map((n) => n.textContent)).toEqual(["Second"])
    expect(document.querySelectorAll("style[data-demo-print-style]")).toHaveLength(1)
  })
})

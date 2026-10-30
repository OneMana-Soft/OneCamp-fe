import { describe, expect, it } from "vitest"
import { FILE_KIND_HUE, fileKind, fileTypeHue, splitForMiddle, type FileKind } from "./fileTypeHue"

// Design v3 chat, C24: a file card's tile is in its kind's hue.
describe("a file's kind and hue", () => {
  const cases: [string, string | undefined, FileKind][] = [
    ["Q4 plan.pdf", "application/pdf", "pdf"],
    ["budget.xlsx", undefined, "sheet"],
    ["export.csv", "text/csv", "sheet"],
    ["notes.docx", undefined, "doc"],
    ["readme", "text/markdown", "doc"],
    ["deck.pptx", undefined, "slides"],
    ["talk.key", undefined, "slides"],
    ["build.zip", "application/zip", "archive"],
    ["logs.tar.gz", undefined, "archive"],
    ["main.go", undefined, "code"],
    ["data", "application/json", "code"],
    ["mystery.bin", "application/octet-stream", "other"],
    ["", undefined, "other"],
  ]
  it.each(cases)("%s (%s) is %s", (name, mime, kind) => {
    expect(fileKind(name, mime)).toBe(kind)
  })

  it("gives every kind but other its own hue, as the spec names them", () => {
    expect(FILE_KIND_HUE).toEqual({ pdf: "berry", sheet: "moss", doc: "sky", slides: "sun", archive: "dusk", code: "lake" })
    expect(new Set(Object.values(FILE_KIND_HUE)).size).toBe(6)
    expect(fileTypeHue("x.bin")).toBeNull()
    expect(fileTypeHue("x.pdf")).toBe("berry")
  })

  it("splits a long name so its start truncates and its extension stays", () => {
    expect(splitForMiddle("staging-logs-from-last-night")).toEqual(["staging-logs-from-last", "-night"])
    expect(splitForMiddle("short.pdf")).toEqual(["short.pdf", ""])
    expect(splitForMiddle("IMG_0001.jpg")).toEqual(["IMG_0001.jpg", ""])
    // A table's file chip keeps a short name's type too.
    expect(splitForMiddle("Logo.png", true)).toEqual(["Logo", ".png"])
    expect(splitForMiddle("README", true)).toEqual(["README", ""])
  })

  // DESIGN-BUILD-5, 22 Oct: "q4-launch-checkou…inal.png" read as a cut word.
  it("keeps the last word before the extension whole when it's 4 to 10 letters", () => {
    expect(splitForMiddle("q4-launch-checkout-flow-screenshot-final.png")).toEqual(["q4-launch-checkout-flow-screenshot-", "final.png"])
    expect(splitForMiddle("screenshot_20261022_153045.png")).toEqual(["screenshot_20261022_", "153045.png"])
    expect(splitForMiddle("my.report.final.pdf")).toEqual(["my.report.", "final.pdf"])
    // A space goes with the tail, which keeps it: the truncating head would drop it.
    expect(splitForMiddle("OneCamp brand guidelines, final for the agency.pdf")).toEqual(["OneCamp brand guidelines, final for the", " agency.pdf"])
    expect(splitForMiddle("Load test results.xlsx")).toEqual(["Load test", " results.xlsx"])
    // A long name is cut by the same rule, with keepExtension or without.
    expect(splitForMiddle("Load test results.xlsx", true)).toEqual(["Load test", " results.xlsx"])
    // A shorter last word takes the one before it along.
    expect(splitForMiddle("report-2026-10-22.pdf")).toEqual(["report-2026-", "10-22.pdf"])
    // A longer one keeps its last 4 letters.
    expect(splitForMiddle("Quarterly_reconciliation.xlsx")).toEqual(["Quarterly_reconcilia", "tion.xlsx"])
  })
})

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
    expect(splitForMiddle("OneCamp brand guidelines, final for the agency.pdf")).toEqual(["OneCamp brand guidelines, final for the ag", "ency.pdf"])
    expect(splitForMiddle("Load test results.xlsx")).toEqual(["Load test res", "ults.xlsx"])
    expect(splitForMiddle("staging-logs-from-last-night")).toEqual(["staging-logs-from-last", "-night"])
    expect(splitForMiddle("short.pdf")).toEqual(["short.pdf", ""])
  })
})

import { readdirSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "./sourceFiles"

describe("sourceFiles: the guards' one walk over the source", () => {
  it("gives repo paths of what ships under each root, a folder or a file, with no tests or specs", () => {
    const ui = sourceFiles(["components/ui"], /\.tsx$/)
    expect(ui).toContain("components/ui/button.tsx")
    expect(ui.filter((f) => /\.(test|spec)\./.test(f))).toEqual([])
    expect(ui.every((f) => f.startsWith("components/ui/") && f.endsWith(".tsx"))).toBe(true)
    expect(sourceFiles(["components/ui/button.tsx"], /\.tsx$/)).toEqual(["components/ui/button.tsx"])
    expect(sourceFiles(["app", "components"], /\.css$/)).toContain("app/globals.css")
  })

  it("passes over node_modules, dot folders and test-results", () => {
    expect(sourceFiles(["."], /\.tsx$/).filter((f) => /(^|\/)(node_modules|\.next|test-results|\.git)\//.test(f))).toEqual([])
  })

  it("throws on a root that isn't there, so a guard's misspelt folder can't pass empty", () => {
    expect(() => sourceFiles(["components/no-such-folder"], /\.tsx$/)).toThrow()
  })

  it("is the only walk the app's guards keep", () => {
    const own = readdirSync("app")
      .filter((n) => /\.test\.tsx?$/.test(n))
      .filter((n) => /\bfunction files\(|\bconst files = \(/.test(readFileSync(`app/${n}`, "utf8")))
    expect(own, "walk with lib/testing/sourceFiles").toEqual([])
  })
})

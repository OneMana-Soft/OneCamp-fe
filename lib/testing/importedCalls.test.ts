import { describe, expect, it } from "vitest"
import { importedCalls, lineOf, parseSource, specPath } from "@/lib/testing/importedCalls"

// The one finder the guards share for "each call of this export" (CR-311 F2):
// every way a file can name the export, and the loader followed when it's
// passed by name.

const calls = (file: string, lines: string[], module: string, name: string) => {
  const sf = parseSource(file, lines.join("\n"))
  return importedCalls(sf, module, name).map((c) => `${lineOf(sf, c.call)} ${c.loaderName ?? "-"} ${c.loader ? c.loader.getText(sf).slice(0, 16) : "none"}`)
}

describe("the calls of a module's export", () => {
  it("finds a default export under any name: a default import, { default as }, and * as", () => {
    expect(
      calls(
        "app/a.tsx",
        [
          `import dynamic from "next/dynamic"`,
          `import { default as dyn } from "next/dynamic"`,
          `import * as next from "next/dynamic"`,
          `const A = dynamic(() => import("./a"))`,
          `const B = dyn(() => import("./b"))`,
          `const C = next.default(() => import("./c"))`,
          `const D = next.other(() => import("./d"))`,
          `const E = notDynamic(() => import("./e"))`,
        ],
        "next/dynamic",
        "default",
      ),
    ).toEqual(['app/a.tsx:4 - () => import("./', 'app/a.tsx:5 - () => import("./', 'app/a.tsx:6 - () => import("./'])
  })

  it("finds a named export by an alias and by a relative path, and follows a loader passed by name", () => {
    expect(
      calls(
        "lib/lazy/x.tsx",
        [
          `import { lazyDialog as dialog } from "./lazyDialog"`,
          `const load = () => import("@/components/dialog/confirmAlertDialog")`,
          `function loadOther() { return import("./other") }`,
          `const A = dialog(load, "a")`,
          `const B = dialog(loadOther, "b")`,
          `const C = dialog(missing, "c")`,
        ],
        "lib/lazy/lazyDialog",
        "lazyDialog",
      ),
    ).toEqual(['lib/lazy/x.tsx:4 load () => import("@/', "lib/lazy/x.tsx:5 loadOther function loadOth", "lib/lazy/x.tsx:6 missing none"])
  })

  it("passes over a type-only import and a file that doesn't import the module", () => {
    expect(calls("a.ts", [`import type dynamic from "next/dynamic"`, `dynamic(() => 1)`], "next/dynamic", "default")).toEqual([])
    expect(calls("a.ts", [`const dynamic = (f: unknown) => f`, `dynamic(() => 1)`], "next/dynamic", "default")).toEqual([])
  })

  it("names a specifier as a repo path, from the root or from the importer, with no ending", () => {
    expect(specPath("components/b.tsx", "./dialog/confirmAlertDialog.tsx")).toBe("components/dialog/confirmAlertDialog")
    expect(specPath("app/a/page.tsx", "@/components/dialog/confirmAlertDialog")).toBe("components/dialog/confirmAlertDialog")
    expect(specPath("lib/lazy/x.ts", "../lazy/lazyDialog")).toBe("lib/lazy/lazyDialog")
    expect(specPath("app/a.tsx", "next/dynamic")).toBe("next/dynamic")
  })
})

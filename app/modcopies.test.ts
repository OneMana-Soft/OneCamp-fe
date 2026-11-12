import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, it } from "vitest"
import { copiesDiff, moduleCopies } from "../scripts/fluidity/modcopies.mjs"

// Turbopack writes a factory it scope-hoisted several modules into once, under all their ids, "967471,218059,e=>{…}",
// each module's exports registered under its own id. A count that read one id per factory credited it to 218059
// alone (V-926, 11 Nov 2026: "GroupHeaderItem 967471 0 -> 3 copies" when its copies never changed, hiding the real
// regroup), so each module a merged factory makes is a copy of its own, and the tool says "merged". Built in a
// folder of its own.
const dir = mkdtempSync(path.join(tmpdir(), "modcopies-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** A factory making one module, or several merged: each export under its id once merged. */
const factory = (ids: number | number[]) => {
  const all = [ids].flat()
  const own = all.length > 1
  return `${all.join(",")},e=>{"use strict";${all.map((id) => `let m=()=>"module ${id}";e.s(["M${id}",0,m]${own ? `,${id}` : ""})`).join(";")}}`
}
/** A Turbopack chunk: its script, then its factories. */
const chunk = (...factories: (number | number[])[]) =>
  `(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,${factories.map(factory).join(",")}]);`
const build = (name: string, chunks: Record<string, string>) => {
  const next = path.join(dir, name)
  mkdirSync(path.join(next, "static/chunks"), { recursive: true })
  for (const [file, text] of Object.entries(chunks)) writeFileSync(path.join(next, "static/chunks", file), text)
  return next
}

// Before: the group header (967471) is hoisted into the grouping helper (218059) in each of three chunks. After:
// the two are apart in the same three chunks, and the rules module (555555) is cut into five chunks where it was one.
const before = build("before", {
  "g1.js": chunk([967471, 218059], 111111),
  "g2.js": chunk([967471, 218059]),
  "g3.js": chunk([967471, 218059]),
  "r1.js": chunk(555555),
})
const after = build("after", {
  "g1.js": chunk(967471, 218059, 111111),
  "g2.js": chunk(967471, 218059),
  "g3.js": chunk(967471, 218059),
  ...Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`r${n}.js`, chunk(555555)])),
})

describe("a build's module copies", () => {
  const copies = moduleCopies(before)

  it("count each module a merged factory makes as a copy of its own, with the modules it shares it with", () => {
    expect(copies.get("967471")?.copies.map((c) => [c.chunk, c.with])).toEqual([
      ["g1.js", ["218059"]],
      ["g2.js", ["218059"]],
      ["g3.js", ["218059"]],
    ])
    expect(copies.get("218059")?.copies).toHaveLength(3)
  })

  it("give each module its own part of a merged factory's bytes, never the whole to each", () => {
    const text = chunk([967471, 218059])
    const merged = Buffer.byteLength(text.slice(text.indexOf("967471,")))
    const [a, b] = ["967471", "218059"].map((id) => copies.get(id)?.copies.find((c) => c.chunk === "g2.js")?.bytes ?? 0)
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(0)
    expect(a + b).toBe(merged)
  })
})

describe("the change between two builds", () => {
  const diff = copiesDiff(before, after)

  it("reads a hoist as a hoist: the same copies, merged in one build, never a regroup or a module from nothing", () => {
    expect([...diff.hoists].sort()).toEqual(["218059", "967471"])
    const row = diff.rows.find((r) => r.id === "967471")
    expect(row?.before).toMatchObject({ copies: 3, merged: ["218059"] })
    expect(row?.after).toMatchObject({ copies: 3, merged: null })
  })

  it("reads the real regroup: a module both builds have that gains copies", () => {
    expect(diff.regroup).toEqual(["555555"])
    expect(diff.rows[0]).toMatchObject({ id: "555555", before: { copies: 1 }, after: { copies: 5 } })
  })
})

describe("the command", () => {
  const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/fluidity/modcopies.mjs")
  it("prints the merged factories, the regroups and the hoists, then the modules that moved, saying merged", () => {
    const out = execFileSync(process.execPath, [tool, before, after], { encoding: "utf8" }).trim().split("\n")
    expect(out[0]).toBe("modules 4 -> 4 (new 0, gone 0); merged factories 3 -> 0, making 2 -> 0 modules")
    expect(out[1]).toMatch(/; REGROUP 1 \(modules that gain a copy\), fewer copies 0; hoisted 2 \(merged in one build, alone in the other: \d+, \d+\)$/)
    expect(out.find((l) => / 967471 copies 3 -> 3 /.test(l))).toContain("merged before with 218059")
  })
  it("prints an id's copies, bytes, chunks and partners in each build with --ids", () => {
    const out = execFileSync(process.execPath, [tool, before, after, "--ids", "967471"], { encoding: "utf8" }).trim().split("\n")
    expect(out[0]).toMatch(/^967471 before: copies 3 bytes \d+ merged in 3 with 218059 chunks g1\.js g2\.js g3\.js$/)
    expect(out[1]).toMatch(/^967471 after: copies 3 bytes \d+ chunks g1\.js g2\.js g3\.js$/)
  })
})

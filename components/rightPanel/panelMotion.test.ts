import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { entranceStyle } from "@/components/task/panelParts"

/**
 * The task panel's content enters by transform and opacity (work.md W28):
 * panel-in is 240ms on the in-out curve (the panel token), panel-swap a
 * 120ms crossfade with the title rising, and nothing under reduced motion.
 * Widths never animate.
 */
describe("the task panel's motion", () => {
  it("slides in on the panel token and crossfades between tasks", () => {
    expect(entranceStyle("in", "body")?.animation).toBe("work-panel-in 240ms var(--ease-in-out) both")
    expect(entranceStyle("swap", "body")?.animation).toContain("120ms")
    expect(entranceStyle("swap", "title")?.animation).toContain("work-rise-in")
    expect(entranceStyle("none", "body")).toBeUndefined()
    expect(entranceStyle("none", "title")).toBeUndefined()
  })

  it("moves only transform and opacity", () => {
    const css = readFileSync("app/globals.css", "utf8")
    for (const k of ["work-panel-in", "work-fade-in", "work-rise-in"]) {
      const at = css.indexOf(`@keyframes ${k}`)
      expect(at, k).toBeGreaterThan(-1)
      const body = css.slice(at, css.indexOf("}\n}", at))
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])
      for (const p of props) expect(["transform", "opacity"], `${k}: ${p}`).toContain(p)
    }
  })
})

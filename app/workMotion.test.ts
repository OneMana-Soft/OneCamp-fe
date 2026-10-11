import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * The work area's motion tokens (design v3, work.md §1.3): every moment has a
 * --work-* duration and curve in app/globals.css, built from the foundation's
 * tokens, and the board's drop uses the `drop` token, with no pickup keyframe
 * of its own.
 */
const ROOT = process.cwd()
const css = readFileSync(join(ROOT, "app/globals.css"), "utf8")
const root = css.slice(0, css.indexOf(".dark {"))

const value = (name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(root)?.[1]?.trim()

const SPEC: Record<string, [string, string]> = {
  "check-press": ["90ms", "var(--ease-out)"],
  "check-fill": ["220ms", "var(--ease-spring)"],
  strike: ["180ms", "var(--ease-out)"],
  settle: ["240ms", "var(--ease-in-out)"],
  lift: ["160ms", "var(--ease-spring)"],
  "make-room": ["160ms", "var(--ease-out)"],
  drop: ["200ms", "cubic-bezier(0.2, 0, 0, 1)"],
  landed: ["700ms", "cubic-bezier(0.25, 0.1, 0.25, 1)"],
  "panel-swap": ["120ms", "var(--ease-out)"],
  grow: ["320ms", "var(--ease-out)"],
  tick: ["180ms", "var(--ease-out)"],
  pop: ["180ms", "var(--ease-out)"],
}

describe("work motion tokens", () => {
  it("names every moment with its duration and curve", () => {
    for (const [name, [ms, ease]] of Object.entries(SPEC)) {
      expect(value(`work-${name}-ms`), name).toBe(ms)
      expect(value(`work-${name}-ease`), name).toBe(ease)
    }
    expect(value("work-strike-delay")).toBe("80ms")
    expect(value("work-settle-hold")).toBe("600ms")
    expect(value("work-glyph-swap-out-ms")).toBe("90ms")
    expect(value("work-glyph-swap-in-ms")).toBe("220ms")
    expect(value("work-panel-in-ms")).toBe("240ms")
    expect(value("work-panel-out-ms")).toBe("180ms")
    expect(value("work-panel-ease")).toBe("var(--ease-in-out)")
    expect(value("work-grow-stagger")).toBe("16ms")
    expect(value("work-grow-cap")).toBe("240ms")
  })

  it("has a keyframe for each moment the area plays", () => {
    for (const k of ["work-check-fill", "work-tick-draw", "work-glyph-out", "work-glyph-in", "work-strike", "work-landed", "work-panel-in", "work-panel-out", "work-grow-x", "work-grow-y", "work-tick-in", "work-tick-out", "work-pop-in", "work-row-in", "work-pulse"]) {
      expect(css, k).toMatch(new RegExp(`@keyframes ${k}\\s*\\{`))
    }
  })

  it("drops a board card on the drop token, with no pickup keyframe of its own", () => {
    const board = readFileSync(join(ROOT, "components/kanbanComponents/TaskBoard.tsx"), "utf8")
    const drop = /const dropAnimation[\s\S]{0,400}?duration:\s*(\d+)[\s\S]{0,200}?easing:\s*["']([^"']+)["']/.exec(board)
    expect(drop, "TaskBoard has a dropAnimation").not.toBeNull()
    expect(drop![1]).toBe("200")
    expect(drop![2].replace(/\s/g, "")).toBe("cubic-bezier(0.2,0,0,1)")
    const scss = join(ROOT, "components/kanbanComponents/Item/Item.module.scss")
    if (existsSync(scss)) expect(readFileSync(scss, "utf8")).not.toMatch(/@keyframes\s+pop\b/)
  })
})

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// Rows of long lists are drawn only near the screen (row-lazy, globals.css;
// fluid-17 and fluid-18, FLUIDITY-LEAD 20 Oct 2026). On beta 482460c3d at 1x,
// a project list of 1,900 rows (55,527 DOM nodes) dropped 25% of its frames
// scrolling (frame p95 33 ms, 1 s of long tasks), and opening a task's panel
// took 1.6 s, most of it laying the list out again for its narrower width.

const root = join(__dirname, "..")
const read = (f: string) => readFileSync(join(root, f), "utf8")

/** Each long list's row, and the file it is drawn in. More join as their lists adopt it. */
const LONG_LIST_ROWS: Array<[string, RegExp]> = [["components/task/GroupedTaskList.tsx", /const TaskRow = React\.memo\(function TaskRow[\s\S]*?className=\{cn\(\s*ROW_H,[\s\S]*?"row-lazy"/]]

describe("rows of long lists, drawn near the screen", () => {
  it("has one utility for it: content-visibility auto, the height remembered once drawn", () => {
    const css = read("app/globals.css")
    const rule = css.match(/@utility row-lazy \{([^}]*)\}/)?.[1] ?? ""
    expect(rule).toMatch(/content-visibility:\s*auto;/)
    expect(rule).toMatch(/contain-intrinsic-size:\s*auto var\(--row-h, 40px\);/)
  })

  it("is used by every long list's row", () => {
    for (const [file, row] of LONG_LIST_ROWS) expect(read(file), file).toMatch(row)
  })
})

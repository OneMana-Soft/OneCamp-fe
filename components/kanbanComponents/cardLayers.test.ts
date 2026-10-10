import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { reuseUnchanged } from "@/components/kanbanComponents/TaskBoard"
import type { TaskInfoInterface } from "@/types/task"

/** The declarations at the top level of a block, nested blocks left out. */
function topLevel(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  expect(start).toBeGreaterThanOrEqual(0)
  let depth = 0
  let out = ""
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    const ch = css[i]
    if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) break
    } else if (depth === 1) out += ch
  }
  return out
}

describe("a board card is not a compositing layer of its own", () => {
  // A 3D transform on every card's wrapper made each card a layer (129 for
  // 120 cards), and a drag on a big board stalled frames for 350 ms.
  const css = readFileSync(join(__dirname, "Item/Item.module.scss"), "utf8")

  it("gives the wrapper and the card no transform at rest", () => {
    expect(topLevel(css, ".Wrapper")).not.toMatch(/(^|;|\s)transform\s*:/)
    expect(topLevel(css, ".Item")).not.toMatch(/(^|;|\s)transform\s*:/)
  })

  it("never promotes cards with translate3d or will-change", () => {
    expect(css).not.toMatch(/translate3d|will-change/)
  })
})

describe("a board's lists after its data changes", () => {
  const t = (id: string) => ({ task_uuid: id }) as TaskInfoInterface
  const [a, b, c] = [t("a"), t("b"), t("c")]

  it("keeps the array of a list that holds the same cards, so its column skips a render", () => {
    const prev = { todo: [a, b], done: [c] }
    const next = reuseUnchanged(prev, { todo: [a, b], done: [] })
    expect(next.todo).toBe(prev.todo)
    expect(next.done).toEqual([])
  })

  it("returns the same board when nothing changed", () => {
    const prev = { todo: [a, b], done: [c] }
    expect(reuseUnchanged(prev, { todo: [a, b], done: [c] })).toBe(prev)
  })

  it("takes a new list when a card in it is a new object", () => {
    const prev = { todo: [a, b] }
    const b2 = t("b")
    expect(reuseUnchanged(prev, { todo: [a, b2] }).todo[1]).toBe(b2)
  })
})

import { readFileSync, readdirSync } from "node:fs"
import { describe, expect, it } from "vitest"

// The board opens the gap for a held card with one property, set on the
// board, which its cards and the drop line read by inheritance (TaskBoard's
// roomFor). A property registered as not inherited (@property … { inherits:
// false }), as the list's --room is for lib/ui/makeRoom, reads 0px on every
// card: under that name the cards stopped moving aside.
describe("the board's room", () => {
  it("is a property its cards can inherit", () => {
    const board = readFileSync("components/kanbanComponents/TaskBoard.tsx", "utf8")
    const css = readdirSync("app")
      .filter((name) => name.endsWith(".css"))
      .map((name) => readFileSync(`app/${name}`, "utf8"))
      .join("\n")
    const notInherited = new Set([...css.matchAll(/@property\s+(--[\w-]+)\s*\{[^}]*inherits:\s*false/g)].map((m) => m[1]))
    const onBoard = [...board.matchAll(/boardRef\.current\?\.style\.setProperty\("(--[\w-]+)"/g)].map((m) => m[1])
    expect(notInherited.size).toBeGreaterThan(0)
    expect(onBoard).toContain("--card-room")
    expect(onBoard.filter((name) => notInherited.has(name))).toEqual([])
  })
})

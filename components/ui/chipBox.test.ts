import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { CHIP_BOX, chipWidth } from "./chipBox"

// A row that must know its chips' widths before it draws them (a note's tag
// chips) reads them from CHIP_BOX; the chip itself is drawn by the `chip`
// utility in globals.css and HueDot's classes. The two can't drift apart.

const root = resolve(__dirname, "../..")
const css = readFileSync(resolve(root, "app/globals.css"), "utf8")
const chipRule = /@utility chip \{([^}]*)\}/.exec(css)?.[1] ?? ""
const prop = (name: string) => new RegExp(`(?:^|;|\\s)${name}:\\s*([^;]+);`).exec(chipRule)?.[1].trim()

describe("a chip's box, as a row measures it", () => {
  it("is the chip utility's box", () => {
    expect(chipRule).not.toBe("")
    expect(prop("padding")).toBe(`0 ${CHIP_BOX.side}px`)
    expect(prop("gap")).toBe(`${CHIP_BOX.gap}px`)
    expect(prop("font-size")).toBe(`${CHIP_BOX.size}px`)
    expect(prop("font-weight")).toBe(String(CHIP_BOX.weight))
  })

  it("has HueDot's dot, a size-1.5 (6px) circle", () => {
    const source = readFileSync(resolve(root, "components/ui/chip.tsx"), "utf8")
    const dot = /export function HueDot[\s\S]*?className=\{cn\([^,]+, "([^"]+)"\)\}/.exec(source)?.[1] ?? ""
    expect(dot.split(" ")).toContain("size-1.5")
    expect(CHIP_BOX.dot).toBe(6)
  })

  it("is the words' width and the chip's sides, and its dot when it has one", () => {
    const words = chipWidth("risk", "sans-serif") - 2 * CHIP_BOX.side
    expect(words).toBeGreaterThan(0)
    expect(chipWidth("risk", "sans-serif", true)).toBe(chipWidth("risk", "sans-serif") + CHIP_BOX.dot + CHIP_BOX.gap)
  })
})

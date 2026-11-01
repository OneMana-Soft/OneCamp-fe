import { describe, expect, it } from "vitest"
import type { CampHue } from "@/lib/campHue"
import { shareHues } from "@/lib/shareHues"

// The six hues shared out among things in an order: each keeps its own hue
// unless one before it has it, then takes the least used hue after its own.
describe("shareHues", () => {
  it("keeps everyone's own hue while nobody before them has it", () => {
    expect([...shareHues([["a", "lake"], ["b", "sky"], ["c", "moss"]])]).toEqual([["a", "lake"], ["b", "sky"], ["c", "moss"]])
  })

  it("gives a later one whose hue is taken the first free hue after its own, and never recolours an earlier one", () => {
    const two = shareHues([["sam", "lake"], ["lena", "lake"]])
    expect(two.get("sam")).toBe("lake")
    // After lake the wheel comes round to sky.
    expect(two.get("lena")).toBe("sky")
    const three = shareHues([["sam", "lake"], ["lena", "lake"], ["kai", "sky"]])
    expect([three.get("sam"), three.get("lena"), three.get("kai")]).toEqual(["lake", "sky", "moss"])
  })

  it("keeps six apart, then shares the least used out", () => {
    // The seventh takes its own hue back; the eighth can't, as sun is used twice then, so it takes dusk, the least used after it.
    const eight = shareHues(Array.from({ length: 8 }, (_, i) => [`p${i}`, "sun" as CampHue] as const))
    expect([...eight.values()]).toEqual(["sun", "dusk", "berry", "lake", "sky", "moss", "sun", "dusk"])
    // Twelve keys of one hue: each hue twice, never a third of one before every hue has two.
    const twelve = [...shareHues(Array.from({ length: 12 }, (_, i) => [`q${i}`, "lake" as CampHue] as const)).values()]
    expect(new Set(twelve).size).toBe(6)
    expect(twelve.every((h) => twelve.filter((x) => x === h).length === 2)).toBe(true)
  })

  it("gives a key it has seen once more its first hue", () => {
    const twice = shareHues([["sam", "lake"], ["lena", "lake"], ["sam", "moss"]])
    expect([...twice]).toEqual([["sam", "lake"], ["lena", "sky"]])
  })
})

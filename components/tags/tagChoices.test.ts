import { describe, expect, it, vi } from "vitest"
import type { ScopedMutator } from "swr"
import { MAX_TAGS, joinTags } from "@/lib/tags"

// linear-28 H1b (CR-135 FIX-2): the palette's Add or remove tag… is the
// picker's own list and toggle. A task holds at most MAX_TAGS tags: a full set
// is offered only its own tags, to take off, and putting one more on leaves
// the label as it was.

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get } }))

const { tagChoices, toggledLabel } = await import("@/components/tags/TagPicker")

// The app's cache as readInto uses it: the read's answer is what it keeps.
const mutate = (async (_key: string, data: Promise<unknown>) => await data) as unknown as ScopedMutator
const full = Array.from({ length: MAX_TAGS }, (_, i) => `tag-${i + 1}`)
const oneShort = full.slice(0, MAX_TAGS - 1)

describe("the palette's tags for a task", () => {
  it("offers a full set only its own tags, to take off", async () => {
    get.mockResolvedValue({ data: { data: [{ name: "bug", count: 3 }, { name: "ux", count: 1 }] } })
    const choices = await tagChoices(mutate, "p1", joinTags(full))
    expect(choices).toEqual(full.map((name) => ({ name, current: true })))
  })

  it("offers the project's tags beside the task's own while there is room", async () => {
    get.mockResolvedValue({ data: { data: [{ name: "bug", count: 3 }, { name: "ux", count: 1 }] } })
    const choices = await tagChoices(mutate, "p1", joinTags(oneShort))
    expect(choices.map((c) => c.name)).toEqual([...oneShort, "bug", "ux"])
    expect(choices.filter((c) => c.current).map((c) => c.name)).toEqual(oneShort)
  })
})

describe("putting a tag on or taking it off", () => {
  it("never puts a tag past a full set on, and still takes one off", () => {
    expect(toggledLabel(joinTags(full), "bug")).toBe(joinTags(full))
    expect(toggledLabel(joinTags(full), "tag-3")).toBe(joinTags(full.filter((t) => t !== "tag-3")))
  })

  // joinTags keeps at most MAX_TAGS, so only a label not in its form shows
  // the difference: one the server kept as written, or one from before the
  // cap. Putting one more on changes nothing, and never rewrites or drops the
  // tags already there.
  it("leaves a full label exactly as it is when one more is put on", () => {
    const written = full.join(",")
    expect(toggledLabel(written, "bug")).toBe(written)
    const overFull = [...full, "tag-11", "tag-12"].join(", ")
    expect(toggledLabel(overFull, "bug")).toBe(overFull)
  })

  it("puts a tag on while there is room", () => {
    expect(toggledLabel(joinTags(oneShort), "bug")).toBe(joinTags([...oneShort, "bug"]))
  })
})

import { afterEach, describe, expect, it } from "vitest"
import { groupsWithout } from "@/lib/testing/hoverGroups"

const drawn = (html: string) => {
  document.body.innerHTML = html
  return groupsWithout(document.body)
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("groupsWithout", () => {
  it("passes a variant whose group is an ancestor, plain or named", () => {
    expect(drawn('<div class="group"><span><b class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"></b></span></div>')).toEqual([])
    expect(drawn('<dt class="group/field"><button class="opacity-0 group-hover/field:opacity-100"></button></dt>')).toEqual([])
  })

  it("finds a variant with no group above it, the one V-957 was", () => {
    const found = drawn('<div class="grid"><dd><button aria-label="Add a link" class="opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"></button></dd></div>')
    expect(found).toEqual([expect.stringMatching(/^<button> "Add a link" group-hover: with no group above it: opacity-0 /)])
  })

  it("reads a named group as that name only, and an arbitrary state's brackets", () => {
    expect(drawn('<div class="group"><b class="group-hover/field:opacity-100"></b></div>')).toEqual([expect.stringContaining("no group/field above it")])
    expect(drawn('<div class="group/chip"><b class="group-hover:inline-flex"></b></div>')).toEqual([expect.stringContaining("no group above it")])
    // Split before the utility: written whole, Tailwind compiles it into the shipped stylesheet (styleInvalidationGuard.test.ts).
    expect(drawn('<div class="group/date"><b class="group-data-[state=open]/date:opacity-100 group-has-[:focus-visible]/date' + ':block"></b></div>')).toEqual([])
    // A date cell's icon: its named states answer to the cell, its plain hover to the row it is in.
    const icon = '<svg class="opacity-0 group-hover:opacity-100 group-focus-visible/date:opacity-100"></svg>'
    expect(drawn(`<button class="group/date">${icon}</button>`)).toEqual([expect.stringContaining("group-hover:")])
    expect(drawn(`<div class="group"><button class="group/date">${icon}</button></div>`)).toEqual([])
    expect(drawn('<b class="[@media(hover:hover)]:group-hover:opacity-100"></b>')).toHaveLength(1)
  })

  it("reads row-hover-in: as answering to a list row ([data-task-id]) above it (V-1054)", () => {
    expect(drawn('<div data-task-id="t1"><span><b class="opacity-0 row-hover-in:opacity-100"></b></span></div>')).toEqual([])
    const found = drawn('<div class="group/row"><b aria-label="Move" class="opacity-0 row-hover-in:opacity-100"></b></div>')
    expect(found).toHaveLength(1)
    expect(found[0]).toContain("row-hover-in: with no [data-task-id] row above it")
  })

  it("counts an ancestor only, never the element's own group, and ignores classes that only start with group-", () => {
    expect(drawn('<div class="group group-hover:opacity-100"></div>')).toHaveLength(1)
    expect(drawn('<div class="group-header text-ink"><b class="group-row"></b></div>')).toEqual([])
  })
})

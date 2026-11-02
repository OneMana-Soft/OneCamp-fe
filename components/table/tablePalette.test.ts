import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { offeredSurfaces } from "@/lib/ui/paletteEntries"
import { SWITCH_TABLE } from "@/lib/tables/tableKeys"
import { tablePath } from "@/lib/tables/route"
import { GetEndpointUrl } from "@/services/endPoints"
import { chordSymbols, offerTableSwitch, paletteKeys } from "./tablePalette"

const get = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (...a: unknown[]) => get(...a) } }))

// A table's switchers (airtable-04, AV-7) are a chunk of their own, off every
// first load: the keys beside an action as this computer writes them, and the
// table page's "Switch table…", which ⌘J opens the palette on.

const onMac = (mac: boolean) => Object.defineProperty(navigator, "platform", { value: mac ? "MacIntel" : "Linux x86_64", configurable: true })

describe("a chord beside an action, as this computer writes it", () => {
  it("is symbols run together on a Mac", () => {
    expect(chordSymbols("Mod-j", true)).toBe("⌘J")
    expect(chordSymbols("Mod-Shift-k", true)).toBe("⌘⇧K")
    expect(chordSymbols("Mod-Shift-h", true)).toBe("⌘⇧H")
    expect(chordSymbols("Mod-Shift-Enter", true)).toBe("⌘⇧⏎")
    expect(chordSymbols("Alt-ArrowUp", true)).toBe("⌥↑")
  })

  it("is the keys' names joined by plus signs elsewhere", () => {
    expect(chordSymbols("Mod-j", false)).toBe("Ctrl+J")
    expect(chordSymbols("Mod-Shift-k", false)).toBe("Ctrl+Shift+K")
    expect(chordSymbols("Mod-h", false)).toBe("Ctrl+H")
    expect(chordSymbols("Mod-;", false)).toBe("Ctrl+;")
    expect(chordSymbols("Space", false)).toBe("Space")
  })

  it("gives a table command's key for this computer, from the table's keys", () => {
    onMac(true)
    expect(paletteKeys("switchTable")).toBe("⌘J")
    expect(paletteKeys("replace")).toBe("⌘⇧H")
    onMac(false)
    expect(paletteKeys("switchView")).toBe("Ctrl+Shift+K")
    expect(paletteKeys("replace")).toBe("Ctrl+H")
  })
})

describe("the table page's Switch table… in the palette", () => {
  const push = vi.fn()
  let stop: () => void = () => {}
  beforeEach(() => {
    onMac(false)
    get.mockReset()
    push.mockReset()
  })
  afterEach(() => stop())

  it("is offered under This table as the entry ⌘J opens on, until it stops", () => {
    stop = offerTableSwitch("t1", { push })
    const surface = offeredSurfaces().find((s) => s.id === "table")!
    expect(surface.group).toBe("This table")
    const [entry] = surface.entries(undefined)
    expect(`${surface.id}:${entry.id}`).toBe(SWITCH_TABLE)
    expect(entry).toMatchObject({ label: "Switch table…", keys: "Ctrl+J" })
    stop()
    expect(offeredSurfaces().some((s) => s.id === "table")).toBe(false)
  })

  it("lists the workspace's tables, this one marked and a nameless one named, and opens the one picked", async () => {
    get.mockResolvedValue({ data: { data: [{ id: "t1", name: "Budget" }, { id: "t2", name: "" }] } })
    stop = offerTableSwitch("t1", { push })
    const [entry] = offeredSurfaces().find((s) => s.id === "table")!.entries(undefined)
    expect(await entry.choices!()).toEqual([
      { value: "t1", label: "Budget", current: true },
      { value: "t2", label: "Untitled table", current: false },
    ])
    expect(get).toHaveBeenCalledWith(GetEndpointUrl.GetTables)
    entry.apply!("t1")
    expect(push).not.toHaveBeenCalled()
    entry.apply!("t2")
    expect(push).toHaveBeenCalledWith(tablePath("t2"))
  })
})

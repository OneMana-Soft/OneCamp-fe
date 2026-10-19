import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { numberSigns } from "@/lib/format/number"
import type { FieldType, TableField } from "@/services/tableService"
import { FIELD_KINDS, fieldKind } from "./registry"

// The golden fixtures the server's registry is held to (business/FieldTypes,
// fixtures_test.go), copied byte for byte into testdata/fieldtypes. A typed
// case is text a person types into a cell's editor: read here in the case's
// locale, it must give what the server stores, or be refused as the server
// refuses it, so what the grid sends is what the server keeps.
const FILE = path.join(__dirname, "..", "..", "testdata", "fieldtypes", "coerce.json")

interface Case {
  name: string
  kind: FieldType
  config?: Record<string, unknown>
  in: unknown
  typed?: boolean
  locale?: string
  signs?: { decimal: string; group: string }
  want?: unknown
  error?: boolean
}

const fixtures = JSON.parse(readFileSync(FILE, "utf8")) as { options: { id?: string; label: string }[]; cases: Case[] }

const fieldOf = (c: Case): TableField => ({
  id: "f",
  table_id: "t",
  name: "Amount",
  type: c.kind,
  config: JSON.stringify({ options: fixtures.options, ...c.config }),
  position: 0,
})

describe("the field kinds read typing as the server's fixtures say", () => {
  it("knows every kind the fixtures name", () => {
    const known = new Set(FIELD_KINDS.map((k) => k.id))
    expect(fixtures.cases.filter((c) => !known.has(c.kind)).map((c) => c.kind)).toEqual([])
  })

  it("has typed cases to read (the file is the one it means to read)", () => {
    expect(fixtures.cases.filter((c) => c.typed).length).toBeGreaterThan(10)
  })

  for (const c of fixtures.cases.filter((x) => x.typed)) {
    it(c.name, () => {
      // The case's locale writes numbers with the signs it names, as the server is told.
      expect(numberSigns(c.locale)).toEqual(c.signs)
      const parse = fieldKind(c.kind).parse
      expect(parse, `${c.kind} reads what's typed`).toBeDefined()
      const got = parse!(String(c.in), fieldOf(c), c.locale)
      if (c.error) expect("error" in got, JSON.stringify(got)).toBe(true)
      else expect(got).toEqual({ value: c.want })
    })
  }
})

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { SETTINGS_PLACES } from "@/lib/adminSections"
import { SETTINGS_FIELDS, fieldHref, searchFields } from "@/lib/settingsFields"
import { settingIdOf } from "@/lib/settingsIds"

// Search settings lands on the field (design-14). Every worded row of a
// settings place is in the field index, and every entry is a row that exists,
// with the id its control carries: a row added without an entry, or an entry
// whose row was renamed, fails here.

const ROOT = join(__dirname, "..")

/** Rows in files no settings place shows: dialogs a card opens, a doc's publish panel, an event's form. */
const NOT_A_PLACE: Record<string, string> = {
  "components/admin/ArchiveEditPolicyDialog.tsx": "a dialog Archive opens; its card is the hit",
  "components/admin/SlackImportPlanDialog.tsx": "the Slack import's plan, a dialog of one import",
  "components/guest/PublishSection.tsx": "a doc's own publish panel, not Settings",
  "components/calendar/form/eventForm.tsx": "an event's own form (All day), not Settings",
  "components/table/fields/KindSettings.tsx": "a table field's own settings, in its column's menu, not Settings",
  "components/livekit/YourRoom.tsx": "a member's own room, its page under Calls (/app/meet/room), not Settings",
}

interface Row {
  kind: "SwitchRow" | "SettingRow"
  file: string
  label: string | null
  id: string | null
}

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(p)
  }
  return out
}

/** Every SwitchRow and SettingRow in the app, its label and its control's id when they are words. */
function rows(): Row[] {
  const out: Row[] = []
  for (const file of [...sources(join(ROOT, "components")), ...sources(join(ROOT, "app"))]) {
    const text = readFileSync(file, "utf8")
    if (!/<(SwitchRow|SettingRow)\b/.test(text)) continue
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const visit = (node: ts.Node) => {
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && ["SwitchRow", "SettingRow"].includes(node.tagName.getText(sf))) {
        const literal = (name: string) => {
          const a = node.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sf) === name)
          const init = a?.initializer
          if (!init) return null
          if (ts.isStringLiteral(init)) return init.text
          const e = ts.isJsxExpression(init) ? init.expression : undefined
          return e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) ? e.text : null
        }
        const kind = node.tagName.getText(sf) as Row["kind"]
        out.push({ kind, file: relative(ROOT, file), label: literal("label"), id: literal(kind === "SwitchRow" ? "id" : "controlId") })
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return out
}

const ALL = rows()

describe("the settings field index", () => {
  it("names only places Settings has", () => {
    const keys = new Set(SETTINGS_PLACES.map((p) => p.key))
    expect(SETTINGS_FIELDS.filter((f) => !keys.has(f.place)).map((f) => `${f.place}: ${f.label}`)).toEqual([])
  })

  it("gives every field its own id", () => {
    const ids = SETTINGS_FIELDS.map((f) => f.id)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
  })

  it("holds rows that exist, by the words they show and the id their control carries", () => {
    const missing = SETTINGS_FIELDS.filter((f) => {
      const matches = ALL.filter((r) => r.label === f.label)
      return !matches.some((r) => (r.id ?? (r.kind === "SwitchRow" ? settingIdOf(r.label!) : null)) === f.id)
    })
    expect(missing.map((f) => `${f.place}: "${f.label}" #${f.id}`)).toEqual([])
  })

  it("holds every worded row of every settings place", () => {
    const indexed = new Set(SETTINGS_FIELDS.map((f) => f.label))
    const left = ALL.filter((r) => r.label && !NOT_A_PLACE[r.file] && !indexed.has(r.label))
    expect(left.map((r) => `${r.file}: "${r.label}"`), "add these to lib/settingsFields.ts (or name why a file is no place)").toEqual([])
  })

  it("never gives two worded switches the same id", () => {
    const ids = ALL.filter((r) => r.kind === "SwitchRow" && r.label && !r.id).map((r) => settingIdOf(r.label!))
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
  })
})

describe("a search for a field", () => {
  const open = new Set(SETTINGS_PLACES.map((p) => p.key))

  it("finds it by its words or by other words", () => {
    expect(searchFields("web search", open).map((f) => f.id)).toEqual([settingIdOf("Use web search")])
    expect(searchFields("dnd", open).map((f) => f.id)).toEqual(["quiet_hours_enabled"])
  })

  it("finds nothing on a place the person can't open", () => {
    expect(searchFields("web search", new Set(["profile"]))).toEqual([])
  })

  it("lands on the field, on the AI sub-page that holds it", () => {
    const web = SETTINGS_FIELDS.find((f) => f.label === "Use web search")!
    expect(fieldHref(web, "/app/admin?tab=ai-models")).toBe(`/app/admin?tab=ai-models&sub=advanced#${settingIdOf("Use web search")}`)
    const quiet = SETTINGS_FIELDS.find((f) => f.id === "quiet_hours_enabled")!
    expect(fieldHref(quiet, "/app/settings/notifications")).toBe("/app/settings/notifications#quiet_hours_enabled")
  })
})

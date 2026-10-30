import { readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import { sourceFiles } from "@/lib/testing/sourceFiles"

/**
 * Design v3, admin §1.3 and §1.5: the admin and settings area is cards at e1,
 * not 1px grey boxes, and hue is a noun.
 *
 * - noBorderedCards: `border border-border` is the wireframe look the settings
 *   card replaced (SettingsList is the raised surface at e1, no border). The
 *   count in components/admin and app/app/settings may only fall.
 * - adminColour: a camp tint or a Tile in components/admin is identity or a
 *   section's one header tile, an illustration spot or onboarding; a category
 *   (an audit row, an import source, a webhook event) is a neutral chip with
 *   an ink-3 glyph. The count may only fall.
 *
 * Lower a baseline when a wave removes some; never raise it.
 */
const ROOT = process.cwd()

const count = (dirs: string[], re: RegExp) => {
  const per: Record<string, number> = {}
  let total = 0
  for (const d of dirs)
    for (const f of sourceFiles([d], /\.tsx$/)) {
      const n = (readFileSync(join(ROOT, f), "utf8").match(re) || []).length
      if (n) per[relative(ROOT, join(ROOT, f))] = n
      total += n
    }
  return { total, per }
}

/** 101 on 11 Oct 2026, when the settings card took the border off SettingsList;
 *  74 after the connect slice (import, workflows, integrations, apps, webhooks). */
const BORDERED_BASELINE = 24
/** 37 on 11 Oct 2026, before the admin wave's sections; 29 after the connect slice. */
// 12 at the integration (11 Oct): the hub owns the agent inventory card (A15a)
// and its v3 restyle draws its four kinds on camp tints; the admin tabs render it unedited.
const TINT_BASELINE = 12

describe("admin and settings cards", () => {
  it("draws no new bordered boxes: cards are the raised surface at e1", () => {
    const { total, per } = count(["components/admin", "app/app/settings"], /border border-border/g)
    expect(total, `bordered boxes by file: ${JSON.stringify(per, null, 1)}`).toBeLessThanOrEqual(BORDERED_BASELINE)
  })

  it("keeps SettingsList, the card every section uses, free of a border", () => {
    const src = readFileSync(join(ROOT, "components/ui/settingsSection.tsx"), "utf8")
    const list = src.slice(src.indexOf("export function SettingsList"), src.indexOf("export const SettingsCard"))
    expect(list).toContain('"set-card"')
    expect(list).not.toMatch(/\bborder\b/)
    const css = readFileSync(join(ROOT, "app/styles/admin/core.css"), "utf8")
    const card = css.slice(css.indexOf(".set-card {"), css.indexOf("}", css.indexOf(".set-card {")))
    expect(card).toMatch(/box-shadow:\s*var\(--e1\)/)
    expect(card).toMatch(/border-radius:\s*var\(--radius-lg\)/)
    expect(card).not.toMatch(/\bborder:/)
  })
})

describe("admin colour", () => {
  it("adds no camp tint or tile outside identity, header tiles, spots and onboarding", () => {
    const { total, per } = count(["components/admin"], /bg-camp-[a-z]+-tint|<Tile\b|bg-hue-tint/g)
    expect(total, `tints by file: ${JSON.stringify(per, null, 1)}`).toBeLessThanOrEqual(TINT_BASELINE)
  })
})

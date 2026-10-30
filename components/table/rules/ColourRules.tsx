"use client"

// The rules a view colours its rows and cells by (tables V3): each a hue, what
// it colours (the row, or one field's cell) and the filters a row passes to
// take it, the first rule a row passes winning; and its colour scales, which
// shade a number field's cells from its lowest to its highest. Edited in a
// dialog (a sheet on a phone), and kept as they change, as filters are.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { OverlayBody } from "@/components/ui/overlay"
import { HueSwatches } from "@/components/ui/hueSwatches"
import { CAMP_SWATCHES, swatchName } from "@/components/ui/campSwatches"
import { usePhone } from "@/hooks/usePhone"
import { Plus, X } from "@/lib/icons"
import { FilterList, RuleSelect } from "@/components/table/rules/RuleMenus"
import { filterCount, freshFilter, MAX_FILTERS } from "@/lib/tables/viewRules"
import { filterKind } from "@/lib/fieldTypes/registry"
import { MAX_COLOR_RULES, MAX_COLOR_SCALES, readColors, type ColorRule, type ColorScale, type RowColors } from "@/lib/tables/applyRules"
import type { TableField } from "@/services/tableService"

/** A new rule: the next swatch along, and a filter on the first field waiting for its value (it colours nothing until then). */
const freshRule = (fields: TableField[], n: number): ColorRule => ({ hue: CAMP_SWATCHES[n % CAMP_SWATCHES.length].hue, match: "all", filters: [freshFilter(fields[0])] })

/** A rule as the dialog holds it: with a key of its own, so taking one out never hands its place, and what it was doing, to the next (CR-63). */
interface Held {
  key: number
  rule: ColorRule
}
let lastKey = 0
const held = (rule: ColorRule): Held => ({ key: ++lastKey, rule })

export function ColourRules({
  fields,
  colors,
  onChange,
  onClose,
}: {
  fields: TableField[]
  /** As the view keeps them. */
  colors: RowColors | null
  onChange: (colors: RowColors | null) => void
  onClose: () => void
}) {
  const phone = usePhone()
  const [rules, setRules] = React.useState<Held[]>(() => {
    const kept = readColors(colors, fields)
    return (kept && "rules" in kept ? kept.rules : [freshRule(fields, 0)]).map(held)
  })
  const [scales, setScales] = React.useState<ColorScale[]>(() => readColors(colors, fields)?.scales ?? [])
  const keep = (r: Held[], sc: ColorScale[]) => {
    setRules(r)
    setScales(sc)
    onChange(r.length || sc.length ? { rules: r.map((h) => h.rule), ...(sc.length ? { scales: sc } : {}) } : null)
  }
  const change = (next: Held[]) => keep(next, scales)
  const set = (key: number, rule: ColorRule) => change(rules.map((h) => (h.key === key ? { key, rule } : h)))
  // What a rule colours: the whole row, or one field's cell.
  const targets = [{ value: "", label: "The whole row" }, ...fields.map((f) => ({ value: f.id, label: `${f.name}'s cell` }))]
  // A scale shades what reads as a number, one scale a field.
  const numbers = fields.filter((f) => filterKind(f) === "number")
  const unscaled = numbers.find((f) => !scales.some((s) => s.field === f.id))
  const setScale = (i: number, sc: ColorScale) => keep(rules, scales.map((x, j) => (j === i ? sc : x)))
  const nameOf = (id: string) => fields.find((f) => f.id === id)?.name ?? ""
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]" data-colour-rules="">
        <DialogHeader>
          <DialogTitle>Colour rows and cells</DialogTitle>
          <DialogDescription>A row, or a cell, takes the colour of the first rule it matches. A scale shades a number&apos;s cells.</DialogDescription>
        </DialogHeader>
        <OverlayBody className="space-y-3">
          {rules.length === 0 && <p className="text-ui-sm text-ink-3">No rule colours a row or a cell.</p>}
          {rules.map(({ key, rule: r }, i) => (
            <div key={key} role="group" aria-label={`Rule ${i + 1}, ${swatchName(r.hue)}`} className="flex flex-col gap-2 rounded-xl bg-sunken/70 p-3 ring-1 ring-line">
              <div className="flex flex-wrap items-center gap-2">
                <HueSwatches value={r.hue} onPick={(hue) => set(key, { ...r, hue: hue ?? r.hue })} label={`Rule ${i + 1}'s colour`} size={phone ? "lg" : "md"} clearable={false} />
                <RuleSelect
                  label={`What rule ${i + 1} colours`}
                  value={r.cell ?? ""}
                  options={targets}
                  onChange={(v) => set(key, v ? { ...r, cell: v } : { hue: r.hue, match: r.match, filters: r.filters })}
                  className="w-44"
                />
              </div>
              <FilterList
                fields={fields}
                group={r}
                depth={2}
                room={filterCount(r.filters) < MAX_FILTERS}
                onChange={(g) => set(key, { ...r, match: g.match, filters: g.filters })}
                onRemove={() => change(rules.filter((h) => h.key !== key))}
                removeLabel="Remove this rule"
                others
              />
            </div>
          ))}
          {rules.length < MAX_COLOR_RULES && fields.length > 0 && (
            <Button variant="ghost" size="sm" className="gap-1 px-2 text-ui-sm" onClick={() => change([...rules, held(freshRule(fields, rules.length))])}>
              <Plus className="size-3.5" /> Add a rule
            </Button>
          )}
          {numbers.length > 0 && (
            <section aria-labelledby="colour-scales" className="space-y-2 border-t border-line pt-3">
              <h3 id="colour-scales" className="text-ui-sm font-semibold text-ink">
                Colour scales
              </h3>
              <p className="text-ui-sm text-ink-3">A number&apos;s cells shade from light to strong, from its lowest to its highest.</p>
              {scales.map((sc, i) => (
                // The field and its remove on one line: on a phone the swatches take the next line whole
                // (DB-24: at 390 the × wrapped onto a line of its own).
                <div key={sc.field} role="group" aria-label={`Scale on ${nameOf(sc.field)}, ${swatchName(sc.hue)}`} className="flex flex-wrap items-center gap-2" data-scale="">
                  <RuleSelect
                    label={`Scale ${i + 1}'s field`}
                    value={sc.field}
                    options={numbers.filter((f) => f.id === sc.field || !scales.some((s) => s.field === f.id)).map((f) => ({ value: f.id, label: f.name }))}
                    onChange={(v) => setScale(i, { ...sc, field: v })}
                    className="w-36"
                  />
                  <div className="order-3 w-full sm:order-none sm:w-auto">
                    <HueSwatches value={sc.hue} onPick={(hue) => setScale(i, { ...sc, hue: hue ?? sc.hue })} label={`Scale ${i + 1}'s colour`} size={phone ? "lg" : "md"} clearable={false} />
                  </div>
                  <Button aria-label={`Remove the scale on ${nameOf(sc.field)}`} variant="ghost" size="icon-sm" className="order-2 ml-auto shrink-0 sm:order-none" onClick={() => keep(rules, scales.filter((_, j) => j !== i))}>
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
              {unscaled && scales.length < MAX_COLOR_SCALES && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 px-2 text-ui-sm"
                  onClick={() => keep(rules, [...scales, { field: unscaled.id, hue: CAMP_SWATCHES[scales.length % CAMP_SWATCHES.length].hue }])}
                >
                  <Plus className="size-3.5" /> Add a colour scale
                </Button>
              )}
            </section>
          )}
        </OverlayBody>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

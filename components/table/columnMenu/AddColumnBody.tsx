"use client"

/**
 * The "+" at the end of the header (T19), its menu: a CommandList of the
 * types. A plain type is made at once and its menu opens on its name; a
 * formula, a link or a rollup needs its settings first, so it opens them in
 * the same pop. A chunk of its own, loaded the first time the "+" opens
 * (ColumnMenu.tsx AddColumn), and mounted while it is open.
 */

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { PopoverContent } from "@/components/ui/popover"
import { OverlayBody, OverlayFooter, OverlayHeader } from "@/components/ui/overlay"
import type { FieldType, TableField } from "@/services/tableService"
import { FormulaEditor } from "@/components/table/FormulaEditor"
import { RelationSettings, RollupSettings, relationDraftOf, relationReady, rollupReady, type RelationDraft, type RollupDraft } from "@/components/table/LinkSettings"
import { FIELD_KINDS, fieldKind } from "@/lib/fieldTypes/registry"
import { CommandList, CommandTile, type CommandListItem } from "@/components/ui/CommandList"
import type { ColumnCreateInput } from "@/components/table/ColumnMenu"
import { SubHeader, TypeHint } from "./menuParts"

export function AddColumnBody({
  tableId,
  fields,
  onCreate,
  onClose,
}: {
  tableId: string
  fields: TableField[]
  onCreate: (input: ColumnCreateInput) => Promise<void>
  onClose: () => void
}) {
  const [step, setStep] = React.useState<FieldType | null>(null)
  const [name, setName] = React.useState("")
  const [formula, setFormula] = React.useState("")
  const [relation, setRelation] = React.useState<RelationDraft>(() => relationDraftOf())
  const [rollup, setRollup] = React.useState<RollupDraft>({ relation: "", field: "", aggregate: "" })
  const [busy, setBusy] = React.useState(false)
  const uniqueName = (base: string) => {
    const names = new Set(fields.map((f) => f.name.toLowerCase()))
    if (!names.has(base.toLowerCase())) return base
    for (let i = 2; ; i++) if (!names.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`
  }
  const create = async (input: ColumnCreateInput) => {
    setBusy(true)
    try {
      await onCreate(input)
      onClose()
    } finally {
      setBusy(false)
    }
  }
  const pickType = (type: FieldType) => {
    const label = fieldKind(type).label
    if (type === "formula" || type === "relation" || type === "rollup") {
      setStep(type)
      setName(uniqueName(label))
      return
    }
    void create({ name: uniqueName(label), type, config: type === "select" || type === "multi_select" ? { options: [] } : undefined })
  }
  const items: CommandListItem[] = FIELD_KINDS.map((t) => {
    const G = t.glyph
    return {
      id: t.id,
      label: t.label,
      text: t.label,
      tile: (
        <CommandTile>
          <G />
        </CommandTile>
      ),
      trailing: <TypeHint>{t.hint}</TypeHint>,
    }
  })
  const ready = step === "formula" ? !!formula.trim() : step === "relation" ? relationReady(relation) : step === "rollup" ? rollupReady(rollup) : false
  return (
    <PopoverContent align="end" sideOffset={4} className={cn("content-float rounded-xl p-1 shadow-e3", step === "formula" ? "w-[400px]" : "w-80")} data-add-column="">
      {step === null ? (
        <CommandList label="New column type" header="New column" className="w-full animate-none bg-transparent shadow-none" items={items} maxHeight={380} onSelect={(i) => pickType(i.id as FieldType)} />
      ) : (
        <form
          className="table-sub-in flex flex-col p-1"
          onSubmit={(e) => {
            e.preventDefault()
            if (!ready || !name.trim()) return
            void create({
              name: name.trim(),
              type: step,
              config: step === "formula" ? { formula } : step === "relation" ? { ...relation } : { ...rollup },
            })
          }}
        >
          <OverlayHeader className="pb-1">
            <SubHeader title={fieldKind(step).label} onBack={() => setStep(null)} />
          </OverlayHeader>
          {/* The settings scroll; Add column stays in view under them. */}
          <OverlayBody className="space-y-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Column name"
              aria-label="Column name"
              className="h-8 w-full rounded-lg bg-raised px-2.5 text-ui text-ink shadow-e1 outline-none focus:focus-halo"
            />
            {step === "formula" && <FormulaEditor tableId={tableId} fields={fields} value={formula} onChange={setFormula} />}
            {step === "relation" && <RelationSettings tableId={tableId} draft={relation} onChange={setRelation} />}
            {step === "rollup" && <RollupSettings fields={fields} draft={rollup} onChange={setRollup} />}
          </OverlayBody>
          <OverlayFooter className="flex justify-end gap-1.5 pt-2">
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || !name.trim() || !ready}>
              Add column
            </Button>
          </OverlayFooter>
        </form>
      )}
    </PopoverContent>
  )
}

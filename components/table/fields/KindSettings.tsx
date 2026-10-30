"use client"

// A field's settings that are its kind's own, in its column menu (tables B1,
// D-TB-3): a status option's group, whether a duration shows seconds, how
// many stars a rating has, an id's prefix, and whether a people field takes
// one person. Each saves as it changes; the server checks each
// (business/FieldTypes Kind.Config). In the column menu's chunk, never on a
// table's first screen.

import * as React from "react"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { GROUP_STATUS } from "@/components/table/optionChip"
import { cn } from "@/lib/utils/helpers/cn"
import { fieldKeyDown } from "@/lib/keys/ime"
import { STATUS_GROUPS, STATUS_GROUP_NAMES, ID_PREFIX, durationFormat, idPrefix, idText, ratingMax, takesOnePerson, type StatusGroup } from "@/lib/fieldTypes/kindsMore"
import { ownConfig } from "@/lib/tables/ownConfig"
import type { TableField } from "@/services/tableService"

/** A status option's group, picked from the three: its circle, and its name to a screen reader. */
export function StatusGroupSelect({ value, label, disabled, onChange }: { value: StatusGroup; label: string; disabled?: boolean; onChange: (g: StatusGroup) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as StatusGroup)} disabled={disabled}>
      <SelectTrigger dense aria-label={`${label}: ${STATUS_GROUP_NAMES[value]}`} className="h-7 w-auto shrink-0 gap-1 px-1.5 shadow-none" data-status-group-select="">
        <StatusGlyph status={GROUP_STATUS[value]} size={14} />
      </SelectTrigger>
      <SelectContent>
        {STATUS_GROUPS.map((g) => (
          <SelectItem key={g} value={g}>
            <span className="flex items-center gap-2">
              <StatusGlyph status={GROUP_STATUS[g]} size={14} />
              {STATUS_GROUP_NAMES[g]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}


/** A row of the column menu: its words on the left, its control on the right. */
function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-2.5 rounded-lg px-2 text-ui text-ink hover:bg-hover">
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {hint ? <span className="block text-meta text-ink-3">{hint}</span> : null}
      </span>
      {children}
    </div>
  )
}

/** An id's prefix, saved when it's left or on Enter; what it may be is said, not refused after. */
function PrefixInput({ field, onSave }: { field: TableField; onSave: (config: Record<string, unknown>) => void }) {
  const saved = idPrefix(field)
  const [text, setText] = React.useState(saved)
  React.useEffect(() => setText(saved), [saved])
  const valid = ID_PREFIX.test(text.trim())
  const commit = () => {
    const next = text.trim()
    if (next === saved || !valid) return
    onSave({ ...ownConfig(field), prefix: next || undefined })
  }
  return (
    <input
      value={text}
      maxLength={12}
      placeholder="None"
      aria-label="Prefix"
      aria-invalid={!valid || undefined}
      // Esc puts a changed prefix back, and the menu stays.
      data-escape-own={text !== saved ? "" : undefined}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={fieldKeyDown((e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          commit()
        } else if (e.key === "Escape" && text !== saved) {
          e.stopPropagation()
          setText(saved)
        }
      })}
      className={cn("field-surface h-7 w-24 rounded-md px-2 text-ui text-ink outline-none", !valid && "ring-1 ring-inset ring-destructive")}
    />
  )
}

/** The rows a field's kind adds to its column menu's main page; none for a kind with nothing of its own. */
export function KindSettingRows({ field, onSave }: { field: TableField; onSave: (config: Record<string, unknown>) => void }) {
  switch (field.type) {
    case "duration":
      return (
        <SettingRow label="Show seconds" hint={durationFormat(field) === "h:mm:ss" ? "1:30:15" : "1:30"}>
          <Switch
            checked={durationFormat(field) === "h:mm:ss"}
            aria-label="Show seconds"
            onCheckedChange={(on) => onSave({ ...ownConfig(field), format: on ? "h:mm:ss" : "h:mm" })}
          />
        </SettingRow>
      )
    case "rating":
      return (
        <SettingRow label="Out of">
          <Select value={String(ratingMax(field))} onValueChange={(v) => onSave({ ...ownConfig(field), max: Number(v) })}>
            <SelectTrigger dense aria-label="Most stars" className="h-7 w-auto gap-1 px-2 shadow-none">
              <span className="tabular-nums">{ratingMax(field)} stars</span>
            </SelectTrigger>
            <SelectContent>
              {[3, 5, 10].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} stars
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      )
    case "autonumber":
      return (
        <SettingRow label="Prefix" hint={`Rows read ${idText({ ...field, config: JSON.stringify({ prefix: idPrefix(field) }) }, 12)}`}>
          <PrefixInput field={field} onSave={onSave} />
        </SettingRow>
      )
    case "people":
      return (
        <SettingRow label="One person only">
          <Switch checked={takesOnePerson(field)} aria-label="One person only" onCheckedChange={(on) => onSave({ ...ownConfig(field), one: on || undefined })} />
        </SettingRow>
      )
    default:
      return null
  }
}

"use client"

import { FilterChip } from "@/components/task/filterChip"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
} from "@/components/ui/combobox"
import { cn } from "@/lib/utils/helpers/cn"
import { tagTone } from "@/lib/tags"
import { useProjectTags } from "@/components/tags/TagPicker"

/** The board's tag filter: show tasks carrying any of the chosen tags. */
export function TagFilter({ projectId, active, onChange }: { projectId: string; active: string[]; onChange: (tags: string[]) => void }) {
  const { tags } = useProjectTags(projectId)
  if (tags.length === 0 && active.length === 0) return null
  const on = (t: string) => active.some((a) => a.toLowerCase() === t.toLowerCase())
  return (
    <Combobox multiple>
      <ComboboxTrigger asChild>
        <FilterChip title="Tag" selected={active} />
      </ComboboxTrigger>
      <ComboboxContent label="Tag">
        <ComboboxInput placeholder="Tag" />
        <ComboboxList>
          <ComboboxEmpty>No such tag.</ComboboxEmpty>
          {tags.map((t) => (
            <ComboboxItem key={t.name} checked={on(t.name)} value={t.name} onSelect={() => onChange(on(t.name) ? active.filter((a) => a.toLowerCase() !== t.name.toLowerCase()) : [...active, t.name])}>
              <span className={cn("truncate rounded px-1.5 text-xs font-medium", tagTone(t.name))}>{t.name}</span>
              <span className="ml-auto pl-2 text-xs tabular-nums text-ink-3">{t.count}</span>
            </ComboboxItem>
          ))}
          {active.length > 0 && (
            <>
              <ComboboxSeparator />
              <ComboboxItem value="__clear__" keywords={["Clear tags"]} onSelect={() => onChange([])} className="justify-center text-center">
                Clear tags
              </ComboboxItem>
            </>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

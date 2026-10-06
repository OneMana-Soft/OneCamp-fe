"use client"

import { PlusCircledIcon } from "@radix-ui/react-icons"
import { Check } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils/helpers/cn"
import { tagTone } from "@/lib/tags"
import { useProjectTags } from "@/components/tags/TagPicker"

/** The board's tag filter: show tasks carrying any of the chosen tags. */
export function TagFilter({ projectId, active, onChange }: { projectId: string; active: string[]; onChange: (tags: string[]) => void }) {
  const { tags } = useProjectTags(projectId)
  if (tags.length === 0 && active.length === 0) return null
  const on = (t: string) => active.some((a) => a.toLowerCase() === t.toLowerCase())
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <PlusCircledIcon className="mr-2 h-4 w-4" />
          Tag
          {active.length > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <span className="rounded-sm bg-secondary px-1 text-xs font-normal">{active.length > 1 ? `${active.length} selected` : active[0]}</span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Tag" />
          <CommandList>
            <CommandEmpty>No such tag.</CommandEmpty>
            <CommandGroup>
              {tags.map((t) => (
                <CommandItem key={t.name} value={t.name} onSelect={() => onChange(on(t.name) ? active.filter((a) => a.toLowerCase() !== t.name.toLowerCase()) : [...active, t.name])}>
                  <span className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", on(t.name) ? "bg-primary text-primary-foreground" : "opacity-50")}>
                    {on(t.name) && <Check className="h-3 w-3" />}
                  </span>
                  <span className={cn("truncate rounded px-1.5 text-xs font-medium", tagTone(t.name))}>{t.name}</span>
                  <span className="ml-auto pl-2 text-xs tabular-nums text-muted-foreground">{t.count}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {active.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange([])} className="justify-center text-center">
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

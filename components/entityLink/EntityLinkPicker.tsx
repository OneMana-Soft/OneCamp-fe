"use client"

// EntityLinkPicker: a compact, Notion-style search popover to find and link a
// doc or board to a task/project. Backed by the existing access-scoped unified
// search (so users only see what they can open), debounced to keep it light.

import * as React from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils/helpers/cn"
import { useGlobalSearch } from "@/services/searchService"
import { FileText, LayoutDashboard, Plus, Loader2, Check, Search } from "@/lib/icons"
import type { LinkRefType } from "@/services/entityLinkService"

interface PickerItem {
  refType: LinkRefType
  refUUID: string
  title: string
}

interface EntityLinkPickerProps {
  onPick: (refType: LinkRefType, refUUID: string, title: string) => void
  isLinked: (refType: LinkRefType, refUUID: string) => boolean
  disabled?: boolean
}

export function EntityLinkPicker({ onPick, isLinked, disabled }: EntityLinkPickerProps) {
  const { search } = useGlobalSearch()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [items, setItems] = React.useState<PickerItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqId = React.useRef(0)

  React.useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (timer.current) clearTimeout(timer.current)
    if (!q) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    const myReq = ++reqId.current
    timer.current = setTimeout(async () => {
      const res = await search(q)
      if (myReq !== reqId.current) return // a newer query superseded this one
      const mapped: PickerItem[] = []
      for (const r of res?.page ?? []) {
        if (r.type === "doc" && r.doc?.doc_uuid) {
          mapped.push({ refType: "doc", refUUID: r.doc.doc_uuid, title: r.doc.doc_title || "Untitled doc" })
        } else if (r.type === "board" && r.board?.board_uuid) {
          mapped.push({ refType: "board", refUUID: r.board.board_uuid, title: r.board.board_title || "Untitled board" })
        }
        if (mapped.length >= 8) break
      }
      setItems(mapped)
      setLoading(false)
    }, 180)
  }, [query, open, search])

  React.useEffect(() => {
    if (!open) {
      setQuery("")
      setItems([])
    }
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-8 gap-1.5 rounded-lg border-dashed text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Link doc or board
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[20rem] p-0 overflow-hidden">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search docs and boards..."
            className="h-8 border-0 p-0 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-[16rem] overflow-y-auto p-1">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching...
            </div>
          )}
          {!loading && query.trim() && items.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">No docs or boards found</div>
          )}
          {!loading && !query.trim() && (
            <div className="py-6 text-center text-xs text-muted-foreground">Type to search docs and boards</div>
          )}
          {!loading &&
            items.map((item) => {
              const linked = isLinked(item.refType, item.refUUID)
              const Icon = item.refType === "doc" ? FileText : LayoutDashboard
              return (
                <button
                  key={`${item.refType}-${item.refUUID}`}
                  type="button"
                  disabled={linked}
                  onClick={() => {
                    onPick(item.refType, item.refUUID, item.title)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors",
                    linked ? "cursor-default opacity-60" : "hover:bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-md",
                      item.refType === "doc" ? "bg-emerald-500/10 text-emerald-600" : "bg-sky-500/10 text-sky-600",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  {linked && <Check className="h-4 w-4 shrink-0 text-emerald-500" />}
                </button>
              )
            })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default EntityLinkPicker

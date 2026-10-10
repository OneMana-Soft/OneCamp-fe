"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { RefreshCw, Search } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { PostEndpointUrl } from "@/services/endPoints"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { cn } from "@/lib/utils/helpers/cn"
import { shortDateTime } from "@/lib/utils/date/shortDate"
import { archiveProblem } from "@/components/admin/archiveProblem"
import { ARCHIVE_ENTITY_ORDER, archiveEntity } from "@/components/admin/archiveEntities"

interface ArchivedItem {
  id: string
  name: string
  archived_at: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}


const PAGE = 50

const itemCount = (n: number) => `${n.toLocaleString("en")} ${n === 1 ? "item" : "items"}`

export default function ArchiveRestoreDialog({ open, onOpenChange, onSuccess }: Props) {
  const { toast } = useToast()
  const [entityType, setEntityType] = useState("posts")
  const [list, setList] = useState<ArchivedItem[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  // A failed first page is said in place of the list, with a way to try again.
  // It used to read "No recently archived channel posts found", a claim about
  // the workspace made on behalf of a request that never answered.
  const [loadFailed, setLoadFailed] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const [restoring, setRestoring] = useState(false)
  // Why a restore was refused, said in the dialog beside the selection it is about.
  const [problem, setProblem] = useState("")

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase()
    return list.filter((i) => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q))
  }, [list, searchQuery])

  const fetchItems = useCallback(
    async (pg: number, append: boolean) => {
      setLoading(true)
      if (append) setMoreFailed(false)
      else setLoadFailed(false)
      try {
        const res = await axiosInstance.get(`/admin/archive/recent-items/${entityType}?limit=${PAGE}&offset=${pg * PAGE}`)
        const newItems: ArchivedItem[] = res.data?.items || []
        const all = typeof res.data?.total === "number" ? res.data.total : null
        setList((prev) => (append ? [...prev, ...newItems] : newItems))
        setTotal(all)
        setHasMore(all !== null ? (pg + 1) * PAGE < all : newItems.length === PAGE)
        setPage(pg)
      } catch {
        if (append) setMoreFailed(true)
        else {
          setList([])
          setLoadFailed(true)
        }
      } finally {
        setLoading(false)
      }
    },
    [entityType],
  )

  useEffect(() => {
    if (open) {
      setSelected(new Set())
      setSearchQuery("")
      setProblem("")
      setPage(0)
      fetchItems(0, false)
    }
  }, [open, entityType, fetchItems])

  // Set, not toggle: a box reports what it now is, so a click that reaches the
  // box and its row together can't tick it and untick it in the same moment.
  const setItem = (id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const allOn = filteredItems.length > 0 && filteredItems.every((i) => selected.has(i.id))
  const setAll = (on: boolean) => setSelected(on ? new Set(filteredItems.map((i) => i.id)) : new Set())

  const handleSubmit = async () => {
    const ids = [...selected]
    if (ids.length === 0) return
    setRestoring(true)
    setProblem("")
    try {
      const res = await axiosInstance.post(
        PostEndpointUrl.RestoreArchiveItems,
        { entity_type: entityType, entity_ids: ids },
        OWN_ERRORS,
      )
      const count = typeof res.data?.count === "number" ? res.data.count : ids.length
      toast({ title: `Restored ${itemCount(count)}`, description: "They are back where they were." })
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      setProblem(archiveProblem(err, "Couldn't restore them. Try again in a moment."))
    } finally {
      setRestoring(false)
    }
  }

  const label = archiveEntity(entityType).label.toLowerCase()

  return (
    <Dialog open={open} onOpenChange={(o) => !restoring && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Restore archived items</DialogTitle>
          <DialogDescription>
            Pick what to bring back. To bring back everything one archive run took, use Undo on that run in the
            archive history.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="restore-kind">What to restore</Label>
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger id="restore-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ARCHIVE_ENTITY_ORDER.map((key) => (
                  <SelectItem key={key} value={key}>
                    {archiveEntity(key).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(entityType === "posts" || entityType === "chats") && (
              <p className="text-xs text-muted-foreground">
                Restoring also brings back what OneCamp AI remembered from them, so it shows up again in AI search
                and briefings.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  aria-label="Search archived items"
                  placeholder="Search by name…"
                  className="h-8 pl-8 md:text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {/* The search field's height beside it: 44px on a phone, 32px from md up. */}
              <Button variant="ghost" size="sm" className="h-11 gap-1.5 px-2 md:h-8" onClick={() => fetchItems(0, false)} disabled={loading}>
                <RefreshCw className={cn(loading && "animate-spin")} />
                Refresh
              </Button>
            </div>

            {!loadFailed && filteredItems.length > 0 && (
              <div className="flex items-center gap-2 px-3">
                <Checkbox id="restore-all" checked={allOn} onCheckedChange={(v) => setAll(v === true)} aria-label="Select all" />
                <Label htmlFor="restore-all" className="cursor-pointer text-sm font-normal text-muted-foreground">
                  {selected.size === 0 ? "Select all" : `${selected.size.toLocaleString("en")} selected`}
                </Label>
              </div>
            )}

            <div className="max-h-56 overflow-y-auto rounded-md border border-border">
              {loading && list.length === 0 ? (
                // The rows' own shape (a box, a name, when it was archived) at
                // their padding, where it was the generic skeleton rows.
                <ul role="status" aria-label={`Loading archived ${label}`} className="divide-y divide-border">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <li key={i} aria-hidden="true" className="flex items-center gap-3 px-3 py-2">
                      <Skeleton className="size-4 shrink-0 rounded-sm" />
                      <span className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className={i % 2 === 0 ? "h-3.5 w-40" : "h-3.5 w-28"} />
                        <Skeleton className="h-3 w-32" />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : loadFailed ? (
                <ErrorState compact subject={`the archived ${label}`} onRetry={() => fetchItems(0, false)} retrying={loading} />
              ) : filteredItems.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {searchQuery.trim() ? "Nothing archived matches that." : `No ${label} have been archived recently.`}
                </p>
              ) : (
                <ul aria-label={`Archived ${label}`} className="divide-y divide-border">
                  {filteredItems.map((item) => {
                    const on = selected.has(item.id)
                    return (
                      <li key={item.id}>
                        {/* One label around the box and the words: a click on either
                            ticks the box once, by the label's own behaviour. */}
                        <label
                          className={cn(
                            "flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-highlight",
                            on && "bg-primary/5",
                          )}
                        >
                          <Checkbox checked={on} onCheckedChange={(v) => setItem(item.id, v === true)} aria-label={item.name} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{item.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              Archived {shortDateTime(new Date(item.archived_at))}
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
              {!loadFailed && hasMore && !searchQuery.trim() && list.length > 0 && (
                <div className="flex flex-col items-center gap-1 border-t border-border p-2">
                  {moreFailed && (
                    <p role="alert" className="text-xs text-danger-ink">
                      Couldn&apos;t load more. Try again.
                    </p>
                  )}
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => fetchItems(page + 1, true)} disabled={loading}>
                    {loading ? "Loading…" : total !== null ? `Show more (${(total - list.length).toLocaleString("en")} left)` : "Show more"}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {problem && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-danger-ink">
              {problem}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={restoring}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={restoring || selected.size === 0}>
            {restoring && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
            {restoring ? "Restoring…" : selected.size === 0 ? "Restore" : `Restore ${itemCount(selected.size)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

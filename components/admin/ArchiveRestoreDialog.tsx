"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RefreshCw, Undo2, Search } from "@/lib/icons";
import { usePost } from "@/hooks/usePost"
import { useToast } from "@/hooks/use-toast"
import { PostEndpointUrl } from "@/services/endPoints"
import axiosInstance from "@/lib/axiosInstance"

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

const ENTITY_LABELS: Record<string, string> = {
  posts: "Channel Posts",
  chats: "Direct Messages",
  tasks: "Tasks",
  docs: "Documents",
  recordings: "Recordings",
  attachments: "Attachments",
}

export default function ArchiveRestoreDialog({ open, onOpenChange, onSuccess }: Props) {
  const post = usePost()
  const { toast } = useToast()
  const [entityType, setEntityType] = useState("posts")
  const [items, setItems] = useState<ArchivedItem[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items
    const q = searchQuery.toLowerCase()
    return items.filter(i => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q))
  }, [items, searchQuery])

  const fetchItems = useCallback(async (pg: number, append: boolean) => {
    setLoading(true)
    try {
      const res = await axiosInstance.get(`/admin/archive/recent-items/${entityType}?limit=50&offset=${pg * 50}`)
      const newItems = res.data?.items || []
      setItems(prev => append ? [...prev, ...newItems] : newItems)
      setHasMore(newItems.length === 50)
      setPage(pg)
    } catch {
      if (!append) setItems([])
    } finally {
      setLoading(false)
    }
  }, [entityType])

  useEffect(() => {
    if (open) {
      setSelected(new Set())
      setSearchQuery("")
      setPage(0)
      fetchItems(0, false)
    }
  }, [open, entityType, fetchItems])

  const loadMore = () => {
    fetchItems(page + 1, true)
  }

  const toggleItem = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === filteredItems.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filteredItems.map(i => i.id)))
    }
  }

  const handleSubmit = async () => {
    const ids = [...selected]
    if (ids.length === 0) {
      toast({ title: "Nothing selected", description: "Select items from the list to restore", variant: "destructive" })
      return
    }
    try {
      await post.makeRequest({
        apiEndpoint: PostEndpointUrl.RestoreArchiveItems,
        payload: { entity_type: entityType, entity_ids: ids },
        showToast: true,
      })
      onSuccess()
      onOpenChange(false)
    } catch {
      // handled by usePost
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Restore Archived Items</DialogTitle>
          <DialogDescription>
            To undo an entire archive job, use the <Undo2 className="h-3 w-3 inline" /> <strong>Undo</strong> button on the completed job in Job History.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Entity Type</Label>
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ENTITY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(entityType === "posts" || entityType === "chats") && (
              <p className="text-xs text-muted-foreground">
                Restoring also revives any AI memory that was archived with these
                items, so it surfaces again in AI search and briefings.
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by name or ID..."
                  className="w-full h-8 pl-8 pr-3 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => fetchItems(0, false)} disabled={loading}>
                <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />Refresh
              </Button>
            </div>

            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={filteredItems.length > 0 && selected.size === filteredItems.length}
                  onCheckedChange={toggleAll}
                />
                <Label className="text-sm cursor-pointer" onClick={toggleAll}>
                  {selected.size === 0 ? "Select All" : `${selected.size} selected`}
                </Label>
              </div>
            </div>

            <div className="border rounded-md max-h-52 overflow-y-auto">
              {loading ? (
                <div className="text-sm text-muted-foreground animate-pulse p-4 text-center">Loading archived items...</div>
              ) : filteredItems.length === 0 ? (
                <div className="text-sm text-muted-foreground p-4 text-center">
                  {searchQuery.trim() ? "No items match your search." : `No recently archived ${ENTITY_LABELS[entityType]?.toLowerCase() || entityType} found.`}
                </div>
              ) : (
                filteredItems.map(item => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 px-3 py-2 hover:bg-muted/30 cursor-pointer border-b last:border-0 transition-colors ${selected.has(item.id) ? "bg-primary/5" : ""}`}
                    onClick={() => toggleItem(item.id)}
                  >
                    <Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggleItem(item.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{new Date(item.archived_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))
              )}
              {hasMore && !loading && !searchQuery.trim() && (
                <div className="p-2 text-center">
                  <Button variant="ghost" size="sm" className="text-xs" onClick={loadMore}>Load More</Button>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={post.isSubmitting || selected.size === 0}>
            {post.isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
            Restore ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import * as React from "react"
import { useHandoff } from "@/hooks/useHandoff"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CommandList, CommandTile, type CommandListHandle, type CommandListItem } from "@/components/ui/CommandList"
import { DocIcon } from "@/components/docEditor/DocIcon"
import { useDebounce } from "@/hooks/useDebounce"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { listKey } from "@/services/docGraphService"
import type { DocList } from "@/types/docGraph"
import { searchReferences } from "../reference-mention/referenceMentionList"
import { peekPick, releasePick, PICK_PAGE } from "./pick"

const RECENT = listKey("recent", { limit: 8 })

/**
 * Which page to link to (docs C1, "/link to page"): the pages you opened last,
 * and as you type, the pages called that which you may open (global search,
 * as the reader). ↑ ↓ and Enter pick. A sheet on a phone.
 */
export default function PagePickerDialog({ docId, onClose }: { docId: string; onClose(): void }) {
  const question = useHandoff(() => peekPick(PICK_PAGE), releasePick)
  const recent = useFetch<{ data?: DocList }>(question ? RECENT : "", undefined, undefined, OWN_ERRORS).data?.data?.docs ?? []
  const [query, setQuery] = React.useState("")
  const [found, setFound] = React.useState<CommandListItem[] | null>(null)
  const [input, setInput] = React.useState<HTMLInputElement | null>(null)
  const list = React.useRef<CommandListHandle>(null)
  const answered = React.useRef(false)

  React.useEffect(() => () => void (!answered.current && question?.answer(null)), [question])
  React.useEffect(() => {
    if (!question) onClose()
  }, [question, onClose])

  // What's typed, once the typing pauses (the "+" menu's 180 ms): the pages called that.
  const typed = useDebounce(query.trim(), 180)
  React.useEffect(() => {
    if (!typed) return setFound(null)
    let live = true
    void searchReferences(typed, ["doc"]).then((hits) => {
      if (live) setFound(hits.map((h) => ({ id: h.routeId, label: h.label, meta: h.subtitle, tile: <CommandTile><DocIcon size={16} /></CommandTile> })))
    })
    return () => {
      live = false
    }
  }, [typed])

  const items: CommandListItem[] =
    found ??
    recent
      .filter((d) => d.doc_uuid !== docId)
      .map((d) => ({ id: d.doc_uuid, label: d.doc_title || "Untitled", group: "Recent", tile: <CommandTile><DocIcon icon={d.doc_icon} size={16} /></CommandTile> }))

  const choose = (item: CommandListItem) => {
    if (!question) return
    answered.current = true
    question.answer({ id: item.id, name: typeof item.label === "string" ? item.label : "" })
    onClose()
  }

  return (
    <ResponsiveDialog
      title="Link to a page"
      description="The link shows the page's title and icon as they change."
      onClose={onClose}
      footer={<Button variant="ghost" onClick={onClose}>Cancel</Button>}
    >
      <div className="flex flex-col gap-2 pb-2" data-page-picker="">
        <Input
          ref={setInput}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (list.current?.onKeyDown(e)) e.preventDefault()
          }}
          placeholder="Find a page"
          aria-label="Find a page"
        />
        <CommandList
          ref={list}
          comboboxFor={input}
          label="Pages"
          maxHeight={8 * 36}
          query={query}
          items={items}
          onSelect={choose}
          empty={<span className="text-ink-3">{query.trim() ? (found ? `No page called “${query.trim()}”` : "Looking…") : "Type to find a page"}</span>}
        />
      </div>
    </ResponsiveDialog>
  )
}

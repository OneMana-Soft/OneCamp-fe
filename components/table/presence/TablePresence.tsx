"use client"

// Who else is on this table, and where (tables A7, Live Rows #65): their faces
// in the toolbar, and their cells marked on the grid (lib/tables/presence).
// Clicking a face goes to that person's cell, as Sheets does.
// This page says where it is when it opens, every 20 seconds, and when the
// focus moves to another cell or starts or stops editing one; it says it left
// when it closes. Others' moves come on the table's presence topic. A chunk of
// its own (tablePresencePart), so the table's first screen carries none of it.

import * as React from "react"
import { ThreadParticipants, type ThreadParticipant } from "@/components/message/threadParticipants"
import { useMqttTopic } from "@/hooks/useMqttTopic"
import { useMyId } from "@/hooks/useMyId"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { presenceCss, type TableHere } from "@/lib/tables/presence"
import { TablesPost } from "@/services/endpoints/tables"

/** How often an open table says it's still there (the server forgets after 45 s). */
const HEARTBEAT_MS = 20_000
/** A burst of moves (arrowing across cells) is said once it settles. */
const SETTLE_MS = 150

interface Where {
  row_id?: string
  field_id?: string
  editing?: boolean
}

/** Says where I am on a table (gone: that I left) and answers who is on it now. */
async function say(tableId: string, at: Where & { gone?: boolean }): Promise<TableHere[]> {
  const res = await axiosInstance.post(`${TablesPost.SetTablePresence}/${tableId}/presence`, at, OWN_ERRORS)
  return (res.data?.data as TableHere[] | null) ?? []
}

/** Where the focus is on the grid: the cell's row and field, and whether it's being typed in. */
export function focusedCell(el: Element | null): Where {
  const td = el?.closest?.("td[data-field]")
  const tr = td?.closest("tr[data-row]")
  if (!(td instanceof HTMLElement) || !(tr instanceof HTMLElement)) return {}
  const typing = el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !el.readOnly && el.type !== "checkbox") || (el instanceof HTMLElement && el.isContentEditable)
  return { row_id: tr.dataset.row, field_id: td.dataset.field, editing: typing || undefined }
}

const sameWhere = (a: Where, b: Where) => a.row_id === b.row_id && a.field_id === b.field_id && !!a.editing === !!b.editing

export default function TablePresence({
  tableId,
  topic,
  onGoTo,
}: {
  tableId: string
  topic: string
  /** Goes to a person's cell (their face was clicked). */
  onGoTo?: (row: string, field: string) => void
}) {
  const me = useMyId()
  const [people, setPeople] = React.useState<TableHere[]>([])
  const at = React.useRef<Where>({})

  const tell = React.useCallback(() => {
    void say(tableId, at.current)
      .then(setPeople)
      // A missed beat is the next one's to say.
      .catch(() => {})
  }, [tableId])

  // Here when it opens, every 20 s while open, and gone when it closes.
  React.useEffect(() => {
    tell()
    const beat = window.setInterval(tell, HEARTBEAT_MS)
    return () => {
      window.clearInterval(beat)
      // Unsaid, the server ends a presence that stops beating.
      void say(tableId, { gone: true }).catch(() => {})
    }
  }, [tableId, tell])

  // Where the focus is: said once a burst of moves settles.
  React.useEffect(() => {
    let timer: number | undefined
    const moved = () => {
      const next = focusedCell(document.activeElement)
      if (sameWhere(next, at.current)) return
      at.current = next
      window.clearTimeout(timer)
      timer = window.setTimeout(tell, SETTLE_MS)
    }
    // A focus that leaves is read once it lands (focusout comes first).
    const left = () => window.setTimeout(moved, 0)
    document.addEventListener("focusin", moved)
    document.addEventListener("focusout", left)
    document.addEventListener("input", moved)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("focusin", moved)
      document.removeEventListener("focusout", left)
      document.removeEventListener("input", moved)
    }
  }, [tell])

  const heard = React.useCallback((message: string) => {
    try {
      const data = (JSON.parse(message) as { data?: { action?: string; people?: TableHere[] } }).data
      if (data?.action === "presence" && Array.isArray(data.people)) setPeople(data.people)
    } catch {
      // not one of ours
    }
  }, [])
  useMqttTopic({ topic, onMessage: heard })

  const others = React.useMemo(() => people.filter((p) => p.user !== me), [people, me])
  const css = React.useMemo(() => presenceCss(others), [others])
  const actionFor = React.useCallback(
    (face: ThreadParticipant) => {
      const p = others.find((o) => o.user === face.uuid)
      const row = p?.row
      const field = p?.field
      if (!onGoTo || !row || !field) return null
      return { label: `Go to ${face.name}'s cell`, run: () => onGoTo(row, field) }
    },
    [others, onGoTo],
  )
  if (others.length === 0) return null
  return (
    <span data-table-presence="" className="flex items-center">
      {css ? <style>{css}</style> : null}
      <ThreadParticipants participants={others.map((p) => ({ uuid: p.user, name: p.name || "Someone" }))} maxShown={4} size={24} actionFor={actionFor} />
    </span>
  )
}

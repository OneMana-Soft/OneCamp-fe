"use client"

// LinkedItemsSection: shows the docs and boards linked to a task or project,
// with an inline picker to add more and a hover affordance to unlink. Reads
// once on open; add/remove update from the mutation response (no refetch).

import * as React from "react"
import { useRouter } from "next/navigation"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils/helpers/cn"
import { FileText, LayoutDashboard, X, Lock, Loader2 } from "@/lib/icons"
import { useEntityLinks, type LinkSourceType } from "@/services/entityLinkService"
import { EntityLinkPicker } from "@/components/entityLink/EntityLinkPicker"

interface LinkedItemsSectionProps {
  sourceType: LinkSourceType
  sourceUUID: string
  canEdit: boolean
}

export function LinkedItemsSection({ sourceType, sourceUUID, canEdit }: LinkedItemsSectionProps) {
  const router = useRouter()
  const { docs, boards, isLoading, mutating, forbidden, addLink, removeLink, hasLink } = useEntityLinks(sourceType, sourceUUID)

  // The backend is the source of truth for authorisation: if it rejects the
  // read (not a member), never show edit affordances even if the caller passed
  // canEdit optimistically.
  const effectiveCanEdit = canEdit && !forbidden

  const total = docs.length + boards.length

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Label className="inline">Linked</Label>
        {mutating && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex flex-col gap-1.5">
        {docs.map((d) => {
          const locked = d.doc_private && !(d.doc_read_access && d.doc_read_access > 0)
          return (
            <LinkedChip
              key={`doc-${d.doc_uuid}`}
              icon={FileText}
              accent="emerald"
              title={d.doc_title || "Untitled doc"}
              locked={!!locked}
              canEdit={effectiveCanEdit}
              onOpen={() => !locked && router.push(`/app/doc/${d.doc_uuid}`)}
              onRemove={() => removeLink("doc", d.doc_uuid)}
            />
          )
        })}
        {boards.map((b) => {
          const locked = b.board_private && !(b.board_read_access && b.board_read_access > 0)
          return (
            <LinkedChip
              key={`board-${b.board_uuid}`}
              icon={LayoutDashboard}
              accent="sky"
              title={b.board_title || "Untitled board"}
              locked={!!locked}
              canEdit={effectiveCanEdit}
              onOpen={() => !locked && router.push(`/app/board/${b.board_uuid}`)}
              onRemove={() => removeLink("board", b.board_uuid)}
            />
          )
        })}

        {total === 0 && !isLoading && (
          <p className="text-xs text-muted-foreground">
            {effectiveCanEdit ? "Link a doc or board for quick access." : "No linked docs or boards."}
          </p>
        )}
        {isLoading && total === 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...
          </div>
        )}

        {effectiveCanEdit && (
          <div className="mt-1">
            <EntityLinkPicker
              onPick={(refType, refUUID) => addLink(refType, refUUID)}
              isLinked={hasLink}
              disabled={mutating}
            />
          </div>
        )}
      </div>
    </div>
  )
}

interface LinkedChipProps {
  icon: React.ComponentType<{ className?: string }>
  accent: "emerald" | "sky"
  title: string
  locked: boolean
  canEdit: boolean
  onOpen: () => void
  onRemove: () => void
}

function LinkedChip({ icon: Icon, accent, title, locked, canEdit, onOpen, onRemove }: LinkedChipProps) {
  const accentClass = accent === "emerald" ? "bg-emerald-500/10 text-emerald-600" : "bg-sky-500/10 text-sky-600"
  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 rounded-lg border bg-background px-2.5 py-2 transition-colors",
        locked ? "opacity-70" : "hover:border-border hover:bg-accent/40",
      )}
    >
      <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md", accentClass)}>
        <Icon className="h-4 w-4" />
      </span>
      <button
        type="button"
        onClick={onOpen}
        disabled={locked}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
      >
        <span className="truncate">{title}</span>
        {locked && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
      </button>
      {canEdit && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Unlink"
          className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

export default LinkedItemsSection

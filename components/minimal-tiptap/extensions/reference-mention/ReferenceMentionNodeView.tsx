"use client"

import { NodeViewWrapper, NodeViewProps } from "@tiptap/react"
import React from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils/helpers/cn"
import {
  decodeReferenceId,
  buildReferenceHref,
  referenceIcon,
  referenceAccentClass,
  referenceTypeLabel,
  LIVE_REFERENCE_TYPES,
  type ReferenceType,
} from "./referenceTypes"
import { useGuestReader } from "@/components/minimal-tiptap/guestReader"

// A page, task or project is drawn live (Live Entity Chips, docs C1): its name
// and state now, read as the reader, and "No access" for what they can't
// open. Its code loads the first time one is drawn.
const EntityChip = React.lazy(() => import("@/components/liveEntity/EntityChip").then((m) => ({ default: m.EntityChip })))

// Renders a doc/board/task/project/channel reference as an inline chip. The
// same component is used inside the composer and inside displayed messages
// (read-only editor), so a chip is always tappable and navigates to the entity.
const ReferenceMentionNodeView: React.FC<NodeViewProps> = (props) => {
  const router = useRouter()
  const { id, label } = props.node.attrs as { id: string; label: string }

  const decoded = decodeReferenceId(id)
  const refType: ReferenceType = decoded?.refType ?? "doc"
  const routeId = decoded?.routeId ?? ""
  const Icon = referenceIcon(refType)
  // A guest can't open the workspace's docs, boards or channels: the chip
  // names the thing and goes nowhere.
  const guest = useGuestReader()

  if (!guest && LIVE_REFERENCE_TYPES.has(refType) && routeId) {
    return (
      <NodeViewWrapper as="span" className="inline">
        <React.Suspense
          fallback={
            <span contentEditable={false} className="mx-px inline-flex items-baseline gap-1 rounded-[5px] bg-hover px-1 align-baseline text-ink-3 [&_svg]:self-center">
              <Icon className="size-3.5" aria-hidden="true" />
              <span aria-hidden="true" className="inline-block h-[0.7em] w-14 animate-pulse rounded-sm bg-press motion-reduce:animate-none" />
            </span>
          }
        >
          <EntityChip kind={refType} id={routeId} selected={props.selected} />
        </React.Suspense>
      </NodeViewWrapper>
    )
  }

  if (guest) {
    // A guest may open none of the workspace's things: a live one says only what it is, never a name kept with it.
    const words = LIVE_REFERENCE_TYPES.has(refType) ? referenceTypeLabel(refType) : label
    return (
      <NodeViewWrapper className="inline-block align-baseline">
        <span
          contentEditable={false}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 mx-0.5 text-sm font-medium select-none align-baseline max-w-[16rem]",
            referenceAccentClass(refType),
          )}
          data-id={id}
          data-type={props.node.type.name}
          title={words}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{words}</span>
        </span>
      </NodeViewWrapper>
    )
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const href = buildReferenceHref(refType, routeId)
    if (href) router.push(href)
  }

  return (
    <NodeViewWrapper className="inline-block align-baseline">
      <span
        onClick={handleClick}
        contentEditable={false}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            const href = buildReferenceHref(refType, routeId)
            if (href) router.push(href)
          }
        }}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 mx-0.5 text-sm font-medium cursor-pointer transition-colors select-none align-baseline max-w-[16rem]",
          referenceAccentClass(refType),
          props.selected && "ring-2 ring-primary ring-offset-1",
        )}
        data-id={id}
        data-label={label}
        data-type={props.node.type.name}
        title={label}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
    </NodeViewWrapper>
  )
}

export default ReferenceMentionNodeView

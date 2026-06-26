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
  type ReferenceType,
} from "./referenceTypes"

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

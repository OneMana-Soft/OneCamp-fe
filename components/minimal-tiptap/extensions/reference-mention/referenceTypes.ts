"use client"

// Shared types/helpers for the non-user mention triggers:
//   #  -> channels
//   +  -> work items (doc / board / task / project)
//
// Both render as clickable chips inside the composer AND inside displayed
// messages (messages are a read-only instance of the same Tiptap editor), so a
// single node view + a single suggestion list back every reference type. This
// keeps the flow consistent and Notion-clean across every chat surface.

import type { LucideIcon } from "lucide-react"
import { Hash, FileText, LayoutDashboard, CheckSquare, FolderKanban, Link2 } from "@/lib/icons"

export type ReferenceType = "channel" | "doc" | "board" | "task" | "project"

export interface ReferenceItem {
  /** Stable id used to build the navigation route (see buildReferenceHref). */
  routeId: string
  /** Human label shown in the chip. */
  label: string
  /** Entity kind, drives icon + route + accent. */
  refType: ReferenceType
  /** Optional secondary line in the picker (e.g. "Project", assignee). */
  subtitle?: string
}

// The chip stores everything it needs to render + navigate inside the Tiptap
// node `id` attribute, encoded as "<refType>:<routeId>". Encoding the type in
// the id (rather than a separate data attribute) keeps the chip robust even if
// a render path strips non-allowlisted data-* attributes.
export function encodeReferenceId(refType: ReferenceType, routeId: string): string {
  return `${refType}:${routeId}`
}

export function decodeReferenceId(id: string): { refType: ReferenceType; routeId: string } | null {
  if (!id) return null
  const idx = id.indexOf(":")
  if (idx <= 0) return null
  const refType = id.slice(0, idx) as ReferenceType
  const routeId = id.slice(idx + 1)
  if (!routeId) return null
  return { refType, routeId }
}

export function buildReferenceHref(refType: ReferenceType, routeId: string): string | null {
  switch (refType) {
    case "channel":
      return `/app/channel/${routeId}`
    case "doc":
      return `/app/doc/${routeId}`
    case "board":
      return `/app/board/${routeId}`
    case "task":
      return `/app/task/${routeId}`
    case "project":
      return `/app/project/${routeId}`
    default:
      return null
  }
}

export function referenceIcon(refType: ReferenceType): LucideIcon {
  switch (refType) {
    case "channel":
      return Hash
    case "doc":
      return FileText
    case "board":
      return LayoutDashboard
    case "task":
      return CheckSquare
    case "project":
      return FolderKanban
    default:
      return Link2
  }
}

// One chip for every type. They were colour-coded (orange channels, emerald
// docs, sky boards, blue tasks, violet projects), so a message citing three
// things read as a rainbow; the icon beside the label already says which kind
// it is. The accent stays reserved for what is new or needs you (DESIGN.md).
export function referenceAccentClass(_refType: ReferenceType): string {
  return "bg-foreground/[0.05] text-foreground hover:bg-foreground/[0.09] [&_svg]:text-muted-foreground"
}

export function referenceTypeLabel(refType: ReferenceType): string {
  switch (refType) {
    case "channel":
      return "Channel"
    case "doc":
      return "Doc"
    case "board":
      return "Board"
    case "task":
      return "Task"
    case "project":
      return "Project"
    default:
      return ""
  }
}

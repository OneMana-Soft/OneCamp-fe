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

/** The kinds a chip draws live, as each reader may see them (Live Entity Chips). */
export const LIVE_REFERENCE_TYPES: ReadonlySet<ReferenceType> = new Set(["doc", "task", "project"])

/** Whether an editor is a doc's: only a doc's carries connected work's "@" part (mention-list/mentionInDoc). */
export const isDocEditor = (editor: { storage: object }) => "mentionInDoc" in editor.storage

/**
 * The label a chip keeps. In a doc, a doc's, task's or project's chip keeps
 * only what it is ("Doc"): its name is read live, as each reader may see it,
 * and a name kept in the doc would reach readers who may not open the thing,
 * by copy, export and the guest's page. Elsewhere, and for a channel or a
 * board, the name it was picked by.
 */
export function keptLabel(item: Pick<ReferenceItem, "refType" | "label">, inDoc: boolean): string {
  return inDoc && LIVE_REFERENCE_TYPES.has(item.refType) ? referenceTypeLabel(item.refType) : item.label
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

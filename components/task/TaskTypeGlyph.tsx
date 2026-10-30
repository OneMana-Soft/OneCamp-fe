"use client"

import {
  BarChart3,
  BookOpen,
  FileText,
  Flag,
  Inbox,
  Layers,
  Lightbulb,
  Megaphone,
  Rocket,
  Shield,
  Target,
  Wrench,
} from "@/lib/icons"
import { Bug, Diamond, FlaskConical, Palette, SquareCheck, Stamp } from "@/lib/workIcons"
import { cn } from "@/lib/utils/helpers/cn"
import type { TaskWorkType } from "@/types/task"

/**
 * Each icon a type may take, by its server name (business/WorkTaxonomy
 * Icons). Monochrome: a type is a kind of work, not an identity (DESIGN_V3
 * §3.5). Never round, as round marks mean status (STEP4 #8).
 */
export const TYPE_ICONS = {
  task: SquareCheck,
  bug: Bug,
  feature: Lightbulb,
  milestone: Diamond,
  approval: Stamp,
  request: Inbox,
  flag: Flag,
  book: BookOpen,
  wrench: Wrench,
  shield: Shield,
  palette: Palette,
  megaphone: Megaphone,
  flask: FlaskConical,
  layers: Layers,
  target: Target,
  rocket: Rocket,
  file: FileText,
  chart: BarChart3,
} as const

export type TypeIcon = keyof typeof TYPE_ICONS

/** A type's glyph, named for screen readers ("Bug"). A name it doesn't know draws the plain task's. */
export default function TaskTypeGlyph({ type, className }: { type: Pick<TaskWorkType, "icon" | "name">; className?: string }) {
  const Icon = TYPE_ICONS[type.icon as TypeIcon] ?? SquareCheck
  return (
    <span role="img" aria-label={type.name} title={type.name} className={cn("inline-flex size-3.5 shrink-0", className)}>
      <Icon aria-hidden className="size-full" strokeWidth={2.1} />
    </span>
  )
}

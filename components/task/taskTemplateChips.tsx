"use client"

import * as React from "react"
import type { FieldAnswer, TemplateChipProps, TypeChipProps } from "@/components/task/taskTemplateParts"
import { ChevronDown, LayoutTemplate } from "@/lib/icons"
import { lazyChunk } from "@/lib/loadChunk"
import { lazyPart } from "@/lib/lazy/lazyPart"
import { displayNameOf } from "@/lib/personName"
import { cn } from "@/lib/utils/helpers/cn"
import type { ProjectType } from "@/lib/work/keysApi"

export type { FieldAnswer }

/**
 * New task's template chips (linear-09) before their code comes: the pickers,
 * asks and calls (taskTemplateParts) are one chunk, fetched as a pointer or the
 * focus reaches a chip, a picker opens (click, T, Alt+C) or a type has a default.
 */

/** What the project couldn't take of a template (make's left_off, in the server's words): under "Created" on a
 * made task, and beside what a refused make asks for. */
export function LeftOff({ lines }: { lines: readonly string[] | undefined }) {
  if (!lines?.length) return null
  return (
    <ul aria-label="What the project couldn't take" className="grid gap-0.5 px-4 pb-2 text-ui-sm text-ink-2">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  )
}

type ButtonProps = React.ComponentPropsWithoutRef<"button"> & { chip: string }

/** The Template chip's face: the chosen template's name, or "Template". */
export const TemplateButton = React.forwardRef<HTMLButtonElement, ButtonProps & { name?: string }>(({ chip, name, className, ...props }, ref) => (
  <button ref={ref} type="button" {...props} className={cn(chip, "h-7 pr-1.5", name && "text-foreground", className)} aria-label={name ? `Template: ${name}` : "Template"} aria-keyshortcuts="T">
    <LayoutTemplate className="size-3.5" aria-hidden />
    <span className="max-w-[12rem] truncate">{name ?? "Template"}</span>
    <ChevronDown className="size-3.5 text-ink-3" aria-hidden />
  </button>
))
TemplateButton.displayName = "TemplateButton"

/** The Type chip's face: the type's name, Task while none other is picked. */
export const TypeButton = React.forwardRef<HTMLButtonElement, ButtonProps & { taskType?: Pick<ProjectType, "name" | "builtin"> }>(({ chip, taskType: type, className, children, ...props }, ref) => (
  <button ref={ref} type="button" {...props} className={cn(chip, type && type.builtin !== "task" && "text-foreground", className)} aria-label={`Type: ${type?.name ?? "Task"}`}>
    {children}
    {type?.name ?? "Task"}
  </button>
))
TypeButton.displayName = "TypeButton"

const parts = () => import("@/components/task/taskTemplateParts")

/** The pieces' code, for the form's calls. */
export const templateKit = lazyChunk(parts)

type Still<P> = React.ComponentType<P & { warm?: () => void }>

/** A chip whose picker is code of its own: its face until the picker opens or the code is in (a failed fetch asks again on press). */
function lazyChip<P extends { open: boolean; onOpenChange: (open: boolean) => void }>(load: () => Promise<React.ComponentType<P>>, Face: Still<P>) {
  const part = lazyPart<P>(load, { placeholder: Face, failed: (props) => <Face {...props} warm={props.retry} /> })
  const warm = () => void part.warm()
  function LazyChip(props: P) {
    return props.open || part.isIn() ? <part.Part {...props} /> : <Face {...props} warm={warm} />
  }
  return LazyChip
}

export const TemplateChip = lazyChip<TemplateChipProps>(
  () => parts().then((m) => m.TemplateChip),
  ({ chip, chosen, onOpenChange, warm }) => (
    <TemplateButton chip={chip} name={chosen?.name} onPointerEnter={warm} onFocus={warm} onClick={() => (warm?.(), onOpenChange(true))} />
  ),
)

export const TypeChip = lazyChip<TypeChipProps>(
  () => parts().then((m) => m.TypeChip),
  ({ chip, type, onOpenChange, warm }) => <TypeButton chip={chip} taskType={type} onPointerEnter={warm} onFocus={warm} onClick={() => (warm?.(), onOpenChange(true))} />,
)

/** Drawn only once a template is chosen, so their code is in. */
export const TemplateNote = lazyPart(() => parts().then((m) => m.TemplateNote)).Part
export const TemplateAsks = lazyPart(() => parts().then((m) => m.TemplateAsks)).Part
/** An AI teammate on the Assignee chip: its name holds the room while the code comes. */
export const AgentWho = lazyPart(() => parts().then((m) => m.AgentWho), { placeholder: ({ who }) => <>{displayNameOf(who)}</> }).Part

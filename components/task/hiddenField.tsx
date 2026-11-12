// A field the server hides from its reader (V-698): the server keeps a money
// field's values from anyone not an admin of its project, sends the field
// marked hidden: true with no value, and refuses their write (403). The one
// rule every surface asks, and what such a field shows in place of a value: a
// lock and the words, never a box. One leaf, so the lazy template asks and
// widget editor take it without the list's value views.

import { Lock } from "@/lib/icons"
import type { TaskField } from "@/lib/tasks/fields"
import { cn } from "@/lib/utils/helpers/cn"

const WORDS = "Only project admins see money"

/** Whether the server keeps this field's values from its reader. The server
 * decides, never the field's type: such a field reads as the words in place of
 * any value (a kept one too), takes no value, and is no filter or split. */
export const fieldHidden = (field: Pick<TaskField, "hidden">) => field.hidden === true

/** fields less those the server hides from their reader, in order. */
export const readableFields = <F extends Pick<TaskField, "hidden">>(fields: readonly F[]): F[] => fields.filter((f) => !fieldHidden(f))

/** compact: the lock alone, its words for screen readers and in its tip (a
 * list's 72px money column, where the words would be cut to a few letters). */
export function HiddenFieldValue({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <span data-field-hidden="" title={WORDS} className={cn("inline-flex min-w-0 max-w-full items-center gap-1.5 text-muted-foreground", className)}>
      <Lock className="size-3.5 shrink-0" aria-hidden />
      <span className={compact ? "sr-only" : "truncate"}>{WORDS}</span>
    </span>
  )
}

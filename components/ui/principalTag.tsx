import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * PrincipalTag — the marker that says what KIND of account a name refers to.
 *
 * This is not decoration. "Am I talking to a person or an agent?" and "is this
 * someone from outside my company?" are the two trust questions a member asks
 * about a name in a workspace, and this tag is the whole answer. That makes it
 * the one label in the product that has to look identical everywhere, because
 * recognition is the entire job — a marker you have to stop and read is a marker
 * that failed.
 *
 * It was drawn eight times by hand instead, and no two agreed. The "AI" marker
 * alone appeared six times: `rounded` on five surfaces and `rounded-full` on the
 * member panel, `px-1.5` on three and `px-1` on three, and `text-3xs` on five
 * against an arbitrary `text-[10px]` on the sixth. "Guest" appeared twice, once
 * font-medium and once font-semibold. So the signal a member relies on to tell a
 * bot from a colleague changed shape depending on which surface they happened to
 * be looking at.
 *
 * Accessibility was the worse half. Four of the six "AI" tags had no title and
 * no expansion, so a screen reader announced the bare string "AI" next to a
 * human-looking name — the trust signal simply did not exist non-visually. Every
 * kind here carries a visually-hidden expansion, so a reader hears "AI agent"
 * and "Guest user" while the eye still gets the short form.
 *
 * Adding a kind is a one-line entry in PRINCIPAL_KINDS. Deliberately closed
 * otherwise: an open `label` prop would let call sites reintroduce the drift
 * this exists to remove.
 */

export type PrincipalKind = "ai" | "guest"

interface PrincipalKindSpec {
  /** Short form, what the eye reads. */
  label: string
  /**
   * What a screen reader hears in place of the short form. Not merely the label
   * expanded — it has to answer the trust question on its own, out of context.
   */
  spoken: string
  /** Mouse-hover explanation. */
  title: string
  /** `soft` tints with the workspace's own primary; `secondary` stays neutral. */
  variant: "soft" | "secondary"
}

const PRINCIPAL_KINDS: Record<PrincipalKind, PrincipalKindSpec> = {
  // Primary tint, because an agent acting in your workspace is a first-class
  // participant and the marker should read as informative, not as a warning.
  ai: { label: "AI", spoken: "AI agent", title: "AI agent", variant: "soft" },
  // Neutral, because "outside the company" is a fact about scope rather than a
  // problem; colouring it as a warning would editorialise every guest's name.
  guest: { label: "Guest", spoken: "Guest user", title: "Guest — outside this workspace", variant: "secondary" },
}

export function PrincipalTag({
  kind,
  className,
}: {
  kind: PrincipalKind
  className?: string
}) {
  const spec = PRINCIPAL_KINDS[kind]
  if (!spec) return null
  return (
    <Badge
      variant={spec.variant}
      size="sm"
      caps
      title={spec.title}
      // rounded, not rounded-full: matches the five call sites that agreed, and
      // keeps the tag reading as a label rather than a count pill.
      className={cn("rounded shrink-0", className)}
    >
      <span aria-hidden="true">{spec.label}</span>
      <span className="sr-only">{spec.spoken}</span>
    </Badge>
  )
}

export default PrincipalTag

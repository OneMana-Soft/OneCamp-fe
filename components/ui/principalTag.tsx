import { Badge } from "@/components/ui/badge"
import { isAIBot } from "@/lib/botCopy"
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
 * against an arbitrary `text-3xs` on the sixth. "Guest" appeared twice, once
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

export type PrincipalKind = "ai" | "guest" | "bridge" | "bot"

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
  /** `secondary` stays neutral; colour comes from `tone`. */
  variant: "soft" | "secondary"
  /** Extra classes for a kind with a colour of its own. */
  tone?: string
}

const PRINCIPAL_KINDS: Record<PrincipalKind, PrincipalKindSpec> = {
  // Primary tint, because an agent acting in your workspace is a first-class
  // participant and the marker should read as informative, not as a warning.
  // The agent colour (see --agent in globals.css), not the workspace accent: the
  // accent also marks selection and links, and "Agent" is not either. "Agent"
  // rather than "AI", which also reads as "written by AI" about the text.
  ai: {
    label: "Agent", spoken: "AI agent", title: "AI agent: acts for the person who set it up", variant: "secondary",
    tone: "border-transparent bg-agent-muted text-agent hover:bg-agent-muted",
  },
  // Neutral, because "outside the company" is a fact about scope rather than a
  // problem; colouring it as a warning would editorialise every guest's name.
  guest: { label: "Guest", spoken: "Guest user", title: "Guest: outside this workspace", variant: "secondary" },
  // A person in a linked Slack channel, named as the author of what the Slack
  // bridge carried across. Neutral for the same reason as a guest.
  bridge: { label: "Slack", spoken: "Person in Slack", title: "Slack: written in the linked Slack channel", variant: "secondary" },
  // Every other bot: the Check-in, Slack and channel-guest relays, workflows'
  // automation account, and any kind this build doesn't know. Neutral, and it
  // claims nothing about AI, because none of them has one behind it.
  bot: { label: "Bot", spoken: "Automated account", title: "Bot: an automated account, not a person", variant: "secondary" },
}

/**
 * The tag a bot's name carries, from its kind (see lib/botCopy): "Agent" only
 * when an AI is behind it. Unknown or not yet loaded reads as a plain bot.
 */
export function botTagKind(kind: string | null | undefined): PrincipalKind {
  if (isAIBot(kind)) return "ai"
  if (kind === "guest") return "guest"
  return "bot"
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
      className={cn("rounded shrink-0", spec.tone, className)}
    >
      <span aria-hidden="true">{spec.label}</span>
      <span className="sr-only">{spec.spoken}</span>
    </Badge>
  )
}


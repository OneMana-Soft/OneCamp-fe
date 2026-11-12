// How far an agent may go by itself (ADMIN-16). A module of its own, so the
// agents list's chips don't pull the agent card's copy (lib/agentCardCopy)
// into the agents page's first load.

export type Autonomy = "approval" | "plan" | "auto"

/**
 * How far an agent may go on its own, in one table, safest first: the
 * editor's options (title, line, Recommended), the agents list's chip and the
 * card's phrase all read it (ADMIN-16). A new agent asks first.
 */
export const AUTONOMY: readonly {
  value: Autonomy
  title: string
  line: string
  /** The agents list's chip: only what differs from asking first, the default. */
  chip?: string
  /** The agent card's sentence. */
  phrase: string
  recommended?: true
}[] = [
  {
    value: "approval",
    title: "Ask first",
    line: "Each change waits for your yes in Inbox, then runs as you.",
    phrase: "Asks before it changes anything",
    recommended: true,
  },
  {
    value: "plan",
    title: "Plan, then ask",
    line: "Shows its whole plan; one yes runs every step.",
    chip: "Plans first",
    phrase: "Proposes a plan, then waits for a yes",
  },
  {
    value: "auto",
    title: "Act on its own",
    line: "Makes changes itself, within its tools, scope and your permissions.",
    chip: "Acts on its own",
    phrase: "Acts on its own",
  },
]

/** A mode, or Ask first for anything else: the safe reading of the unknown, never that it acts. Pure. */
export function autonomyOf(raw: string | undefined): Autonomy {
  return AUTONOMY.find((a) => a.value === raw)?.value ?? "approval"
}

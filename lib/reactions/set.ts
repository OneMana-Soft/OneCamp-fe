/** The reactions OneCamp offers, in the tray's order: one set for a call's stage and a board's faces (miro-24). */
export const REACTIONS = ["👍", "❤️", "😂", "🎉", "👏", "😮"] as const
export type Reaction = (typeof REACTIONS)[number]

/** Whether a value is one of the set's emoji: nothing else (words, markup) is ever shown as a reaction. Pure. */
export const isReaction = (v: unknown): v is Reaction => typeof v === "string" && (REACTIONS as readonly string[]).includes(v)

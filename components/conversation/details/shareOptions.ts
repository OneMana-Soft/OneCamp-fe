import type { Share, ShareChoice } from "@/lib/conversation/conversationApi"

/** One row of "Share earlier messages?", in the sheet's words. */
export interface ShareOption {
  share: Share
  label: string
  /** What it shares, counted; "" while the counts load. */
  description: string
  /** Nothing to share for it. */
  empty: boolean
}

const LABEL: Record<Share, string> = {
  none: "No, start fresh",
  day: "The last day",
  week: "The last 7 days",
  all: "Everything",
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`

/** "12 messages and 3 replies", "1 message", "4 replies". Pure. */
function counted(messages: number, replies: number): string {
  const parts = [messages > 0 ? count(messages, "message", "messages") : "", replies > 0 ? count(replies, "reply", "replies") : ""].filter(Boolean)
  return parts.join(" and ")
}

/**
 * The choices of "Share earlier messages?" (chat A9, D-S1): starting fresh
 * first, as it is the default, then the last day, the last 7 days and
 * everything, each with what it would share. Everything over the cap says it
 * shares the newest that fit ("the last 5,000 of 6,240"). A choice with
 * nothing in it says so, and can't be picked. Pure.
 */
export function shareOptions(choices: ShareChoice[] | undefined): ShareOption[] {
  const of = (share: Share) => choices?.find((c) => c.share === share)
  return (["none", "day", "week", "all"] as Share[]).map((share) => {
    if (share === "none") return { share, label: LABEL.none, description: "They see what's said from now on. Earlier messages stay here.", empty: false }
    const c = of(share)
    if (!c) return { share, label: LABEL[share], description: "", empty: false }
    const total = c.messages + c.replies
    if (total === 0) return { share, label: LABEL[share], description: share === "all" ? "Nothing to share yet" : "Nothing in that time", empty: true }
    const description = c.capped
      ? `The last ${c.shared.toLocaleString("en-GB")} of ${total.toLocaleString("en-GB")} messages and replies`
      : counted(c.messages, c.replies)
    return { share, label: LABEL[share], description, empty: false }
  })
}

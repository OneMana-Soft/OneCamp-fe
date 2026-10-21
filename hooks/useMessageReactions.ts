"use client"

import { useCallback, useMemo, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { displayNameOf } from "@/lib/personName"
import { chooseReaction, groupReactions, namesByEmoji, reactedWith } from "@/lib/chat/reactions"
import type { GroupedReaction } from "@/types/reaction"

/** What a message's reaction row reads and does. */
export interface MessageReactions {
  /** Each emoji's people, each person once: what the pills draw. */
  byEmoji: { [emojiId: string]: string[] }
  /** The emoji the reader has reacted with. */
  selected: ReadonlySet<string>
  /** A click on an emoji: adds it, or takes the reader's back, or says why it can't. */
  toggle: (emojiId: string) => void
  /** The emoji of the reader's first reaction on the message, made just now: it bursts once. */
  burstEmojiId?: string
}

/**
 * A message's reactions as the reader sees and changes them (lib/chat/
 * reactions): several emoji a person, each once. addReaction(emoji, "") adds
 * one; removeReaction(id) takes one back, and the server takes back every
 * copy of that emoji of the reader's. The one hook every row uses: a
 * channel's, a DM's and a group's messages and their replies.
 */
export function useMessageReactions(
  reactions: GroupedReaction[] | null | undefined,
  selfId: string | undefined,
  addReaction: (emojiId: string, reactionId: string) => void,
  removeReaction: (reactionId: string) => void,
): MessageReactions {
  const { toast } = useToast()
  const [burstEmojiId, setBurstEmojiId] = useState<string | undefined>(undefined)
  const groups = useMemo(() => groupReactions(reactions, selfId, (r) => displayNameOf(r.reaction_added_by)), [reactions, selfId])
  const byEmoji = useMemo(() => namesByEmoji(groups), [groups])
  const selected = useMemo(() => reactedWith(groups), [groups])

  const toggle = useCallback(
    (emojiId: string) => {
      const choice = chooseReaction(groups, emojiId)
      switch (choice.kind) {
        case "remove":
          removeReaction(choice.reactionId)
          return
        case "refuse":
          toast({ title: choice.title, description: choice.description })
          return
      }
      // The reader's first reaction on this message: three small sparks
      // leave its pill (ReactionPill, throttled), and only then.
      if (choice.first) setBurstEmojiId(emojiId)
      addReaction(emojiId, "")
    },
    [groups, addReaction, removeReaction, toast],
  )

  return useMemo(() => ({ byEmoji, selected, toggle, burstEmojiId }), [byEmoji, selected, toggle, burstEmojiId])
}

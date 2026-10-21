"use client"

import { DetailsSection } from "@/components/channel/details/detailsParts"
import { ChatFace } from "@/components/message/chatFace"
import { ListSkeleton } from "@/components/ui/ListSkeleton"
import { ErrorState } from "@/components/ui/error-state"
import { Button } from "@/components/ui/button"
import { usePins } from "@/components/conversation/pins/usePins"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { displayNameOf } from "@/lib/personName"
import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText"
import { shortDateTime } from "@/lib/utils/date/shortDate"
import type { Pin as PinItem } from "@/lib/conversation/pins"
import type { ConversationRef } from "@/lib/conversation/types"
import { GetEndpointUrl } from "@/services/endPoints"
import { Paperclip, Pin, PinOff } from "@/lib/icons"
import type { UserProfileInterface } from "@/types/user"

/**
 * A conversation's pinned messages in its Details (chat B25, D-M13: the
 * Details section until conversation tabs bring a Pins tab, B16): newest
 * first, each with who wrote it and when, its first lines, and who pinned it.
 * A row opens the message; Unpin is there for those who may pin. Loading,
 * failing and empty each say so.
 */
export function PinnedSection({ conversation, onOpenMessage }: { conversation: ConversationRef; onOpenMessage: (messageId: string) => void }) {
  const pins = usePins(conversation)
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data?.user_uuid
  const count = pins.pins.length

  return (
    <DetailsSection title="Pinned" action={count > 0 ? <span className="text-meta tabular-nums text-ink-3">{count}</span> : undefined}>
      {pins.status === "loading" && <ListSkeleton rows={2} />}
      {pins.status === "error" && <ErrorState subject="the pinned messages" onRetry={pins.retry} compact />}
      {pins.status === "ready" && count === 0 && (
        <div data-pins-empty="" className="flex min-h-14 items-center gap-3 px-3 py-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-camp-sun-tint text-camp-sun-ink [&_svg]:size-4" aria-hidden="true">
            <Pin />
          </span>
          <p className="min-w-0 flex-1 text-meta text-ink-3 text-pretty">
            Nothing is pinned yet. Pin a message from its More menu and it stays here for everyone.
          </p>
        </div>
      )}
      {pins.status === "ready" &&
        pins.pins.map((pin) => (
          <PinnedRow key={pin.message_id} pin={pin} self={self} canPin={pins.canPin} onOpen={() => onOpenMessage(pin.message_id)} onUnpin={() => void pins.setPin(pin.message_id, false)} />
        ))}
    </DetailsSection>
  )
}

function PinnedRow({ pin, self, canPin, onOpen, onUnpin }: { pin: PinItem; self?: string; canPin: boolean; onOpen: () => void; onUnpin: () => void }) {
  const author = pin.message.by
  const name = displayNameOf(author) || "Someone"
  const by = pin.pinned_by.user_uuid && pin.pinned_by.user_uuid === self ? "you" : displayNameOf(pin.pinned_by) || "someone"
  const text = htmlToPreviewText(pin.message.html)
  return (
    <div data-pin-row="" className="group/pin relative flex items-start gap-3 px-3 py-2.5">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${name}: ${text || "a message"}. Open the message`}
        className="absolute inset-0 rounded-xl hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
      />
      <ChatFace name={name} profileKey={author?.user_profile_object_key} userUUID={author?.user_uuid} isBot={!!author?.is_bot} size={28} className="pointer-events-none relative mt-0.5" />
      <div className="pointer-events-none relative min-w-0 flex-1">
        <div className="flex h-5 min-w-0 items-center gap-2">
          <span className="truncate text-ui font-semibold text-ink">{name}</span>
          {pin.message.created_at && <span className="shrink-0 text-meta tabular-nums text-ink-3">{shortDateTime(new Date(pin.message.created_at))}</span>}
        </div>
        {text ? (
          <p className="line-clamp-2 text-ui text-ink-2 text-pretty">{text}</p>
        ) : (pin.message.files ?? 0) > 0 ? (
          <p className="flex items-center gap-1 text-ui text-ink-2"><Paperclip className="size-3.5" aria-hidden="true" /> {pin.message.files === 1 ? "A file" : `${pin.message.files} files`}</p>
        ) : null}
        <p className="mt-0.5 flex items-center gap-1 text-meta text-camp-sun-ink">
          <Pin className="size-3" aria-hidden="true" /> Pinned by {by}
        </p>
      </div>
      {canPin && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onUnpin}
          aria-label="Unpin"
          data-tip="Unpin"
          className="relative size-8 shrink-0 text-ink-3 hover:text-ink pointer-coarse:size-11 [&_svg]:size-4"
        >
          <PinOff aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}

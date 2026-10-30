"use client"

/**
 * The call's chat (calls CALLS-3b), in the stage's side column where People
 * and the in-call AI are, loaded the first time it opens (a click away, so
 * none of a call's first load). Everyone in the call reads the same: the
 * call's message and what's written under it while the call goes on, as
 * plain text with names. A member has the conversation one tap away; someone
 * let in by the invite, and a guest, have the call's chat alone. What's
 * written here stays under the call's message for the conversation's people
 * to read later, and the panel says so before anyone writes. While the people
 * running the call hold its chat (meet-12), the field gives way to why, and a
 * draft waits for them to let everyone again.
 */

import * as React from "react"
import { Button } from "@/components/ui/button"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { Tile } from "@/components/ui/graphics/Tile"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { ArrowUp, MessageSquare, X } from "@/lib/icons"
import { clockTime } from "@/lib/utils/date/clock"
import { isComposingKey } from "@/lib/keys/ime"
import { autolinks } from "@/lib/codec/linkify"
import { continuedFlags } from "@/lib/messageGrouping"
import { nearEnd } from "@/lib/ui/scrollEnd"
import { MiddleName } from "@/components/ui/middleName"
import { cn } from "@/lib/utils/helpers/cn"
import { MAX_MESSAGE, messageLength, messageProblem, type CallThreadTarget } from "@/lib/calls/callThread"
import { retryingText } from "@/services/publicApi"
import { threadKey, useCallThread } from "./useCallThread"
import { PersonTag } from "./personTag"
import { heldReason } from "./callHolds"
import { CALL_PANEL_FOOT, CALL_PANEL_TOOL, CALL_SIDE_PANEL, useKeptDraft } from "./sidePanel"

/**
 * A message's text with its web addresses as links, opened beside the call,
 * by the codec's rule. A long address is cut in the middle, its start and end
 * showing; the link keeps all of it, and says all of it to a screen reader,
 * which would otherwise hear the cut as a space.
 */
function MessageText({ text }: { text: string }) {
  return (
    <>
      {autolinks(text).map((p, i) =>
        p.href ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" aria-label={p.text} className="inline-flex max-w-full align-bottom text-brand-text underline underline-offset-[3px] hover:decoration-2">
            <MiddleName name={p.text} />
          </a>
        ) : (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        ),
      )}
    </>
  )
}

export default function CallChatPanel({
  target,
  onClose,
  conversation,
  held = false,
}: {
  target: CallThreadTarget
  onClose: () => void
  /** The conversation the call is in, for a member: one tap to it (beside the call where views sit side by side). */
  conversation?: { onOpen: () => void; open: boolean }
  /** The people running the call hold its chat for you now, as the room's metadata says at once. */
  held?: boolean
}) {
  const { thread, status, trouble, send } = useCallThread(target)
  const titleId = React.useId()
  const fieldId = React.useId()
  const noteId = React.useId()
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const fieldRef = React.useRef<HTMLTextAreaElement>(null)
  const following = React.useRef(true)
  // What's half written is kept while the panel is shut or the side column shows another (CHAT-LEAD-3).
  const [text, setText] = useKeptDraft(`chat ${threadKey(target)}`, "")
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // The panel takes focus as it opens, on its heading with no ring, as People does.
  React.useEffect(() => headingRef.current?.focus({ preventScroll: true }), [])

  const replies = thread?.replies ?? []
  // One writer's messages within a few minutes read as one run (lib/messageGrouping), by the
  // server's key for who wrote them: never by name, since two guests may both be "Guest".
  const continued = React.useMemo(() => continuedFlags(thread?.replies ?? [], (m) => ({ author: m.author_key, at: m.created_at })), [thread?.replies])
  // What comes in is followed while the list is at its end; someone reading back keeps their place.
  React.useLayoutEffect(() => {
    const el = listRef.current
    if (el && following.current) el.scrollTop = el.scrollHeight
  }, [replies.length, status])

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }
  // Whether you may write once the chat isn't held: a read during a hold says so, as the server holds it.
  const mayWrite = !!thread && (thread.can_reply || !!thread.chat_held)
  const canWrite = status === "ready" && mayWrite && !held
  // A draft kept from before comes back at its own height.
  React.useLayoutEffect(() => {
    if (canWrite && fieldRef.current) grow(fieldRef.current)
  }, [canWrite])
  const submit = async () => {
    const problem = messageProblem(text)
    if (problem || sending) {
      if (problem && text.trim()) setError(problem)
      return
    }
    setSending(true)
    setError(null)
    const answer = await send(text.trim())
    setSending(false)
    if (answer.ok) {
      setText("")
      following.current = true
      if (fieldRef.current) {
        fieldRef.current.style.height = "auto"
        fieldRef.current.focus()
      }
    } else if (answer.held) {
      setError(heldReason("chat"))
    } else if (!answer.readOnly && !answer.gone) {
      setError(answer.msg)
    }
  }

  const length = messageLength(text)
  const over = length > MAX_MESSAGE - 200

  return (
    <aside
      aria-labelledby={titleId}
      data-call-chat=""
      className={CALL_SIDE_PANEL}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
        <h2 ref={headingRef} tabIndex={-1} id={titleId} className="text-heading leading-tight outline-none">
          Chat
        </h2>
        <div className="flex shrink-0 items-center gap-1.5">
          {conversation && !conversation.open ? (
            <button type="button" className={CALL_PANEL_TOOL} onClick={conversation.onOpen} data-call-chat-conversation="">
              Open conversation
            </button>
          ) : null}
          <Button data-tone="light" aria-label="Close chat" variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-lg text-ink-3 hover:text-foreground [@media(pointer:coarse)]:size-11">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={listRef}
        onScroll={(e) => {
          following.current = nearEnd(e.currentTarget, 80)
        }}
        className="flex-1 overflow-y-auto px-3 py-3"
      >
        {status === "loading" ? (
          <p role="status" className="px-1 py-2 text-ui-sm text-ink-3">
            Loading the chat…
          </p>
        ) : status === "waiting" ? (
          <p role="status" className="px-1 py-2 text-ui-sm text-ink-2" data-call-chat-waiting="">
            The call&apos;s chat opens in a moment.
          </p>
        ) : status === "refused" ? (
          <p role="status" className="px-1 py-2 text-ui-sm text-ink-2" data-call-chat-refused="">
            This call&apos;s chat isn&apos;t open to you.
          </p>
        ) : thread ? (
          <>
            <p className="px-1 pb-2 text-meta text-ink-3" data-call-chat-start="">
              {thread.post.text}
              {thread.post.created_at ? <span className="tabular-nums"> · {clockTime(thread.post.created_at)}</span> : null}
            </p>
            {replies.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-3 py-8 text-center" data-call-chat-empty="">
                <Tile hue="sky" size="md" className="rounded-[12px] [&_svg]:size-5">
                  <MessageSquare aria-hidden />
                </Tile>
                <p className="text-ui-sm font-medium text-[#EEEEF0]">No messages yet</p>
                <p className="text-meta text-pretty text-ink-3">Everyone in the call reads this chat. It stays with the call, for the team to read later.</p>
              </div>
            ) : (
              <ol role="log" aria-labelledby={titleId} aria-live="polite" className="flex flex-col">
                {replies.map((m, i) => {
                  const run = !continued[i]
                  return (
                    <li key={m.id} data-chat-message="" className={cn("rounded-[10px] px-1", run ? "mt-2.5 first:mt-0" : "mt-0.5")}>
                      {run ? (
                        <p className="flex min-w-0 items-center gap-2">
                          {/* Their face, as the app's chat shows it, keyed by their name; a guest's marked as the tiles mark them. */}
                          <IdentityMark variant="avatar" size={20} id={avatarSeed(m.author)} label={m.author} />
                          <span data-chat-author="" className="truncate text-ui-sm font-medium text-[#EEEEF0]">
                            {m.author}
                          </span>
                          {m.guest ? <PersonTag kind="Guest" /> : null}
                          <time dateTime={m.created_at} className="shrink-0 text-micro tabular-nums text-ink-3">
                            {clockTime(m.created_at)}
                          </time>
                        </p>
                      ) : null}
                      <p className="whitespace-pre-wrap break-words pl-7 text-ui-sm leading-[20px] text-ink-2">
                        <MessageText text={m.text} />
                      </p>
                    </li>
                  )
                })}
              </ol>
            )}
          </>
        ) : null}
      </div>

      <div className={CALL_PANEL_FOOT} data-call-chat-foot="">
        {trouble ? (
          <p role="status" className="mb-1.5 text-meta text-ink-3">
            {retryingText[trouble]}
          </p>
        ) : null}
        {status === "gone" ? (
          <p className="text-meta text-ink-3">This call&apos;s chat has ended.</p>
        ) : canWrite ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <label htmlFor={fieldId} className="sr-only">
              Message everyone in the call
            </label>
            <div className="flex items-end gap-2 rounded-[12px] bg-white/[0.06] py-1.5 pr-1.5 pl-3 focus-within:outline-2 focus-within:outline-brand">
              <textarea
                ref={fieldRef}
                id={fieldId}
                rows={1}
                value={text}
                placeholder="Message everyone in the call"
                aria-describedby={error || over ? noteId : undefined}
                aria-invalid={error ? true : undefined}
                onChange={(e) => {
                  setText(e.target.value)
                  setError(null)
                  grow(e.target)
                }}
                onKeyDown={(e) => {
                  // Enter sends; Shift+Enter, and Enter on a touch keyboard, start a new line.
                  if (e.key !== "Enter" || e.shiftKey || isComposingKey(e.nativeEvent)) return
                  if (window.matchMedia?.("(pointer: coarse)").matches) return
                  e.preventDefault()
                  void submit()
                }}
                className="max-h-32 min-h-[28px] flex-1 resize-none bg-transparent py-1 text-base leading-[20px] text-[#EEEEF0] outline-none placeholder:text-ink-3 md:text-sm"
              />
              <button
                type="submit"
                aria-label="Send"
                disabled={!text.trim() || sending}
                className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-brand text-white transition-opacity disabled:bg-white/[0.08] disabled:text-ink-3 [@media(pointer:coarse)]:size-11 [&_svg]:size-4"
              >
                <ArrowUp aria-hidden />
              </button>
            </div>
            {error || over ? (
              <p id={noteId} role={error ? "alert" : undefined} className={cn("mt-1.5 text-meta", error ? "text-[#FF8086]" : "text-ink-3")}>
                {error ?? `${(MAX_MESSAGE - length).toLocaleString()} characters left`}
              </p>
            ) : null}
          </form>
        ) : status === "ready" && mayWrite ? (
          <p role="status" className="text-meta text-ink-3" data-call-chat-held="">
            {heldReason("chat")}
          </p>
        ) : status === "ready" ? (
          <p className="text-meta text-ink-3" data-call-chat-read-only="">
            You can read this chat, not write in it.
          </p>
        ) : null}
      </div>
    </aside>
  )
}

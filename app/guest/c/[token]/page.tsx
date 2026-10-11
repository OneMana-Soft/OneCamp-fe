"use client"

// A channel shared with a guest from another company: read it, open threads,
// and (when the link allows) post and reply. No account; the link is the key,
// and it opens this one channel and nothing else. New messages arrive by
// polling, since a guest has no session for the live connection.

import { Fragment, use, useCallback, useRef, useState } from "react"
import { isSameDay } from "date-fns"
import { ArrowLeft, Hash, MessageSquare, X } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { getGuestChannel, getGuestThread, postGuestMessage, type GuestChannelMessage } from "@/services/guestService"
import {
  GUEST_POLL_MS as POLL_MS,
  GuestLinkGone,
  GuestNotYet,
  GuestPanelPending,
  GuestTroubleNote,
  pollOutcome,
  useGuestName,
  useGuestPoll,
} from "@/components/guest/guestUi"
import { publicTrouble, sendFailedText, type PublicTrouble } from "@/services/publicApi"
import { GuestChannelActions, GuestChannelRow, GuestDayDivider, GuestGateComposer } from "@/components/guest/guestChannel"
import { PublicFrame } from "@/components/guest/PublicFrame"

/** A message the guest sent that the server hasn't confirmed yet, or refused. */
type Outgoing = { id: string; text: string; created_at: string; failed: boolean }

/** Messages with a day divider before the first of each day. */
function byDay<T extends { id: string; created_at: string }>(list: T[], render: (m: T) => React.ReactNode) {
  return list.map((m, i) => (
    <Fragment key={m.id}>
      {(i === 0 || !isSameDay(new Date(list[i - 1].created_at), new Date(m.created_at))) && <GuestDayDivider iso={m.created_at} />}
      {render(m)}
    </Fragment>
  ))
}

export default function GuestChannelPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading")
  // Why the page can't refresh just now; it keeps trying.
  const [trouble, setTrouble] = useState<PublicTrouble | null>(null)
  const [channel, setChannel] = useState("")
  const [canPost, setCanPost] = useState(false)
  const [messages, setMessages] = useState<GuestChannelMessage[]>([]) // oldest first
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [olderFailed, setOlderFailed] = useState(false)
  const [name, setName] = useGuestName(token)
  const [thread, setThread] = useState<string | null>(null)
  // What the guest sent, shown at 60 % until the server has it.
  const [outbox, setOutbox] = useState<Outgoing[]>([])
  const bottom = useRef<HTMLDivElement>(null)
  // Whether there are older messages is known from the first page and from
  // loading older ones, never from polls of the newest page.
  const firstLoad = useRef(true)

  // The newest page, merged into what's shown: new messages appear, reply
  // counts update, and older pages already loaded stay.
  const refresh = useCallback(async (scroll = false) => {
    const res = await getGuestChannel(token)
    if (!res.ok) {
      // A dead link replaces what's shown; a busy or unreachable server is
      // said, and the poll tries again, waiting longer each time.
      const t = publicTrouble(res.status)
      if (t === "gone") setState("missing")
      else setTrouble(t)
      return pollOutcome(res)
    }
    setTrouble(null)
    setChannel(res.data.channel)
    setCanPost(res.data.can_post)
    const page = [...res.data.messages].reverse()
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]))
      page.forEach((m) => byId.set(m.id, m))
      return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
    })
    if (firstLoad.current) {
      firstLoad.current = false
      setHasMore(res.data.has_more)
    }
    setState("ready")
    if (scroll) requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: "end" }))
    return pollOutcome(res)
  }, [token])

  useGuestPoll(token, POLL_MS, (first) => refresh(first))

  const loadOlder = async () => {
    if (!messages.length) return
    setLoadingMore(true)
    setOlderFailed(false)
    const res = await getGuestChannel(token, messages[0].created_at)
    setLoadingMore(false)
    if (!res.ok) {
      // Said under the button, which stays to try again.
      setOlderFailed(true)
      return
    }
    setMessages((prev) => [...[...res.data.messages].reverse(), ...prev])
    setHasMore(res.data.has_more)
  }

  // Optimistic: the message shows at once, on its way, and goes when the
  // server's page carries it; a refusal stays under it with Retry.
  const send = async (item: Outgoing) => {
    setOutbox((o) => [...o.filter((x) => x.id !== item.id), { ...item, failed: false }])
    requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: "end" }))
    const res = await postGuestMessage(token, { display_name: name, text: item.text })
    if (!res.ok) {
      setOutbox((o) => o.map((x) => (x.id === item.id ? { ...x, failed: true } : x)))
      return sendFailedText(res)
    }
    await refresh(true)
    setOutbox((o) => o.filter((x) => x.id !== item.id))
    return null
  }

  if (state === "loading") return <GuestNotYet trouble={trouble} shape="chat" label="Opening the channel…" />
  if (state === "missing") return <GuestLinkGone />

  return (
    <PublicFrame
      surface="guest-channel"
      fill
      title={
        <span className="flex min-w-0 items-center gap-1">
          <Hash aria-hidden="true" className="size-4 shrink-0 text-faint-foreground" />
          <span className="truncate">{channel}</span>
        </span>
      }
      actions={<GuestChannelActions name={canPost ? name : ""} onRename={() => setName("")} />}
    >
      <div className="guest-sheet flex min-h-0 flex-1 flex-col">
        <GuestTroubleNote trouble={trouble} />
        <div className="flex min-h-0 flex-1">
          <section className={`flex min-w-0 flex-1 flex-col ${thread ? "hidden sm:flex" : ""}`}>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              {hasMore && (
                <div className="mb-4 text-center">
                  {/* A 28px ghost pill, centred. */}
                  <Button variant="ghost" size="sm" className="rounded-[14px] px-3" onClick={loadOlder} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : "Load earlier"}
                  </Button>
                  {olderFailed && (
                    <p role="alert" className="mt-1 text-xs text-danger-ink">Couldn&apos;t load earlier messages. Try again.</p>
                  )}
                </div>
              )}
              {messages.length === 0 && outbox.length === 0 && <p className="text-center text-sm text-muted-foreground">No messages yet.</p>}
              <ol className="mx-auto grid w-full max-w-[808px] gap-4">
                {byDay(messages, (m) => (
                  <li key={m.id}>
                    <GuestChannelRow author={m.author} text={m.text} createdAt={m.created_at} own={!!name && m.author === name}>
                      <button type="button" onClick={() => setThread(m.id)} className="mt-1 flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
                        <MessageSquare className="h-3 w-3" aria-hidden />
                        {m.reply_count > 0 ? `${m.reply_count} ${m.reply_count === 1 ? "reply" : "replies"}` : canPost ? "Reply" : "Open"}
                      </button>
                    </GuestChannelRow>
                  </li>
                ))}
                {outbox.map((o) => (
                  <li key={o.id}>
                    <GuestChannelRow author={name} text={o.text} createdAt={o.created_at} own pending={!o.failed} failed={o.failed} onRetry={() => void send(o)} />
                  </li>
                ))}
              </ol>
              <div ref={bottom} />
            </div>
            {canPost && (
              <GuestGateComposer
                name={name}
                onName={setName}
                placeholder={`Message #${channel}`}
                optimistic
                onSend={(text) => send({ id: `out-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, created_at: new Date().toISOString(), failed: false })}
              />
            )}
          </section>
          {thread && (
            <Thread token={token} postId={thread} canPost={canPost} name={name} onName={setName} onClose={() => setThread(null)} onReplied={() => void refresh()} />
          )}
        </div>
      </div>
    </PublicFrame>
  )
}

function Thread({ token, postId, canPost, name, onName, onClose, onReplied }: { token: string; postId: string; canPost: boolean; name: string; onName: (name: string) => void; onClose: () => void; onReplied: () => void }) {
  const [data, setData] = useState<{ message: GuestChannelMessage; replies: GuestChannelMessage[] } | null>(null)
  const [missing, setMissing] = useState(false)
  // Why the thread can't load or refresh just now; it keeps trying.
  const [trouble, setTrouble] = useState<PublicTrouble | null>(null)
  const load = useCallback(async () => {
    const res = await getGuestThread(token, postId)
    if (res.ok) {
      setData(res.data)
      setTrouble(null)
    } else {
      const t = publicTrouble(res.status)
      if (t === "gone") setMissing(true)
      else setTrouble(t)
    }
    return pollOutcome(res)
  }, [token, postId])
  useGuestPoll(`${token}:${postId}`, POLL_MS, load)

  return (
    <aside className="flex w-full min-w-0 flex-col border-line sm:w-96 sm:border-l">
      <div className="flex h-12 items-center gap-2 border-b border-line px-3">
        {/* Back to the channel where the thread covers it, a cross where it sits beside it. */}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close the thread">
          <ArrowLeft className="h-4 w-4 sm:hidden" aria-hidden="true" />
          <X className="hidden h-4 w-4 sm:block" aria-hidden="true" />
        </Button>
        <span className="text-sm font-medium">Thread</span>
      </div>
      {data && !missing && <GuestTroubleNote trouble={trouble} />}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {missing ? (
          <p className="text-sm text-muted-foreground">That message isn&apos;t here any more.</p>
        ) : !data ? (
          <GuestPanelPending trouble={trouble} />
        ) : (
          <div className="grid gap-4">
            <GuestChannelRow author={data.message.author} text={data.message.text} createdAt={data.message.created_at} own={!!name && data.message.author === name} />
            <ol className="grid gap-3">
              {data.replies.map((r) => (
                <li key={r.id}>
                  <GuestChannelRow author={r.author} text={r.text} createdAt={r.created_at} own={!!name && r.author === name} />
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      {canPost && !missing && (
        // On a phone the thread covers the channel, and the channel's name
        // gate with it: a guest who opens a thread first is asked here.
        <GuestGateComposer
          name={name}
          onName={onName}
          placeholder="Reply"
          onSend={async (text) => {
            const res = await postGuestMessage(token, { display_name: name, text, reply_to: postId })
            if (res.ok) {
              void load()
              onReplied()
            }
            return res.ok ? null : sendFailedText(res)
          }}
        />
      )}
    </aside>
  )
}

"use client"

// A channel shared with a guest from another company: read it, open threads,
// and (when the link allows) post and reply. No account; the link is the key,
// and it opens this one channel and nothing else. New messages arrive by
// polling, since a guest has no session for the live connection.

import { use, useCallback, useRef, useState } from "react"
import { ArrowLeft, Hash, MessageSquare } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { getGuestChannel, getGuestThread, postGuestMessage, type GuestChannelMessage } from "@/services/guestService"
import {
  GUEST_POLL_MS as POLL_MS,
  GuestComposer as Composer,
  GuestLinkGone,
  GuestMessageView as MessageView,
  GuestNameForm,
  GuestNotYet,
  GuestPanelPending,
  GuestTroubleNote,
  pollOutcome,
  useGuestName,
  useGuestPoll,
} from "@/components/guest/guestUi"
import { publicTrouble, sendFailedText, type PublicTrouble } from "@/services/publicApi"
import { MadeWithOneCamp } from "@/components/public/MadeWithOneCamp"

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

  if (state === "loading") return <GuestNotYet trouble={trouble} />
  if (state === "missing") return <GuestLinkGone />

  return (
    <main className="flex h-dvh flex-col bg-background">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Hash className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h1 className="truncate font-semibold">{channel}</h1>
        <span className="ml-auto text-xs text-muted-foreground">You&apos;re a guest</span>
        <MadeWithOneCamp surface="guest-channel" className="hidden sm:block" />
      </header>
      <GuestTroubleNote trouble={trouble} />
      <div className="flex min-h-0 flex-1">
        <section className={`flex min-w-0 flex-1 flex-col ${thread ? "hidden sm:flex" : ""}`}>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {hasMore && (
              <div className="mb-4 text-center">
                <Button variant="ghost" size="sm" onClick={loadOlder} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : "Earlier messages"}
                </Button>
                {olderFailed && (
                  <p role="alert" className="mt-1 text-xs text-danger-ink">Couldn&apos;t load earlier messages. Try again.</p>
                )}
              </div>
            )}
            {messages.length === 0 && <p className="text-center text-sm text-muted-foreground">No messages yet.</p>}
            <ol className="mx-auto grid w-full max-w-3xl gap-4">
              {messages.map((m) => (
                <li key={m.id}>
                  <MessageView m={m} />
                  <button type="button" onClick={() => setThread(m.id)} className="mt-1 flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
                    <MessageSquare className="h-3 w-3" aria-hidden />
                    {m.reply_count > 0 ? `${m.reply_count} ${m.reply_count === 1 ? "reply" : "replies"}` : canPost ? "Reply" : "Open"}
                  </button>
                </li>
              ))}
            </ol>
            <div ref={bottom} />
          </div>
          {canPost && (
            name ? (
              <Composer
                placeholder={`Message #${channel}`}
                onSend={async (text) => {
                  const res = await postGuestMessage(token, { display_name: name, text })
                  if (res.ok) void refresh(true)
                  return res.ok ? null : sendFailedText(res)
                }}
                name={name}
                onRename={() => setName("")}
              />
            ) : (
              <GuestNameForm onName={setName} />
            )
          )}
        </section>
        {thread && (
          <Thread token={token} postId={thread} canPost={canPost} name={name} onName={setName} onClose={() => setThread(null)} onReplied={() => void refresh()} />
        )}
      </div>
    </main>
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
    <aside className="flex w-full min-w-0 flex-col border-l sm:w-96">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close the thread">
          <ArrowLeft className="h-4 w-4" />
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
            <MessageView m={data.message} />
            <ol className="grid gap-3 border-l pl-3">
              {data.replies.map((r) => <li key={r.id}><MessageView m={r} /></li>)}
            </ol>
          </div>
        )}
      </div>
      {canPost && !missing && (
        name ? (
          <Composer
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
        ) : (
          // On a phone the thread covers the channel, and the channel's name
          // form with it: a guest who opens a thread first is asked here.
          <GuestNameForm onName={onName} />
        )
      )}
    </aside>
  )
}

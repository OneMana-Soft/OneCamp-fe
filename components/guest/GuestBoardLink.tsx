"use client"

/**
 * A board's link, for its guest (miro-33): view, comment or edit, perhaps
 * behind a password, until it ends.
 * - A password link asks for its password on the public pages' card (C6's
 *   SecretCard), saying each refusal in the server's words; its unlock is
 *   kept on this device and sent on every (re)connect, never the password.
 * - A comment or edit link asks the guest's name before the board opens: the
 *   server signs it into the live token as "Guest: <name>", which names their
 *   comments and their cursor. A view link asks nothing and has no comment box.
 * - Every reconnect asks again: a new role takes effect, a new password
 *   brings the prompt back, and a link turned off or ended shows as gone.
 */

import * as React from "react"
import dynamic from "next/dynamic"
import { lazyPiece } from "@/lib/lazy/lazyPiece"
import { getGuestCollabSession, type GuestCollabSession } from "@/services/guestService"
import { askGuestBoardComment } from "@/services/guestBoardLinks"
import { sendFailedText, type PublicResult } from "@/services/publicApi"
import { GuestNameForm, GuestNotYet, useGuestAnswer, useGuestName } from "@/components/guest/guestUi"
import { CanvasPending } from "@/components/guest/canvasPending"
import { PublicGone } from "@/components/guest/publicStates"
import { PublicFrame } from "@/components/guest/PublicFrame"
import { LockTile, PublicCard, SecretForm } from "@/components/guest/SecretCard"
import { toast } from "@/hooks/use-toast"
import type { CommentAsk } from "@/lib/board/commentServer"

// The live canvas (its socket and its drawing library) loads after the
// page's frame, as the member's board does: the guest sees the board's name
// and the frame at once.
const GuestBoardViewer = dynamic(() => import("@/components/guest/GuestBoardViewer").then((m) => m.GuestBoardViewer), {
  ssr: false,
  loading: () => <CanvasPending />,
})
// A comment or edit link's comments, a piece of this page's own: a view link
// never loads them, and nothing else that shows a board (a doc's embed, a
// call's stage) carries them.
const GuestComments = lazyPiece(() => import("@/components/guest/guestBoardComments"))

const gone = <PublicGone surface="guest-board" noun="shared board" detail="The link may have expired or been turned off. Ask the person who shared it for a new one." />

/** Who the server's live token says the guest is: their id on the board and their name under the guest marker. Pure. */
export function guestTokenWho(jwt: string): { id: string; name: string } | null {
  try {
    const part = jwt.split(".")[1]
    if (!part) return null
    const bytes = Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as { sub?: unknown; name?: unknown }
    return typeof claims.sub === "string" && typeof claims.name === "string" ? { id: claims.sub, name: claims.name } : null
  } catch {
    return null
  }
}

// A password link's unlock, kept on this device as the guest's name is (guestUi useGuestName).
const unlockKey = (token: string) => `oc_guest_unlock_${token.slice(0, 12)}`
const keptUnlock = (token: string) => {
  try {
    return localStorage.getItem(unlockKey(token)) ?? ""
  } catch {
    return ""
  }
}
const keepUnlock = (token: string, unlock: string) => {
  try {
    if (unlock) localStorage.setItem(unlockKey(token), unlock)
    else localStorage.removeItem(unlockKey(token))
  } catch {
    /* storage blocked: asked again next visit */
  }
}

type Session = GuestCollabSession & { asked: string }
type Answer = PublicResult<Session>
// The link's role, in words only: its icons are ones the task route holds, and
// Turbopack batches modules by the chunk groups that hold them, so in this
// page's first load (or in a piece of its own, a new group) they split the
// task route's batches anew (app/guestBoardIcons.test.ts).
const ROLE_TAG = { view: "Can view", comment: "Can comment", edit: "Can edit" } as const

/** Under a foot bar, the room the pill (8px, 36px, 8px) and a two-line toast need. */
const FOOT_ROOM = 120

/**
 * A phone's foot bar on a page with no tab bar (V-1111): the bar is the
 * screen's foot, so the toasts and the offline pill stand on it (app/phone.css
 * C9), not on the tab bar's floor, which only /app's tab bar moves. While the
 * bar is drawn on a phone at the screen's foot (FOOT_ROOM: too little room
 * under it for the pill or a toast), its top is published as
 * --mobile-drawer-h and the floor points at it, as a doc's comment pages do
 * (V-1105); both go with the bar. Higher up, in the page's flow, the pill
 * keeps its place under the bar. A sticky bar moves as the page scrolls, so a
 * scroll re-reads it.
 * The booking page's Book bar keeps the same publisher (BookingFlow): each
 * page's own file, so no shared module reaches a route.
 */
function usePhoneFoot(ref: React.RefObject<HTMLElement | null>, on = true) {
  React.useLayoutEffect(() => {
    const bar = ref.current
    if (!bar || !on || !window.matchMedia?.("(max-width: 639px)").matches) return
    const root = document.documentElement
    let last = ""
    const publish = () => {
      const r = bar.getBoundingClientRect()
      const h = r.top > 0 && r.top < window.innerHeight && window.innerHeight - r.bottom < FOOT_ROOM ? `${Math.round(window.innerHeight - r.top)}px` : ""
      if (h === last) return
      last = h
      if (h) {
        root.style.setProperty("--mobile-drawer-h", h)
        root.style.setProperty("--phone-floor", "var(--mobile-drawer-h, env(safe-area-inset-bottom))")
      } else {
        root.style.removeProperty("--mobile-drawer-h")
        root.style.removeProperty("--phone-floor")
      }
    }
    publish()
    const watch = typeof ResizeObserver !== "undefined" ? new ResizeObserver(publish) : null
    watch?.observe(bar)
    window.addEventListener("resize", publish)
    window.addEventListener("scroll", publish, { capture: true, passive: true })
    return () => {
      watch?.disconnect()
      window.removeEventListener("resize", publish)
      window.removeEventListener("scroll", publish, { capture: true })
      root.style.removeProperty("--mobile-drawer-h")
      root.style.removeProperty("--phone-floor")
    }
  }, [ref, on])
}

/** The name form at a phone's foot, over the board: the floor the pill and the toasts stand on while it is up. */
function NameFoot({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  usePhoneFoot(ref)
  return (
    <div ref={ref} className="absolute inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)]">
      {children}
    </div>
  )
}

export function GuestBoardLink({ token }: { token: string }) {
  const [name, saveName] = useGuestName(token)
  const unlock = React.useRef<string | null>(null)
  if (unlock.current === null && typeof window !== "undefined") unlock.current = keptUnlock(token)
  const named = React.useRef(name)
  named.current = name
  // The first ask's refusal as the server said it (a password asked for, a link gone), for the name it was asked as.
  const [refused, setRefused] = React.useState<{ asked: string; res: Answer } | null>(null)
  // The server's answer to one ask, as who it was asked for; the unlock it gave kept.
  const ask = React.useCallback(
    async (password?: string): Promise<Answer> => {
      const asked = named.current
      const key = password ? { password } : unlock.current ? { unlock: unlock.current } : {}
      const res = await getGuestCollabSession(token, asked, key)
      if (!res.ok) {
        if (!password) setRefused({ asked, res })
        return res
      }
      if (res.data.unlock) keepUnlock(token, (unlock.current = res.data.unlock))
      return { ok: true, data: { ...res.data, asked } }
    },
    [token],
  )
  // The first answer (retried while the server is busy or out of reach); a later one, from the
  // password or a reconnect, stands until the name changes and the board is asked again.
  const first = useGuestAnswer(`board-link:${token}:${name}`, ask)
  const [later, setLater] = React.useState<Answer | null>(null)
  React.useEffect(() => setLater(null), [name])
  const answer: Answer | null = later ?? (first.data ? { ok: true, data: first.data } : refused?.asked === name ? refused.res : null)
  const latest = React.useRef<Session | null>(null)
  latest.current = answer?.ok ? answer.data : latest.current

  // Every (re)connect asks again: a change to the link reaches this page here.
  const tokenFetcher = React.useCallback(async () => {
    const res = await ask()
    if (res.ok || res.code === "password_needed" || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
      if (!res.ok && res.code === "password_needed") keepUnlock(token, (unlock.current = ""))
      setLater(res)
    }
    return res.ok ? res.data.collab_token : ""
  }, [ask, token])

  // A comment, asked with the newest live token; one that lapsed is renewed once.
  const comment = React.useCallback(
    async (c: CommentAsk) => {
      const send = (live: string, boardId: string) =>
        askGuestBoardComment(live, boardId, c.action === "add" ? { action: "add", x: c.x, y: c.y, text: c.text } : c.action === "reply" ? { action: "reply", id: c.id, text: c.text } : { action: "delete", id: c.id, message: c.message })
      const now = latest.current
      if (!now) return undefined
      let res = await send(now.collab_token, now.resource_id)
      if (!res.ok && res.status === 401) {
        const fresh = await tokenFetcher()
        if (fresh) res = await send(fresh, now.resource_id)
      }
      if (res.ok) return { id: res.data?.comment?.id }
      const title = c.action === "delete" ? "Your message wasn't deleted" : "Your comment wasn't posted"
      toast({ variant: "destructive", title, description: sendFailedText(res) })
      // Nothing, as a member's writer answers (CommentWrites.ask): a throw left Comment spinning, a second press blocked.
      return undefined
    },
    [tokenFetcher],
  )

  if (answer && !answer.ok && answer.code === "password_needed") {
    return (
      <PublicCard surface="guest-board" high band={false} tile={<LockTile />} title={answer.msg} line="Whoever shared the board with you has its password.">
        <SecretForm
          label="Password"
          action="Open the board"
          autoComplete="current-password"
          onSubmit={async (password) => {
            const res = await ask(password)
            if (res.ok) {
              setLater(res)
              return undefined
            }
            // The server's words: "That password doesn't open this link." (401), "Too many tries…" (429).
            return res.status === 401 || res.status === 429 ? res.msg : sendFailedText(res)
          }}
        />
      </PublicCard>
    )
  }
  if (answer && !answer.ok && answer.status !== 429 && answer.status >= 400 && answer.status < 500) return gone
  if (!answer?.ok) return <GuestNotYet trouble={first.trouble} gone={gone} shape="board" label="Opening the shared board…" />
  const session = answer.data
  if (session.resource_type !== "board" || !session.document_name) return gone
  // Writes by name only; any other role reads.
  const role = session.capability === "comment" || session.capability === "edit" ? session.capability : "view"
  const writes = role !== "view"
  const who = writes ? guestTokenWho(session.collab_token) : null

  return (
    // The one frame every guest page shares (content's PublicFrame, G1):
    // the band, the mark, the header and the credit; the canvas fills it.
    <PublicFrame
      surface="guest-board"
      workspaceName={session.workspace_name}
      fill
      title={session.title || "Shared board"}
      actions={
        <span className="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground" data-link-role={role}>
          {ROLE_TAG[role]}
        </span>
      }
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        {writes && !name ? (
          // Their name first: the board's people see it on what they write, marked as a guest.
          <>
            <CanvasPending />
            <NameFoot>
              <GuestNameForm onName={saveName} />
            </NameFoot>
          </>
        ) : writes && session.asked !== name ? (
          <CanvasPending />
        ) : (
          <GuestBoardViewer
            documentName={session.document_name}
            boardId={session.resource_id}
            token={token}
            tokenFetcher={tokenFetcher}
            user={who ?? undefined}
            link={{
              role,
              unlock: unlock.current || undefined,
              side: writes ? (board) => <GuestComments {...board} ask={comment} /> : undefined,
            }}
          />
        )}
      </div>
    </PublicFrame>
  )
}

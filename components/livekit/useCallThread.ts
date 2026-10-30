"use client"

// The call's chat kept up to date while its panel is open (calls CALLS-3b,
// on CHAT-LEAD-2's conditions for polling, with CHAT-LEAD-3's review): every
// 5 s while the page is in view, sending back the last read's latest so most
// polls carry nothing; the whole chat every minute, on coming back to the page
// and after a send; nothing more once the chat has ended. A chat whose call's
// message isn't written yet is asked every poll for two minutes, then every
// 30 s, never given up on; a member's app asks at once when the call's state
// says something changed. Loaded with the panel.

import { useCallback, useEffect, useRef, useState } from "react"
import { CALL_STATE_EVENT } from "@/lib/calls/stateEvent"
import { POLL_MS, asksWhileWaiting, sinceFor, type CallThreadRead, type CallThreadTarget } from "@/lib/calls/callThread"
import { readCallThread, writeInCallThread, type WriteAnswer } from "@/services/callThreadService"

/**
 * loading: the first read is out. waiting: the call's message isn't written
 * yet. ready: the chat is here. gone: it was, and isn't now (the call ended,
 * or you're out of it). refused: it isn't open to this reader.
 */
export type CallThreadStatus = "loading" | "waiting" | "ready" | "gone" | "refused"

/** A trouble that passes, said and asked again at the next tick. */
export type CallThreadTrouble = "busy" | "unreachable" | null

type ReadKind = "poll" | "full" | "sent"

export const threadKey = (target: CallThreadTarget) => ("sessionId" in target ? `s:${target.sessionId}` : `g:${target.callToken}`)

export function useCallThread(target: CallThreadTarget) {
  const [thread, setThread] = useState<CallThreadRead | null>(null)
  const [status, setStatus] = useState<CallThreadStatus>("loading")
  const [trouble, setTrouble] = useState<CallThreadTrouble>(null)
  const last = useRef<CallThreadRead | null>(null)
  const polls = useRef(0)
  const stopped = useRef(false)
  // One read at a time: what is out, and a full read to run when it's back.
  const inflight = useRef<ReadKind | null>(null)
  const again = useRef(false)
  // A target's reads only: an answer for the one before lands nowhere.
  const generation = useRef(0)
  const waitingSince = useRef(0)
  const lastAsked = useRef(0)
  const targetRef = useRef(target)
  targetRef.current = target
  const key = threadKey(target)

  const read = useCallback(async (kind: ReadKind): Promise<void> => {
    if (stopped.current) return
    if (inflight.current) {
      // A full read asked while one is out is the same read; after a send it
      // isn't, since the one out may have started before the write.
      if (kind === "sent" || (kind === "full" && inflight.current === "poll")) again.current = true
      return
    }
    const now = Date.now()
    if (kind === "poll" && !last.current && waitingSince.current && !asksWhileWaiting(waitingSince.current, lastAsked.current, now)) return
    inflight.current = kind
    lastAsked.current = now
    const gen = generation.current
    try {
      const since = kind === "poll" ? sinceFor(polls.current, last.current) : undefined
      polls.current += 1
      const answer = await readCallThread(targetRef.current, since)
      if (gen !== generation.current || stopped.current) return
      switch (answer.kind) {
        case "thread":
          last.current = answer.thread
          waitingSince.current = 0
          setThread(answer.thread)
          setStatus("ready")
          setTrouble(null)
          break
        case "unchanged":
          setTrouble(null)
          break
        case "busy":
        case "unreachable":
          setTrouble(answer.kind)
          break
        case "refused":
          stopped.current = true
          setTrouble(null)
          setStatus("refused")
          break
        case "missing":
          setTrouble(null)
          if (last.current) {
            stopped.current = true
            setStatus("gone")
          } else {
            if (!waitingSince.current) waitingSince.current = now
            setStatus("waiting")
          }
          break
      }
    } finally {
      if (gen === generation.current) {
        inflight.current = null
        if (again.current && !stopped.current) {
          again.current = false
          void read("full")
        }
      }
    }
  }, [])

  useEffect(() => {
    generation.current += 1
    stopped.current = false
    inflight.current = null
    again.current = false
    last.current = null
    polls.current = 0
    waitingSince.current = 0
    lastAsked.current = 0
    setThread(null)
    setStatus("loading")
    setTrouble(null)
    void read("full")
    const tick = () => {
      if (document.visibilityState === "visible") void read("poll")
    }
    const back = () => {
      if (document.visibilityState === "visible") void read("full")
    }
    // A member's app hears the call's state change (its message attached, say): ask at once while waiting.
    const session = "sessionId" in targetRef.current ? targetRef.current.sessionId : ""
    const onState = (e: Event) => {
      const s = (e as CustomEvent<{ session?: string }>).detail
      if (session && s?.session === session && !last.current) void read("full")
    }
    const id = window.setInterval(tick, POLL_MS)
    document.addEventListener("visibilitychange", back)
    window.addEventListener("focus", back)
    window.addEventListener(CALL_STATE_EVENT, onState)
    return () => {
      stopped.current = true
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", back)
      window.removeEventListener("focus", back)
      window.removeEventListener(CALL_STATE_EVENT, onState)
    }
  }, [key, read])

  const send = useCallback(
    async (text: string): Promise<WriteAnswer> => {
      const gen = generation.current
      const answer = await writeInCallThread(targetRef.current, text)
      if (gen !== generation.current) return answer
      if (answer.ok) {
        void read("sent")
      } else if (answer.gone && last.current) {
        stopped.current = true
        setStatus("gone")
      } else if ((answer.readOnly || answer.held) && last.current) {
        last.current = { ...last.current, can_reply: false, chat_held: answer.held }
        setThread(last.current)
      }
      return answer
    },
    [read],
  )

  return { thread, status, trouble, send }
}

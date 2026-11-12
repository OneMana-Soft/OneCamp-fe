"use client"

import * as React from "react"
import type { AxiosInstance } from "axios"
import { useMqttTopic } from "@/hooks/useMqttTopic"
import { GUEST_POLL_MS, pollOutcome, useGuestPoll, type GuestPollOutcome } from "@/components/guest/guestPoll"
import { boardPollsUrl, guestBoardPollsPath, pollHeard, readPolls, withPoll, type BoardPoll } from "@/lib/board/boardPolls"
import { isAppOffline, subscribeConnectivity } from "@/lib/connectivity"
import { OWN_ERRORS } from "@/lib/http/ownErrors"
import { apiErrorStatus, refusalReason } from "@/lib/utils/apiError"
import { publicCall } from "@/services/publicApi"

/**
 * A presented board's polls (miro-28 to_win 4), for its slides (components/board/boardSlides): a member's from the
 * board's list, through the client the board page hands down, read again on every MESSAGE_POLL_UPDATE the board's
 * topic carries for this board (a poll started, a vote, a close; the app's router revalidates the poll's own SWR key,
 * pollUrl), so a tally moves without a reload; a share link's guest's from its link's list, asked through the app's one
 * guest poller (components/guest/guestPoll: every 5 s while the page is shown, backing off after failures and keeping
 * the server's Retry-After; a guest hears no MQTT). In the slides' chunk, which reaches no shared core.
 */
export type SlidePollsSource = { board: string; http: Pick<AxiosInstance, "get" | "post">; topic: string } | { token: string }

export interface SlidePollsRead {
  /** The board's polls, oldest first; undefined until the first answer. */
  polls: BoardPoll[] | undefined
  /** "offline": the last list stays, said to be the last; "failed": refused, `reason` says why (a server fault says nothing). */
  state: "loading" | "ready" | "failed" | "offline"
  reason?: string
  retry: () => void
  /** A poll a vote, a close or a start sent back, in the list at once. */
  put: (poll: BoardPoll) => void
}

export function useSlidePolls(source: SlidePollsSource | undefined): SlidePollsRead {
  const member = source && "board" in source ? source : undefined
  const token = source && "token" in source ? source.token : ""
  const board = member?.board ?? ""
  const http = member?.http
  const [polls, setPolls] = React.useState<BoardPoll[] | undefined>(undefined)
  const [state, setState] = React.useState<SlidePollsRead["state"]>("loading")
  const [reason, setReason] = React.useState<string | undefined>(undefined)
  const asked = React.useRef(0)

  const failed = React.useCallback((n: number, offline: boolean, why?: string) => {
    if (n !== asked.current) return
    setState(offline ? "offline" : "failed")
    setReason(offline ? undefined : why)
  }, [])
  const got = React.useCallback((n: number, list: unknown) => {
    if (n !== asked.current) return
    setPolls(readPolls(list))
    setState("ready")
  }, [])

  // A member's list, through the page's client; read once, and again on each poll message for this board.
  const readBoard = React.useCallback(() => {
    if (!http) return
    const n = ++asked.current
    http
      .get(boardPollsUrl(board), OWN_ERRORS)
      .then((res) => got(n, res.data?.data))
      .catch((err: unknown) => failed(n, isAppOffline() || apiErrorStatus(err) === 0, refusalReason(err)))
  }, [http, board, got, failed])

  // A guest's list, through its link; its outcome paces the guest poller.
  const readLink = React.useCallback(async (): Promise<GuestPollOutcome> => {
    const n = ++asked.current
    const res = await publicCall<{ polls?: unknown }>(guestBoardPollsPath(token))
    if (res.ok) got(n, res.data?.polls)
    else failed(n, res.status === 0 || isAppOffline(), res.status < 500 ? res.msg : undefined)
    return pollOutcome(res)
  }, [token, got, failed])

  const read = React.useCallback(() => void (token ? readLink() : readBoard()), [token, readLink, readBoard])

  React.useEffect(() => readBoard(), [readBoard])
  useGuestPoll(token, GUEST_POLL_MS, readLink)

  // Back online: read again.
  React.useEffect(() => subscribeConnectivity(() => void (!isAppOffline() && read())), [read])

  useMqttTopic({ topic: member?.topic ?? "", onMessage: (message) => void (pollHeard(message, board) && read()), onLive: read })

  const put = React.useCallback((poll: BoardPoll) => setPolls((list) => withPoll(list, poll)), [])
  return { polls, state, reason, retry: read, put }
}

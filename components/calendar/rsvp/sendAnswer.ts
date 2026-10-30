/**
 * A guest's answer from the event card (calendar A2). For an instance of a
 * repeating event it first asks which events the answer is for (this one or
 * all of them); then it shows the answer at once in the calendar's copy,
 * sends it, and reads the calendar again either way. The card's answer is a
 * tap: it sends no note, so the guest's note stays as it was; the panel's
 * sends the note written there.
 */
import type { KeyedMutator } from "swr"
import type { CalendarEventInterface, EventProposal, GetEventsResponse } from "@/types/calendar"
import { answerEventRequest, type Answer } from "@/lib/calendar/eventsApi"
import { isInstanceId, seriesIdOf } from "@/lib/calendar/instanceId"
import type { RepeatScope } from "@/lib/calendar/repeat"
import type { ScopeAction } from "@/components/calendar/scopePromptDialog"
import type { usePost } from "@/hooks/usePost"

export interface AnswerSender {
  post: Pick<ReturnType<typeof usePost>, "makeRequest">
  /** Asks which events an answer to one instance is for; null when the question was closed. */
  askScope?: (action: ScopeAction) => Promise<RepeatScope | null>
  /** The calendar's copy of its events. */
  mutateEvents?: KeyedMutator<GetEventsResponse>
  selfId?: string
}

/**
 * The calendar's copy with someone's answer in each event it is for: one
 * instance alone, or every instance of its series shown (and a single event
 * itself) for all. Pure.
 */
export function withAnswer(cur: GetEventsResponse | undefined, ev: CalendarEventInterface, selfId: string, answer: Answer, scope: "this" | "all"): GetEventsResponse | undefined {
  if (!cur?.data) return cur
  const series = seriesIdOf(ev.event_uuid)
  const answered = (e: CalendarEventInterface) => (scope === "this" ? e.event_uuid === ev.event_uuid : seriesIdOf(e.event_uuid) === series)
  return {
    ...cur,
    data: cur.data.map((e) =>
      answered(e) && e.event_guests ? { ...e, event_guests: e.event_guests.map((g) => (g.user_uuid === selfId ? { ...g, response: answer } : g)) } : e,
    ),
  }
}

/**
 * Sends the answer: true when it went, false when it couldn't, null when it
 * wasn't sent (the question closed). A proposal of another time (null takes
 * it back) is for the one event answered: an instance's goes with it alone,
 * unasked.
 */
export async function sendAnswer(
  { post, askScope, mutateEvents, selfId }: AnswerSender,
  ev: CalendarEventInterface,
  answer: Answer,
  note?: string,
  proposal?: EventProposal | null,
): Promise<boolean | null> {
  let scope: "this" | "all" = "all"
  if (isInstanceId(ev.event_uuid) && proposal !== undefined) {
    scope = "this"
  } else if (isInstanceId(ev.event_uuid)) {
    const picked = askScope ? await askScope("answer") : "this"
    if (!picked) return null
    scope = picked === "all" ? "all" : "this"
  }
  if (selfId) void mutateEvents?.((cur) => withAnswer(cur, ev, selfId, answer, scope), { revalidate: false })
  try {
    await post.makeRequest(answerEventRequest(ev.event_uuid, answer, { scope, note, proposal }))
    return true
  } catch {
    return false
  } finally {
    // What the server has now, sent or not: a failed answer's copy goes back.
    void mutateEvents?.()
  }
}

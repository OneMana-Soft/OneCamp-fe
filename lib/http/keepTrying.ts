import { publicTrouble, retryDelayMs } from "@/services/publicApi"
import { wait } from "@/lib/utils/abort"

/**
 * Asks with attempt until it succeeds, fails in a way that doesn't pass (the
 * server said no: publicTrouble "gone"), or withinMs has gone by, and gives
 * the last answer. A failure with no status is the network's, which passes.
 *
 * Between tries it waits retryDelayMs, cut short at withinMs so the last try
 * comes as the time runs out; a Retry-After past that time gives up at once.
 * onWait hears each wait start, so the page can say it is waiting. signal calls
 * it off (the person left) with an AbortError (lib/utils/abort), in a wait or
 * as a try comes back, whatever it answered. attempt is told whether this is a
 * try again.
 *
 * Its own module, not services/publicApi: the guest and booking pages that read
 * that file have a few hundred bytes to spare between them.
 */
export async function keepTrying<A extends { ok: boolean; status?: number; retryAfter?: number }>(
  attempt: (again: boolean) => Promise<A>,
  withinMs: number,
  { onWait, signal }: { onWait?: () => void; signal?: AbortSignal } = {},
): Promise<A> {
  const until = Date.now() + withinMs
  const ask = async (again: boolean) => {
    const answer = await attempt(again)
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
    return answer
  }
  let answer = await ask(false)
  for (let tried = 0; !answer.ok && publicTrouble(answer.status ?? 0) !== "gone"; tried++) {
    const left = until - Date.now()
    if (left <= 0 || (answer.retryAfter ?? 0) * 1000 > left) break
    onWait?.()
    await wait(Math.min(retryDelayMs(tried, answer.retryAfter), left), signal)
    answer = await ask(true)
  }
  return answer
}

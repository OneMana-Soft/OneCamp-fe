// Asking again for a realtime topic the broker refused.
//
// WHY. The broker asks the server before every subscription, so a refusal
// can be momentary: while the server restarts in a deploy the broker counts it
// as unreachable for about ten seconds, and on a channel just joined a stale
// answer can refuse once. A refused topic was only logged, and the page it
// belonged to had no live updates until it was reloaded. A refused topic is
// now asked for again, a few times, further apart each time, while the
// connection is up and the page still wants the topic.

/** How long to wait before each new try at a refused topic; then it's given up. */
export const RETRY_DELAYS_MS: readonly number[] = [5_000, 15_000, 45_000, 120_000]

/** The wait before try number `tried + 1` at a refused topic, or null once they're used up. Pure. */
export function retryDelay(tried: number): number | null {
  return tried >= 0 && tried < RETRY_DELAYS_MS.length ? RETRY_DELAYS_MS[tried] : null
}

// A SUBACK reason code from 0x80 up is a refusal (0x87 is "Not authorized").
const REFUSED = 0x80

/**
 * The topics a subscribe's answer refused, from what mqtt.js hands its
 * callback: the error, the subscriptions as requested, and the SUBACK. Since
 * mqtt.js 5 any refusal is an error, and the SUBACK's codes say which topics,
 * in the order they were asked for; older versions put the code in each
 * entry's qos. An error with no SUBACK behind it (the connection closing) is
 * not a refusal: reconnecting subscribes again anyway. Pure.
 */
export function refusedTopics(
  requested: readonly string[],
  err: Error | null | undefined,
  granted?: readonly { topic: string; qos: number }[] | null,
  suback?: { granted?: readonly unknown[] } | null,
): string[] {
  const codes = suback?.granted
  if (Array.isArray(codes)) {
    const topics = granted && granted.length === codes.length ? granted.map((g) => g.topic) : requested
    return topics.filter((_, i) => typeof codes[i] === "number" && (codes[i] as number) >= REFUSED)
  }
  const refusedEntries = (granted ?? []).filter((g) => typeof g.qos === "number" && g.qos >= REFUSED).map((g) => g.topic)
  if (refusedEntries.length > 0) return refusedEntries
  if (err && /not authori[sz]ed/i.test(err.message)) return [...requested]
  return []
}

type Timer = ReturnType<typeof setTimeout>

/**
 * The tries in progress, by topic. refused() schedules the next try, or gives
 * the topic up once RETRY_DELAYS_MS is used up; subscribed() clears a topic's
 * count; forget() drops one topic, and reset() all of them (on a disconnect, a
 * new connection, or the page going).
 */
export class RefusedTopicRetries {
  private readonly tried = new Map<string, number>()
  private readonly timers = new Map<string, Timer>()

  constructor(
    private readonly tryAgain: (topic: string) => void,
    private readonly onGiveUp: (topic: string, tries: number) => void = () => {},
  ) {}

  /** The broker refused `topic`: try again after the next delay, or give up. */
  refused(topic: string): void {
    if (this.timers.has(topic)) return
    const tried = this.tried.get(topic) ?? 0
    const delay = retryDelay(tried)
    if (delay === null) {
      this.tried.delete(topic)
      this.onGiveUp(topic, tried)
      return
    }
    this.tried.set(topic, tried + 1)
    this.timers.set(
      topic,
      setTimeout(() => {
        this.timers.delete(topic)
        this.tryAgain(topic)
      }, delay),
    )
  }

  /** The broker granted `topic`: a later refusal starts from the first delay. */
  subscribed(topic: string): void {
    this.tried.delete(topic)
  }

  /** `topic` is no longer wanted: no more tries. */
  forget(topic: string): void {
    const timer = this.timers.get(topic)
    if (timer !== undefined) clearTimeout(timer)
    this.timers.delete(topic)
    this.tried.delete(topic)
  }

  /** No more tries at anything, and counts start again. */
  reset(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    this.tried.clear()
  }

  /** Topics with a try scheduled. */
  pending(): string[] {
    return [...this.timers.keys()]
  }
}

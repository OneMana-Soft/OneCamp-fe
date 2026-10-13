/**
 * How long the live connection waits before each try to come back.
 *
 * It used to stop after ten tries, about three minutes (1, 2, 4, 8 and 16 s,
 * then 30 s five times), while the pill went on saying "reconnecting": a
 * broker restart that took longer left a visible, focused tab dead until the
 * person changed windows. Now it never stops: the fast tries, then one every
 * 30 s. Each wait has up to a fifth more at random, so the clients a restart
 * dropped together don't all come back together and ask the server about
 * every subscription at once.
 */

/** The tries before the waits settle at the longest. */
export const FAST_RECONNECT_TRIES = 5

const LONGEST_MS = 30_000

/** The wait before try `attempt` (0 for the first), in milliseconds. */
export function reconnectDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(1000 * 2 ** Math.max(0, attempt), LONGEST_MS)
  return Math.round(base * (1 + 0.2 * random()))
}

/**
 * Reading OneCamp API errors.
 *
 * Every handler answers with a JSON envelope, and a failing one carries a human message in `msg`.
 * Around thirty catch blocks reach into it by hand as
 *
 *     e?.response?.data?.msg || e?.message
 *
 * which works but has two problems. It repeats the shape of the envelope in every component, so a
 * change to the contract is a change to thirty files. And it drops `code` on the floor: the server
 * now labels conditions it expects the UI to handle specifically — `provider_key_unreadable` is the
 * first — and nothing was reading them, so a precise, actionable condition arrived as a generic
 * failure toast.
 *
 * WHY NOT PARSE IN THE AXIOS INTERCEPTOR. lib/axiosInstance already shows a fallback toast from
 * `msg`. That is the right default and stays. These helpers are for the callers that want to do
 * something BETTER than a toast for a particular condition, which is a decision only the caller can
 * make.
 */

/** The error-carrying subset of a OneCamp response envelope. */
interface ApiErrorEnvelope {
  msg?: unknown
  code?: unknown
}

/**
 * Narrows an unknown thrown value to the axios response, if it has one.
 *
 * Written against `unknown` rather than `any` on purpose. Catch blocks type the error `any`, so a
 * typo in the access path is silently `undefined` there — which is precisely how `code` went unread.
 */
function responseOf(error: unknown): Record<string, unknown> | undefined {
  if (typeof error !== "object" || error === null) return undefined
  const response = (error as { response?: unknown }).response
  if (typeof response !== "object" || response === null) return undefined
  return response as Record<string, unknown>
}

/** Narrows an unknown thrown value to the response envelope, if it has one. */
function envelopeOf(error: unknown): ApiErrorEnvelope | undefined {
  const data = responseOf(error)?.data
  if (typeof data !== "object" || data === null) return undefined
  return data as ApiErrorEnvelope
}

/**
 * The message to show for a failed request.
 *
 * Order is the server's message, then the transport's (network failures never reach a handler, so
 * there is no envelope for "Network Error"), then the caller's fallback.
 *
 * DELIBERATELY DOES NOT READ THE `err` OR `error` KEYS. Handlers put raw dependency strings there —
 * a Postgres driver message naming the constraint, table and column. The server's redaction blanks
 * error values at its response chokepoint precisely so those do not reach a browser, and nothing in
 * the product renders them. Reading them here would undo that from the client side.
 *
 * @param error the value from a catch block
 * @param fallback shown when neither the server nor the transport said anything useful
 */
export function apiErrorMessage(error: unknown, fallback = ""): string {
  const msg = envelopeOf(error)?.msg
  if (typeof msg === "string" && msg !== "") return msg

  const transport = (error as { message?: unknown } | null | undefined)?.message
  if (typeof transport === "string" && transport !== "") return transport

  return fallback
}

/**
 * The machine-readable condition label, or "" when the server did not send one.
 *
 * Returns a string rather than `string | undefined` so callers compare instead of null-check; no
 * condition is labelled with the empty string, so `=== ""` and "absent" are the same thing.
 *
 * Match on this, never on message text. Wording is a user interface and changes; a code is a
 * contract. Matching on prose is how a check quietly stops firing after a copy edit.
 */
export function apiErrorCode(error: unknown): string {
  const code = envelopeOf(error)?.code
  return typeof code === "string" ? code : ""
}

/**
 * The HTTP status, or 0 when the request never got a response.
 *
 * 0 rather than undefined so callers can compare directly; no real status is 0, and a request that
 * never reached the server is genuinely statusless rather than "unknown". This matters because
 * `status === 409` and `status !== 409` should both behave sensibly for a network failure, and with
 * `undefined` in play the second one quietly treats an unreachable server as "some other status".
 *
 * Prefer apiErrorCode where the server sends one: a status says how the request failed in HTTP
 * terms, a code says which condition occurred, and several conditions can share a status.
 */
export function apiErrorStatus(error: unknown): number {
  const status = responseOf(error)?.status
  return typeof status === "number" ? status : 0
}

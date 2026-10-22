// The CSRF token: the API names it in each answer's X-CSRF-Token header (its
// cookie is the API host's own, HttpOnly). An API from before 21 Oct 2026 names
// none, and then it is the readable cookie on the parent domain.
export const CSRF_HEADER = "X-CSRF-Token"
/** Every request says it reads the token from answers: the API then writes no readable cookie for it. */
export const WEB_CLIENT_HEADERS: Readonly<Record<string, string>> = { "X-Requested-With": "XMLHttpRequest" }

let named = ""

export const isWrite = (method?: string) => !/^(get|head|options)$/i.test(method || "get")

/** Keeps the token an answer named (fetch's Headers or axios's). */
export function noteCsrfToken(headers: unknown) {
  const t = (headers as { get?: (n: string) => unknown } | undefined)?.get?.(CSRF_HEADER)
  if (typeof t === "string" && t) named = t
}

export const csrfToken = () =>
  named || decodeURIComponent(/(?:^|;\s*)X-CSRF-Token=([^;]*)/.exec(typeof document === "undefined" ? "" : document.cookie)?.[1] ?? "")

/** A 403 naming a token other than the one sent (none, or one that ran out): send it once more. */
export const refusedForAnOldToken = (status: number, sent: string) => status === 403 && named !== "" && named !== sent

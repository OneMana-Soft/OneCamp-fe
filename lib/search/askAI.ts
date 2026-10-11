/**
 * The address that asks OneCamp AI a question: search's "Ask a follow-up",
 * its empty state's "Ask OneCamp AI" and the palette's Ask row. The AI page
 * reads `ask` and sends it (coordinated with the AI wave). Shared rather than
 * in components/ai, so a page on the AI-free edition can import it.
 */
export function askAIHref(question: string): string {
  return `/app/ai?ask=${encodeURIComponent(question.trim())}`
}

/**
 * The question an arrival at the AI page carries in `?ask=`, taken out of the
 * address before it is returned (history.replaceState), so it is asked once
 * and a reload or a copied URL does not ask it again. undefined when there is
 * none, or only spaces.
 */
export function takeAskParam(win: Pick<Window, "location" | "history">): string | undefined {
  const url = new URL(win.location.href)
  const ask = url.searchParams.get("ask")
  if (ask === null) return undefined
  url.searchParams.delete("ask")
  const qs = url.searchParams.toString()
  win.history.replaceState(win.history.state, "", url.pathname + (qs ? `?${qs}` : "") + url.hash)
  const q = ask.trim()
  return q || undefined
}

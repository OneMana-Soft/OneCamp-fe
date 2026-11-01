import { typedWebURL, webURL } from "@/lib/links/webURL"

/**
 * What to send for an address as people type it: https:// before a web address
 * that leaves it off ("github.com/acme/site"), and the text as typed otherwise,
 * so the server's words answer anything else (helpers.WebLink). Its own module:
 * only the lazy pieces that send a typed link carry it.
 */
export function typedWebAddress(text: string): string {
  const t = text.trim()
  return !webURL(t) && typedWebURL(t) ? `https://${t}` : t
}

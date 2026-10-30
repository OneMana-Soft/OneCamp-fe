import { WEB_LINK } from "@/lib/links/webLink"
import { typedWebURL } from "@/lib/links/webURL"

/** A web address's host as people say it: "zoom.us", with no "www.". */
export const hostOf = (u: URL): string => u.hostname.replace(/^www\./, "")

// A web link in text (lib/links/webLink).
const LINK = new RegExp(WEB_LINK, "gi")

/**
 * Text with each web link in it said as its host, the punctuation after it
 * kept: "Standup (https://zoom.us/j/1?pwd=x)." reads "Standup (zoom.us).".
 * For text on screens people share, as a link can carry a meeting's password.
 * No text (an untitled event, whose title the API leaves out) reads "".
 */
export const linksAsHosts = (text: string | undefined): string =>
  (text ?? "").replace(LINK, (found) => {
    const link = found.replace(/[)\]}.,;:!?']+$/, "")
    const u = typedWebURL(link)
    return u ? hostOf(u) + found.slice(link.length) : found
  })

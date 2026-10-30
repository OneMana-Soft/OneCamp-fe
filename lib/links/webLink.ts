/**
 * A web link in text, as a regular expression's source, the one both readers
 * of links in text use (linksAsHosts in lib/links/hostOf, setupTokens in
 * lib/text): with its scheme; or pasted without one ("zoom.us/j/1?pwd=x"),
 * when a path, query or fragment after a dotted host shows it is a link; or a
 * bare host on a common domain ("github.com"). A bare "zoom.us", "v2.0" or
 * "report.pdf" is a word, and so is a host inside an address or another link
 * ("a@b.co/x", "ftp://files.example.com/x"). Use it with the "gi" flags.
 */
export const WEB_LINK = String.raw`https?:\/\/[^\s<>"]+|(?<![\w@/.:-])(?:[a-z0-9-]+\.)+(?:[a-z]{2,}(?::\d+)?[/?#][^\s<>"]*|(?:com|org|net|io|dev|app|co|ai|so)(?![a-z0-9-]))`

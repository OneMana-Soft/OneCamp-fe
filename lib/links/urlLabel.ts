/**
 * A long link's label, read from its shape (small-details L4): pasted as a
 * link, https://github.com/OneMana-Soft/OneCamp/issues/412 reads
 * "OneMana-Soft/OneCamp#412", a Linear issue reads "ENG-231", and any other
 * long address "host › last part". The href is never changed, and nothing is
 * fetched: a self-hosted box needn't reach the site to label it.
 *
 * Only links over LONG characters are relabelled: a short one already reads
 * fine as it is. Pure.
 */

export const LONG = 50

const decode = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** "Launch-plan_v2" as "Launch plan v2". */
const words = (slug: string) => decode(slug).replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim()

function shaped(u: URL, host: string, parts: string[]): string | null {
  const [a, b, c] = parts
  switch (host) {
    case "github.com":
    case "gitlab.com": {
      if (!a || !b) return null
      const at = parts.indexOf("-") >= 0 ? parts.indexOf("-") : 2
      const repo = parts.slice(0, at).join("/")
      const [kind, ref, ...rest] = parts.slice(at + (parts[at] === "-" ? 1 : 0))
      if (!kind) return repo
      if ((kind === "issues" || kind === "pull" || kind === "discussions") && /^\d+$/.test(ref || "")) return `${repo}#${ref}`
      if (kind === "merge_requests" && /^\d+$/.test(ref || "")) return `${repo}!${ref}`
      if (kind === "commit" && /^[0-9a-f]{7,}$/.test(ref || "")) return `${repo}@${ref.slice(0, 7)}`
      if ((kind === "blob" || kind === "tree") && rest.length) return `${repo} › ${decode(rest[rest.length - 1])}`
      return repo
    }
    case "linear.app":
      return b === "issue" && /^[A-Z][A-Z0-9]*-\d+$/.test(c || "") ? c : null
    case "figma.com":
      return /^(file|design|proto|board)$/.test(a || "") && c ? words(c) : null
    case "notion.so": {
      const page = (parts[parts.length - 1] || "").replace(/-?[0-9a-f]{32}$/, "")
      return page ? words(page) : null
    }
  }
  // Jira (*.atlassian.net/browse/ABC-123) and any tracker with that shape.
  if (a === "browse" && /^[A-Z][A-Z0-9]*-\d+$/.test(b || "")) return b
  const issue = u.searchParams.get("selectedIssue")
  if (issue && /^[A-Z][A-Z0-9]*-\d+$/.test(issue)) return issue
  return null
}

/**
 * The label a pasted link gets, or null to keep the address as its own text
 * (a short link, or one that isn't a web address).
 */
export function urlLabel(href: string): string | null {
  return href.trim().length <= LONG ? null : shapeLabel(href)
}

/**
 * A link's label from its shape, however short: what a bookmark or a link
 * mention is called until the page's own title is read (a card that says
 * "OneMana-Soft/OneCamp#412" rather than "github.com"). Null for an address
 * that isn't a web one.
 */
export function shapeLabel(href: string): string | null {
  const raw = href.trim()
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null
  const host = u.hostname.replace(/^www\./, "")
  const parts = u.pathname.split("/").filter(Boolean)
  const named = shaped(u, host, parts)
  if (named) return named
  const last = parts.length ? words(parts[parts.length - 1].replace(/\.(html?|php|aspx?)$/i, "")) : ""
  return last ? `${host} › ${last}` : host
}

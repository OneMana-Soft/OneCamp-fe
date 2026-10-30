/** A web address (http or https) as a URL, or null. The server's twin is helpers.WebLink. */
export function webURL(href: string): URL | null {
  try {
    const u = new URL(href.trim())
    return u.protocol === "https:" || u.protocol === "http:" ? u : null
  } catch {
    return null
  }
}

/** A web address as typed, "https://" or not; null for mailto:, ftp:// and the like. */
export function typedWebURL(text: string): URL | null {
  const t = text.trim()
  const u = webURL(t)
  if (u || !t || /^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return u
  // Not "mailto:a@b.co" as a login at b.co.
  const v = webURL(`https://${t}`)
  return v && !v.username && !v.password ? v : null
}

/**
 * What a doc may embed, and how (docs programme B4, editor.md P1-5).
 *
 * An embed is a frame of another site inside a doc. Only the sites here, and
 * the hosts a workspace admin adds (the embed.allowlist policy, read from
 * GET /unfurl/embeds), are ever framed; any other link stays a link or a
 * bookmark. There is no embed service in between (no Iframely): the frame's
 * address is made here from the link's shape, on the site's own player or
 * viewer, on one of the origins in lib/embeds/origins.ts, which the CSP's
 * frame-src lists (providers.test.ts holds every embed to them).
 *
 * Each embed says how it is framed:
 * - sandbox: never allow-top-navigation, so a frame can't take the page away;
 *   a Gist needs no script at all.
 * - referrerPolicy: no-referrer, except the two video players that refuse a
 *   frame with no referrer at all; they get the origin only, never the doc's
 *   address.
 * - YouTube's player is youtube-nocookie.com, which sets no cookie until the
 *   video plays; Vimeo's is told dnt=1.
 *
 * Pure: no React, no network. The doc's embed block, the paste menu and the
 * CSP all read this table.
 */

export interface Embed {
  /** youtube, vimeo, loom, figma, google-docs, google-sheets, google-slides, google-forms, google-maps, gist, codepen, excalidraw, miro, spotify, x, or site (an admin's host). */
  provider: string
  /** The site's name as people say it. */
  name: string
  /** What the frame loads. */
  src: string
  /** Its height at rest, in px: a frame with an aspect scales with its width instead. */
  height: number
  /** Width over height, for a player that keeps its shape. */
  aspect?: number
  /** Its widest, in px (a vertical video). */
  maxWidth?: number
  sandbox: string
  allow: string
  referrerPolicy: ReferrerPolicy
}

const SCRIPTS = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
const PLAYER = { sandbox: SCRIPTS + " allow-presentation", allow: "fullscreen; picture-in-picture; encrypted-media; clipboard-write" }
const APP = { sandbox: SCRIPTS + " allow-forms", allow: "fullscreen; clipboard-write" }
const NO_REFERRER: ReferrerPolicy = "no-referrer"
// YouTube and Vimeo answer a frame with no referrer with an error; the origin is enough.
const ORIGIN_ONLY: ReferrerPolicy = "strict-origin"

const YT_ID = /^[A-Za-z0-9_-]{11}$/

/** "1h2m3s", "90s" or "90" as seconds; 0 when it isn't one. */
function seconds(t: string | null): number {
  if (!t) return 0
  if (/^\d+s?$/.test(t)) return parseInt(t, 10)
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t)
  return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + +(m[3] || 0) : 0
}

function youtube(u: URL, host: string): Embed | null {
  const parts = u.pathname.split("/").filter(Boolean)
  let id = ""
  if (host === "youtu.be") id = parts[0] || ""
  else if (parts[0] === "watch") id = u.searchParams.get("v") || ""
  else if (["shorts", "live", "embed", "v"].includes(parts[0])) id = parts[1] || ""
  const list = u.searchParams.get("list")
  const base = "https://www.youtube-nocookie.com/embed/"
  const video = { provider: "youtube", name: "YouTube", referrerPolicy: ORIGIN_ONLY, ...PLAYER }
  if (!YT_ID.test(id)) {
    if (parts[0] === "playlist" && list && /^[\w-]+$/.test(list)) return { ...video, src: base + "videoseries?list=" + list, height: 0, aspect: 16 / 9 }
    return null
  }
  const q = new URLSearchParams({ rel: "0" })
  const start = seconds(u.searchParams.get("t") || u.searchParams.get("start"))
  if (start) q.set("start", String(start))
  if (list && /^[\w-]+$/.test(list)) q.set("list", list)
  if (parts[0] === "shorts") return { ...video, src: base + id + "?" + q, height: 560, aspect: 9 / 16, maxWidth: 315 }
  return { ...video, src: base + id + "?" + q, height: 0, aspect: 16 / 9 }
}

function vimeo(u: URL): Embed | null {
  const parts = u.pathname.split("/").filter(Boolean)
  let id = ""
  let hash = u.searchParams.get("h") || ""
  if (parts[0] === "video") id = parts[1] || ""
  else if (parts[0] === "channels") id = parts[2] || ""
  else if (parts[0] === "groups" && parts[2] === "videos") id = parts[3] || ""
  else {
    id = parts[0] || ""
    if (!hash && /^[0-9a-f]{6,}$/.test(parts[1] || "")) hash = parts[1]
  }
  if (!/^\d+$/.test(id)) return null
  const q = new URLSearchParams({ dnt: "1" })
  if (/^[0-9a-f]+$/.test(hash)) q.set("h", hash)
  return { provider: "vimeo", name: "Vimeo", src: `https://player.vimeo.com/video/${id}?${q}`, height: 0, aspect: 16 / 9, referrerPolicy: ORIGIN_ONLY, ...PLAYER }
}

function google(u: URL, host: string): Embed | null {
  const p = u.pathname
  if (host === "docs.google.com") {
    const pub = /^\/(document|spreadsheets|presentation|forms)\/d\/e\/([\w-]+)\//.exec(p)
    const own = /^\/(document|spreadsheets|presentation)\/d\/([\w-]+)/.exec(p)
    const kind = (pub || own)?.[1]
    if (!kind) return null
    const id = (pub || own)![2]
    const names: Record<string, [string, string, number]> = {
      document: ["google-docs", "Google Docs", 600],
      spreadsheets: ["google-sheets", "Google Sheets", 450],
      presentation: ["google-slides", "Google Slides", 0],
      forms: ["google-forms", "Google Forms", 600],
    }
    const [provider, name, height] = names[kind]
    const end = pub
      ? kind === "forms"
        ? "viewform?embedded=true"
        : kind === "spreadsheets"
          ? "pubhtml?widget=true&headers=false"
          : kind === "presentation"
            ? "embed"
            : "pub?embedded=true"
      : kind === "presentation"
        ? "embed"
        : "preview"
    const src = `https://docs.google.com/${kind}/d/${pub ? "e/" : ""}${id}/${end}`
    return { provider, name, src, height, ...(height ? {} : { aspect: 16 / 9 }), referrerPolicy: NO_REFERRER, ...APP }
  }
  // Maps, by place, coordinates or query: Google's keyless embed. A short
  // maps.app.goo.gl link can't be read without a fetch: it stays a bookmark.
  if (!p.startsWith("/maps")) return null
  let q = ""
  let z = ""
  if (p.startsWith("/maps/embed")) {
    const pb = u.searchParams.get("pb")
    return pb ? { provider: "google-maps", name: "Google Maps", src: "https://www.google.com/maps/embed?pb=" + encodeURIComponent(pb), height: 450, referrerPolicy: NO_REFERRER, ...APP } : null
  }
  const place = /^\/maps\/(?:place|search)\/([^/]+)/.exec(p)
  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/.exec(p)
  if (place) q = decodeURIComponent(place[1].replace(/\+/g, " "))
  else if (at) q = `${at[1]},${at[2]}`
  else q = u.searchParams.get("q") || u.searchParams.get("query") || ""
  if (at?.[3]) z = String(Math.round(+at[3]))
  if (!q) return null
  const query = new URLSearchParams({ q })
  if (z) query.set("z", z)
  query.set("output", "embed")
  return { provider: "google-maps", name: "Google Maps", src: "https://www.google.com/maps?" + query, height: 450, referrerPolicy: NO_REFERRER, ...APP }
}

function byHost(u: URL, host: string): Embed | null {
  const parts = u.pathname.split("/").filter(Boolean)
  switch (host) {
    case "youtube.com":
    case "m.youtube.com":
    case "music.youtube.com":
    case "youtu.be":
    case "youtube-nocookie.com":
      return youtube(u, host)
    case "vimeo.com":
    case "player.vimeo.com":
      return vimeo(u)
    case "loom.com": {
      const id = (parts[0] === "share" || parts[0] === "embed") && parts[1]
      return id && /^[A-Za-z0-9]+$/.test(id) ? { provider: "loom", name: "Loom", src: `https://www.loom.com/embed/${id}`, height: 0, aspect: 16 / 9, referrerPolicy: NO_REFERRER, ...PLAYER } : null
    }
    case "figma.com":
      return /^(file|design|proto|board|slides|deck)$/.test(parts[0] || "") && /^\w+$/.test(parts[1] || "")
        ? {
            provider: "figma",
            name: "Figma",
            src: "https://www.figma.com/embed?embed_host=onecamp&url=" + encodeURIComponent(`https://www.figma.com${u.pathname}${u.search}`),
            height: 450,
            referrerPolicy: NO_REFERRER,
            ...APP,
          }
        : null
    case "docs.google.com":
    case "google.com":
    case "maps.google.com":
      return google(u, host)
    case "gist.github.com":
      // .pibb is the gist as plain HTML: no script runs in the frame at all.
      return /^[\w-]+$/.test(parts[0] || "") && /^[0-9a-f]+$/.test(parts[1] || "")
        ? {
            provider: "gist",
            name: "GitHub Gist",
            src: `https://gist.github.com/${parts[0]}/${parts[1]}.pibb`,
            height: 320,
            sandbox: "allow-popups allow-popups-to-escape-sandbox",
            allow: "",
            referrerPolicy: NO_REFERRER,
          }
        : null
    case "codepen.io":
      return /^(pen|full|details|embed)$/.test(parts[1] || "") && /^\w+$/.test(parts[2] || "")
        ? { provider: "codepen", name: "CodePen", src: `https://codepen.io/${parts[0]}/embed/${parts[2]}?default-tab=result`, height: 420, referrerPolicy: NO_REFERRER, ...APP }
        : null
    case "excalidraw.com":
      return /^#(json|room)=[\w,-]+$/.test(u.hash) ? { provider: "excalidraw", name: "Excalidraw", src: "https://excalidraw.com/" + u.hash, height: 500, referrerPolicy: NO_REFERRER, ...APP } : null
    case "miro.com":
      return parts[0] === "app" && parts[1] === "board" && /^[\w=-]+$/.test(parts[2] || "")
        ? { provider: "miro", name: "Miro", src: `https://miro.com/app/live-embed/${parts[2]}/?autoplay=yep`, height: 500, referrerPolicy: NO_REFERRER, ...APP }
        : null
    case "open.spotify.com": {
      const at = parts[0]?.startsWith("intl-") ? 1 : 0
      const kind = parts[at]
      const id = parts[at + 1]
      if (!/^(track|album|playlist|episode|show|artist)$/.test(kind || "") || !/^\w+$/.test(id || "")) return null
      return {
        provider: "spotify",
        name: "Spotify",
        src: `https://open.spotify.com/embed/${kind}/${id}`,
        height: kind === "track" || kind === "episode" ? 152 : 352,
        sandbox: SCRIPTS,
        allow: "encrypted-media; clipboard-write",
        referrerPolicy: NO_REFERRER,
      }
    }
    case "x.com":
    case "twitter.com":
    case "mobile.twitter.com":
      return parts[1] === "status" && /^\d+$/.test(parts[2] || "")
        ? { provider: "x", name: "X", src: `https://platform.twitter.com/embed/Tweet.html?id=${parts[2]}&dnt=true`, height: 480, sandbox: SCRIPTS, allow: "", referrerPolicy: NO_REFERRER }
        : null
  }
  return null
}

/** Whether an admin's entry covers a host: "embed.example.com", or "*.example.com" for its subdomains. Pure. */
export function hostAllowed(host: string, entries: readonly string[]): boolean {
  const h = host.toLowerCase()
  return entries.some((raw) => {
    const e = raw.trim().toLowerCase().replace(/\.$/, "")
    if (!e) return false
    if (e.startsWith("*.")) return h.endsWith(e.slice(1)) && h.length > e.length - 1
    return h === e
  })
}

/**
 * The embed a link makes, or null when it makes none: a built-in site's
 * player or viewer, else the link itself when an admin added its host (https
 * only, and never this app's own host: framed with scripts and its own origin,
 * a page of the app could reach out of its sandbox).
 */
export function embedFor(href: string, adminHosts: readonly string[] = [], appHost = typeof window !== "undefined" ? window.location.host : ""): Embed | null {
  let u: URL
  try {
    u = new URL(href.trim())
  } catch {
    return null
  }
  if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password) return null
  const host = u.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "")
  const builtIn = byHost(u, host)
  if (builtIn) return builtIn
  if (u.protocol !== "https:" || !hostAllowed(u.hostname, adminHosts)) return null
  if (appHost && u.host.toLowerCase() === appHost.toLowerCase()) return null
  return { provider: "site", name: u.hostname.replace(/^www\./, ""), src: u.toString(), height: 480, referrerPolicy: NO_REFERRER, ...APP }
}

/**
 * The origins a doc's built-in embeds are framed from (lib/embeds/providers.ts
 * makes each embed's address on one of them). The CSP's frame-src lists
 * exactly these (lib/security/csp.ts), so an embed the editor offers is one
 * the page lets in; providers.test.ts holds the two lists together. Kept in a
 * file of its own so the policy can name them without the providers' code.
 */
export const EMBED_FRAME_ORIGINS = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
  "https://www.loom.com",
  "https://www.figma.com",
  "https://docs.google.com",
  "https://www.google.com",
  "https://gist.github.com",
  "https://codepen.io",
  "https://excalidraw.com",
  "https://miro.com",
  "https://open.spotify.com",
  "https://platform.twitter.com",
] as const

/** The built-in embeds' sites by name, as Settings lists them (lib/embeds/providers.ts byHost). */
export const EMBED_SITE_NAMES = [
  "YouTube",
  "Vimeo",
  "Loom",
  "Figma",
  "Google Docs, Sheets, Slides, Forms and Maps",
  "GitHub Gist",
  "CodePen",
  "Excalidraw",
  "Miro",
  "Spotify",
  "X",
] as const

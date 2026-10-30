/**
 * Every field Search settings can land on (design-14, "search that lands on
 * the field"): its place (a SETTINGS_PLACES key), the words its row shows
 * and the id its control carries. A hit opens the place at
 * `#<id>`; the jump scrolls to the row, puts focus on its control and flashes
 * the row (hooks/useJumpFlash).
 *
 * Loaded with the search, never with the shell: lib/adminSections is on the
 * settings nav's first load. settingsFields.test.ts holds every worded row of
 * every settings place to this list, and every entry to a row that exists.
 */
import { settingIdOf } from "@/lib/settingsIds"
import type { SettingsHit, SettingsPlace } from "@/lib/adminSections"
import { flashCard } from "@/hooks/useJumpFlash"

export interface SettingsField {
  place: string
  label: string
  /** The control's id; a switch without one of its own takes settingIdOf(label). */
  id: string
  keywords?: string[]
}

const sw = (place: string, label: string, extra: Partial<SettingsField> = {}): SettingsField => ({ place, label, id: settingIdOf(label), ...extra })
const row = (place: string, label: string, id: string, extra: Partial<SettingsField> = {}): SettingsField => ({ place, label, id, ...extra })

export const SETTINGS_FIELDS: SettingsField[] = [
  // You
  row("profile", "Appear online", "appear-online", { keywords: ["status", "invisible", "presence"] }),
  sw("profile", "Put task due dates on my calendar"),
  row("profile", "Show me in Who knows", "who-knows-listed", { keywords: ["who knows", "expert", "suggested"] }),
  row("notifications", "Email me about activity", "email_enabled", { keywords: ["email"] }),
  row("notifications", "Only when I'm away", "email_only_when_offline", { keywords: ["offline", "away"] }),
  row("notifications", "Activity digest", "digest", { keywords: ["summary", "daily", "weekly"] }),
  row("notifications", "Hold notifications during quiet hours", "quiet_hours_enabled", { keywords: ["do not disturb", "dnd", "night"] }),
  row("notifications", "Send and see read receipts", "read-receipts", { keywords: ["seen"] }),
  row("notifications", "Record my views", "record-views", { keywords: ["viewed by", "page views", "privacy"] }),
  row("notifications", "Keywords", "notify-keywords", { keywords: ["alert", "words"] }),
  row("notifications", "VIPs", "notify-vips", { keywords: ["important people"] }),
  // Workspace
  row("email-settings", "Resend API key", "resend-key", { keywords: ["email provider", "smtp"] }),
  row("email-settings", "Sender address", "senderEmail", { keywords: ["from", "email"] }),
  row("email-settings", "Subject", "subject"),
  row("settings", "Largest file a member can upload", "upload-limit", { keywords: ["upload", "file size", "attachment"] }),
  row("settings", "Who can join without an invitation", "allowed-users", { keywords: ["domain", "sign up", "join"] }),
  sw("settings", "Allow read receipts", { keywords: ["seen"] }),
  row("settings", "Turn off push notifications", "push-turn-off", { keywords: ["push"] }),
  sw("permissions", "Members see when others are busy", { keywords: ["calendar", "free busy", "availability"] }),
  sw("security", "Allow guest links", { keywords: ["guest", "external"] }),
  sw("security", "Pages can be published to the web", { keywords: ["publish", "public"] }),
  sw("security", "Personal meeting rooms", { keywords: ["room", "meeting", "call", "guest"] }),
  row("security", "Point your identity provider here", "scim-endpoint", { keywords: ["scim", "provisioning", "okta"] }),
  // Admin › Docs (components/admin/DocPoliciesCard).
  row("docs", "Members can export docs", "docs-export", { keywords: ["download", "export"] }),
  row("docs", "Longest a link lasts", "docs-link-lifetime", { keywords: ["expiry", "guest link", "expires"] }),
  row("docs", "Sites docs can embed", "docs-embed-sites", { keywords: ["embed", "iframe", "allow list"] }),
  row("audit", "Days to keep", "retention-days", { keywords: ["retention", "audit log"] }),
  row("transcription", "Mode", "transcription-mode", { keywords: ["transcription", "captions"] }),
  row("transcription", "Where it runs", "stt-where", { keywords: ["speech to text"] }),
  row("transcription", "Provider", "stt-provider", { keywords: ["speech to text"] }),
  row("transcription", "Model", "stt-model", { keywords: ["speech to text", "whisper"] }),
  row("transcription", "Endpoint base URL", "stt-base-url"),
  row("transcription", "Language", "stt-language", { keywords: ["captions"] }),
  row("transcription", "API key", "stt-api-key", { keywords: ["speech to text"] }),
  row("transcription", "Service account JSON", "stt-google-json", { keywords: ["google"] }),
  // Connections and records
  sw("integrations", "Sync issue updates", { keywords: ["github"] }),
  sw("integrations", "Sync pull request updates", { keywords: ["github"] }),
  sw("integrations", "Create tasks automatically", { keywords: ["github"] }),
  row("archive", "Keep doc history for", "doc-history-days", { keywords: ["versions", "history"] }),
]

/** Fields whose words (or other words) hold the query, on the places a person may open. */
export function searchFields(query: string, open: ReadonlySet<string>, fields: SettingsField[] = SETTINGS_FIELDS): SettingsField[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return fields.filter((f) => open.has(f.place) && (f.label.toLowerCase().includes(q) || f.keywords?.some((k) => k.includes(q))))
}

/** Where a field hit goes: its place, at the field. */
export function fieldHref(field: SettingsField, placeHref: string): string {
  return `${placeHref}#${field.id}`
}

/** The search's field hits, after its places and cards: at most eight, on places the person can open. */
export function fieldHits(query: string, open: SettingsPlace[]): SettingsHit[] {
  const byKey = new Map(open.map((p) => [p.key, p]))
  return searchFields(query, new Set(byKey.keys()))
    .slice(0, 8)
    .map((f) => {
      const place = byKey.get(f.place)!
      return { place, field: { label: f.label, id: f.id, href: fieldHref(f, place.href) } }
    })
}

/**
 * After the nav opens a hit at `href`: on that page already, nothing
 * remounts to seek its card or field, so it
 * is sought here until it has drawn. Another page seeks it itself
 * (useJumpFlash). Here, not in the nav, so the jump stays off the shell's
 * first load.
 */
export function seekHit(href: string) {
  const [path, id] = [href.split(/[?#]/)[0], href.split("#")[1]]
  if (!id || window.location.pathname !== path) return
  let tries = 0
  const seek = () => {
    if (!flashCard(decodeURIComponent(id)) && ++tries < 20) window.setTimeout(seek, 150)
  }
  window.setTimeout(seek, 50)
}

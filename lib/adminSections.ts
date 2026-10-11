/**
 * The settings shell's map (design v3, admin §1.1): every place in Settings
 * and Admin, in the groups the settings nav lists them under, with the line
 * each page's header carries and the cards a search can land on.
 *
 * One list for three readers: the settings nav that takes the sidebar's place
 * on /app/admin* and /app/settings*, the admin page (which section a `?tab=`
 * opens and what its header says), and "Search settings", which matches a
 * section's name and the titles of the cards inside it.
 *
 * Admin sections keep their `?tab=` values, because links to them exist in
 * the wild (the setup checklist, the governance drill, bookmarks).
 */

import type { LucideIcon } from "lucide-react"
import {
  Activity,
  Archive,
  Bell,
  Database,
  FileCheck2,
  GitBranch,
  Key,
  KeyRound,
  Lock,
  Mail,
  Mic,
  Plug,
  ScrollText,
  ShieldAlert,
  SlidersHorizontal,
  User,
  UserPlus,
  Users,
  Users2,
  UserX,
  Webhook,
  Zap,
} from "@/lib/icons"
import type { CampHue } from "@/lib/campHue"
import { SETTINGS_SECTIONS, type SettingsSection } from "@/lib/settingsSections"

export type SettingsGroupKey = "you" | "workspace" | "ai" | "connections" | "records" | "system"

export interface SettingsPlace {
  /** A stable key: the admin `?tab=` value, or the settings page's last segment. */
  key: string
  label: string
  /** The header's one line under the title. */
  description: string
  href: string
  icon: LucideIcon
  hue: CampHue
  group: SettingsGroupKey
  /** Cards on the page a search can land on: their titles and anchor ids. */
  cards?: { title: string; id: string }[]
  /** Other words a person might search for. */
  keywords?: string[]
  /** Admin pages that need a server subsystem: "ai" or "calls". */
  gate?: "ai" | "calls"
  /** The "You" pages carry their settingsSections entry for access checks. */
  settings?: SettingsSection
  /** Opts the page into the 944px frame. */
  wide?: boolean
}

export const SETTINGS_GROUP_LABEL: Record<SettingsGroupKey, string> = {
  you: "You",
  workspace: "Workspace",
  ai: "Automation",
  connections: "Connections",
  records: "Records",
  system: "System",
}

/** The hue of each admin group: one per group, as ADMIN_GROUP_HUE set them. */
export const SETTINGS_GROUP_HUE: Record<Exclude<SettingsGroupKey, "you">, CampHue> = {
  workspace: "sky",
  ai: "dusk",
  connections: "lake",
  records: "sun",
  system: "moss",
}

const admin = (tab: string) => `/app/admin?tab=${tab}`

const fromSettings = (href: string, extra: Partial<SettingsPlace> = {}): SettingsPlace => {
  const s = SETTINGS_SECTIONS.find((x) => x.href === href)
  if (!s) throw new Error(`no settings section at ${href}`)
  return {
    key: href.split("/").pop() as string,
    label: s.label,
    description: s.description,
    href: s.href,
    icon: s.icon,
    hue: s.hue,
    group: "you",
    settings: s,
    ...extra,
  }
}

export const PROFILE_HREF = "/app/settings/profile"

export const SETTINGS_PLACES: SettingsPlace[] = [
  // ── You ──
  {
    key: "profile",
    label: "Profile",
    description: "Your name, photo, appearance and how you sign in.",
    href: PROFILE_HREF,
    icon: User,
    hue: "sky",
    group: "you",
    cards: [
      { title: "Name and handle", id: "profile-details" },
      { title: "Appear online", id: "profile-presence" },
      { title: "Appearance", id: "profile-appearance" },
      { title: "Theme", id: "profile-appearance" },
      { title: "Calendar", id: "profile-calendar" },
      { title: "Password", id: "profile-security" },
      { title: "Two-step sign-in", id: "profile-security" },
      { title: "Passkeys", id: "profile-security" },
    ],
    keywords: ["photo", "avatar", "name", "handle", "dark mode", "accent", "language"],
  },
  fromSettings("/app/settings/notifications", {
    icon: Bell,
    cards: [
      { title: "Email", id: "notifications-email" },
      { title: "Digest", id: "notifications-digest" },
      { title: "Quiet hours", id: "notifications-quiet" },
      { title: "Read receipts", id: "notifications-read-receipts" },
    ],
    keywords: ["push", "mute", "pause", "do not disturb"],
  }),
  fromSettings("/app/settings/connectors", { keywords: ["gmail", "google calendar", "github"] }),
  fromSettings("/app/settings/api-tokens", { icon: Key, keywords: ["token", "api key", "script"] }),
  fromSettings("/app/settings/workflows", { keywords: ["automation", "rules"] }),

  // ── Workspace (admins) ──
  {
    key: "users",
    label: "Members",
    description: "Everyone in the workspace, their role and how they sign in.",
    href: admin("users"),
    icon: Users2,
    hue: SETTINGS_GROUP_HUE.workspace,
    group: "workspace",
    wide: true,
    keywords: ["people", "deactivate", "seats", "two-factor", "users"],
  },
  {
    key: "admins",
    label: "Admins",
    description: "Who can change every setting here and read the audit log.",
    href: admin("admins"),
    icon: ShieldAlert,
    hue: SETTINGS_GROUP_HUE.workspace,
    group: "workspace",
    wide: true,
  },
  {
    key: "teams",
    label: "Teams",
    description: "Groups of people you can share projects with at once.",
    href: admin("teams"),
    icon: Users,
    hue: SETTINGS_GROUP_HUE.workspace,
    group: "workspace",
    wide: true,
  },
  {
    key: "invitations",
    label: "Invitations",
    description: "Who has been asked in, and the link that brings people in.",
    href: admin("invitations"),
    icon: UserPlus,
    hue: SETTINGS_GROUP_HUE.workspace,
    group: "workspace",
    wide: true,
    keywords: ["invite", "link", "resend"],
  },
  {
    key: "external-users",
    label: "External users",
    description: "People outside the company you've shared a channel or project with.",
    href: admin("external-users"),
    icon: UserX,
    hue: SETTINGS_GROUP_HUE.workspace,
    group: "workspace",
    wide: true,
    keywords: ["guests", "clients"],
  },
  {
    key: "settings",
    label: "General",
    description: "Uploads, who can join, and where new people start.",
    href: admin("settings"),
    icon: SlidersHorizontal,
    hue: SETTINGS_GROUP_HUE.workspace,
    group: "workspace",
    cards: [
      { title: "Workspace", id: "general-workspace" },
      { title: "Upload size", id: "general-workspace" },
      { title: "Who can join without an invitation", id: "general-workspace" },
      { title: "Where new members start", id: "general-channels" },
      { title: "Read receipts", id: "general-read-receipts" },
      { title: "Push notifications", id: "general-push" },
    ],
    keywords: ["domains", "allow list", "default channels"],
  },
  {
    key: "security",
    label: "Security",
    description: "Guest access, single sign-on and how members are provisioned.",
    href: admin("security"),
    icon: Lock,
    hue: SETTINGS_GROUP_HUE.workspace,
    group: "workspace",
    cards: [
      { title: "Guest access", id: "security-guests" },
      { title: "SCIM provisioning", id: "security-scim" },
    ],
    keywords: ["scim", "provisioning", "guests"],
  },
  {
    key: "permissions",
    label: "Permissions",
    description: "Who may make channels, projects and invitations.",
    href: admin("permissions"),
    icon: KeyRound,
    hue: SETTINGS_GROUP_HUE.workspace,
    group: "workspace",
  },
  {
    key: "email-settings",
    label: "Email",
    description: "How the workspace sends email, and what an invitation says.",
    href: admin("email-settings"),
    icon: Mail,
    hue: SETTINGS_GROUP_HUE.workspace,
    group: "workspace",
    // The template editor sits beside a live email frame from 820px of column.
    wide: true,
    cards: [
      { title: "Email provider", id: "email-provider" },
      { title: "Invitation email", id: "email-templates" },
    ],
    keywords: ["resend", "smtp", "template"],
  },

  // ── Automation ──

  {
    key: "workflows",
    label: "Workflows",
    description: "Rules that act when something happens, across the workspace.",
    href: admin("workflows"),
    icon: Zap,
    hue: SETTINGS_GROUP_HUE.ai,
    group: "ai",
    keywords: ["automation"],
  },
  {
    key: "transcription",
    label: "Transcription",
    description: "How calls and voice notes become text.",
    href: admin("transcription"),
    icon: Mic,
    hue: SETTINGS_GROUP_HUE.ai,
    group: "ai",
    gate: "calls",
    keywords: ["whisper", "captions"],
  },

  // ── Connections ──
  {
    key: "integrations",
    label: "Integrations",
    description: "GitHub, the Slack bridge and the providers people sign in with.",
    href: admin("integrations"),
    icon: GitBranch,
    hue: SETTINGS_GROUP_HUE.connections,
    group: "connections",
    cards: [
      { title: "Slack bridge", id: "integrations-slack" },
      { title: "GitHub", id: "integrations-github" },
      { title: "Sign-in providers", id: "integrations-oauth" },
      { title: "Single sign-on", id: "integrations-oauth" },
    ],
    keywords: ["slack", "github", "google", "oauth", "sso"],
  },
  {
    key: "apps",
    label: "Apps",
    description: "Apps and tools installed for everyone here.",
    href: admin("apps"),
    icon: Plug,
    hue: SETTINGS_GROUP_HUE.connections,
    group: "connections",
    keywords: ["marketplace", "mcp"],
  },
  {
    key: "webhooks",
    label: "Webhooks",
    description: "Events this workspace sends to your own services.",
    href: admin("webhooks"),
    icon: Webhook,
    hue: SETTINGS_GROUP_HUE.connections,
    group: "connections",
  },

  // ── Records ──
  {
    key: "audit",
    label: "Audit log",
    description: "Every change and refusal, in a chain you can verify.",
    href: admin("audit"),
    icon: ScrollText,
    hue: SETTINGS_GROUP_HUE.records,
    group: "records",
    wide: true,
    cards: [
      { title: "Monthly receipts", id: "audit-receipts" },
      { title: "Redaction window", id: "audit-retention" },
    ],
    keywords: ["verify", "export", "history", "retention"],
  },
  {
    key: "evidence",
    label: "Evidence pack",
    description: "A record of the log an auditor can check for themselves.",
    href: "/app/admin/evidence",
    icon: FileCheck2,
    hue: SETTINGS_GROUP_HUE.records,
    group: "records",
    keywords: ["compliance", "auditor", "pdf"],
  },
  {
    key: "archive",
    label: "Archive",
    description: "What is put away when it goes quiet, and how to bring it back.",
    href: admin("archive"),
    icon: Archive,
    hue: SETTINGS_GROUP_HUE.records,
    group: "records",
  },
  {
    key: "import",
    label: "Import",
    description: "Bring channels, projects and tasks from the tools you used before.",
    href: admin("import"),
    icon: Database,
    hue: SETTINGS_GROUP_HUE.records,
    group: "records",
    // Four source cards across need more than the 720px column.
    wide: true,
    keywords: ["slack", "asana", "jira", "trello", "clickup", "monday", "todoist", "linear", "migrate"],
  },

  // ── System ──
  {
    key: "health",
    label: "Health and updates",
    description: "This server's version and the state of every service it runs.",
    href: admin("health"),
    icon: Activity,
    hue: SETTINGS_GROUP_HUE.system,
    group: "system",
    keywords: ["version", "update", "status", "system check", "disk"],
    cards: [
      { title: "Updates", id: "health-updates" },
      { title: "Installation health", id: "health-installation" },
    ],
  },
]

/** An admin section by its `?tab=` value. */
export function adminPlace(tab: string): SettingsPlace | undefined {
  return SETTINGS_PLACES.find((p) => p.group !== "you" && p.key === tab)
}

/** The place a path (with its search) belongs to, for the nav's current row. */
export function placeForLocation(pathname: string, tab: string | null): SettingsPlace | undefined {
  if (pathname.startsWith("/app/admin/evidence")) return SETTINGS_PLACES.find((p) => p.key === "evidence")
  if (pathname.startsWith("/app/admin")) return adminPlace(normaliseAdminTab(tab, ""))
  return SETTINGS_PLACES.find((p) => p.group === "you" && pathname.startsWith(p.href))
}

/** Old `?tab=` values that still resolve: links to them exist. */
const TAB_ALIASES: Record<string, string> = { "slack-import": "import" }

/** The section a `?tab=` (and the hash) asks for, after the old aliases. */
export function normaliseAdminTab(tab: string | null, hash: string): string {
  const raw = tab || "users"
  // The audit log moved out of General; ?tab=settings#audit-log still lands on it.
  if (raw === "settings" && hash === "#audit-log") return "audit"
  return TAB_ALIASES[raw] ?? raw
}

/** Whether a path is inside the settings shell. */
export function inSettingsShell(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return pathname === "/app/admin" || pathname.startsWith("/app/admin/") || pathname === "/app/settings" || pathname.startsWith("/app/settings/")
}

export interface SettingsHit {
  place: SettingsPlace
  /** The card a hit landed on, when the words matched a card's title. */
  card?: { title: string; id: string }
}

/**
 * Search settings: a section by its name or keywords, or a card inside it by
 * its title. Sections that match by name come first, then cards.
 */
export function searchSettings(query: string, places: SettingsPlace[]): SettingsHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: SettingsHit[] = []
  const seen = new Set<string>()
  for (const place of places) {
    if (place.label.toLowerCase().includes(q) || place.keywords?.some((k) => k.includes(q))) {
      hits.push({ place })
      seen.add(place.key)
    }
  }
  for (const place of places) {
    for (const card of place.cards ?? []) {
      if (card.title.toLowerCase().includes(q) && !seen.has(`${place.key}#${card.id}`)) {
        if (!seen.has(place.key)) hits.push({ place, card })
        seen.add(`${place.key}#${card.id}`)
      }
    }
  }
  return hits
}

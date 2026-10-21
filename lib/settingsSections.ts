/**
 * A person's own settings, in one list: the settings page lists them, and
 * each section's page links back to it. Before this there was no /app/settings
 * (it was a 404) and each section was reachable only from the command palette
 * or the profile drawer, one at a time.
 *
 * Gating matches those two doors: `capability` asks whether this person may
 * use the section, `ai` whether this server has AI at all (the AI-free edition
 * never shows a door to a page that would turn them away).
 */

import type { LucideIcon } from "lucide-react"
import { Bell, Key, Plug, Zap } from "lucide-react"
import type { MarkHue } from "@/components/ui/graphics/hues"
import { CAP_WORKFLOW_MANAGE } from "@/services/capabilityService"

export interface SettingsSection {
  href: string
  label: string
  /** One line: what is decided there, not what the page is called. */
  description: string
  icon: LucideIcon
  /** Its tile here, on its page and in every menu: its area's hue (lib/areas), else ink. */
  hue: MarkHue
  capability?: string
  ai?: boolean
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    href: "/app/settings/notifications",
    label: "Notifications",
    description: "Which emails you get, quiet hours, and read receipts.",
    icon: Bell,
    hue: "ink",
  },
  {
    href: "/app/settings/connectors",
    label: "Connectors",
    description: "Your Gmail, Google Calendar and GitHub accounts.",
    icon: Plug,
    hue: "ink",
  },
  {
    href: "/app/settings/workflows",
    label: "Workflows",
    description: "Rules that act when something happens in a channel.",
    icon: Zap,
    hue: "ink",
    capability: CAP_WORKFLOW_MANAGE,
  },
  {
    href: "/app/settings/api-tokens",
    label: "API tokens",
    description: "Keys for scripts and outside tools that act as you.",
    icon: Key,
    hue: "ink",
  },
]

/** The section a settings page belongs to, by its address. */
export function settingsSection(href: string): SettingsSection | undefined {
  return SETTINGS_SECTIONS.find((s) => s.href === href)
}

/**
 * Whether a section is offered to this person on this server: "unknown" until
 * the answers it depends on are in, so a list can hold its place instead of
 * inserting it when they arrive.
 *
 * The server's AI decides first: a section that needs AI is never offered on a
 * server without it, whatever the person's permissions.
 */
export type SectionAccess = "shown" | "hidden" | "unknown"

export function sectionAccess(
  section: SettingsSection,
  answers: {
    can: (capability: string) => boolean
    /** Whether this person's permissions have been read. */
    capabilitiesKnown: boolean
    ai: "unknown" | "available" | "unavailable"
  },
): SectionAccess {
  if (section.ai) {
    if (answers.ai === "unavailable") return "hidden"
    if (answers.ai === "unknown") return "unknown"
  }
  if (section.capability) {
    if (!answers.capabilitiesKnown) return "unknown"
    return answers.can(section.capability) ? "shown" : "hidden"
  }
  return "shown"
}

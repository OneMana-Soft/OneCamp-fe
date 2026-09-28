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
import { CAP_WORKFLOW_MANAGE } from "@/services/capabilityService"

export interface SettingsSection {
  href: string
  label: string
  /** One line: what is decided there, not what the page is called. */
  description: string
  icon: LucideIcon
  capability?: string
  ai?: boolean
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    href: "/app/settings/notifications",
    label: "Notifications",
    description: "Which emails you get, and quiet hours.",
    icon: Bell,
  },
  {
    href: "/app/settings/connectors",
    label: "Connectors",
    description: "Your Gmail, Google Calendar and GitHub accounts.",
    icon: Plug,
  },
  {
    href: "/app/settings/workflows",
    label: "Workflows",
    description: "Rules that act when something happens in a channel.",
    icon: Zap,
    capability: CAP_WORKFLOW_MANAGE,
  },

  {
    href: "/app/settings/api-tokens",
    label: "API tokens",
    description: "Keys for scripts and outside tools that act as you.",
    icon: Key,
  },
]

/** The sections this person can open on this server. */
export function visibleSettingsSections(can: (capability: string) => boolean, aiAvailable: boolean): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => (!s.capability || can(s.capability)) && (!s.ai || aiAvailable))
}

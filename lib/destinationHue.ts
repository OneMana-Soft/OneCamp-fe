import { hueFor, type CampHue } from "@/lib/campHue"
import { settingsSection } from "@/lib/settingsSections"

/**
 * The hue of each place in the app, for the tile its icon sits on wherever it
 * is listed: the phone's More menu, the settings list, Home's cards (the
 * playful layer, "Tiles").
 *
 * One hue per place, chosen for what the place holds, so a destination is the
 * same colour on every screen that lists it. Places of one kind share a hue
 * (the AI pages are dusk).
 *
 * Settings paths defer to SETTINGS_SECTIONS (lib/settingsSections): each
 * section's hue is set once there, and its tile on the settings page, its
 * page's header and every menu that lists it (the phone's More menu) take
 * that one, so a section is one colour everywhere. That outranks the kinds
 * above: Assistants is sky, not dusk.
 *
 * A place not named here takes its path's hash, the same rule identity
 * colours follow (lib/campHue).
 */
const BY_PATH: Record<string, CampHue> = {
  "/app/myTask": "moss",
  "/app/channel": "sky",
  "/app/chat": "berry",
  "/app/inbox": "sky",
  "/app/later": "sun",
  "/app/calendar": "berry",
  "/app/doc": "lake",
  "/app/board": "dusk",
  "/app/tables": "moss",
  "/app/project": "sky",
  "/app/goals": "sun",
  "/app/activity": "berry",
  "/app/activity?tab=ai": "dusk",
  "/app/ai": "dusk",
  "/app/admin": "berry",
  "/app/templates": "dusk",
  "/app/team": "lake",
  invite: "moss",
}

export function destinationHue(path: string): CampHue {
  return settingsSection(path)?.hue ?? BY_PATH[path] ?? hueFor(path)
}

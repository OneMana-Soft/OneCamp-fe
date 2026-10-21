import type { MarkHue } from "@/components/ui/graphics/hues"
import { AREA_HUE, type Area } from "@/lib/areas"
import { settingsSection } from "@/lib/settingsSections"

/**
 * The hue of each place in the app, for the tile its icon sits on wherever it
 * is listed (More, the drawers, the settings list) and the sidebar's hover.
 *
 * Colour names an area (lib/areas): a place in an area wears that area's hue,
 * so Docs is dusk on every screen, as on the site. A settings page takes its
 * section's (lib/settingsSections). Every other place names no area and is
 * ink: Home, the inbox, Later, Mail, Teams, Admin, Templates.
 */
const AREA_PLACES = {
  "/app/channel": "chat",
  "/app/chat": "chat",
  "/app/recordings": "calls",
  "/app/doc": "docs",
  "/app/myTask": "projects",
  "/app/project": "projects",
  "/app/board": "projects",
  "/app/goals": "projects",
  "/app/calendar": "calendar",
  "/app/tables": "tables",
  "/app/ai": "agents",
  "/app/inbox?tab=ai": "agents",
} as const satisfies Record<string, Area>

type Places = typeof AREA_PLACES

/** An area's place answers its area's own hue, so "/app/doc" is typed as the docs' hue. */
export function destinationHue<P extends string>(path: P): P extends keyof Places ? (typeof AREA_HUE)[Places[P]] : MarkHue
export function destinationHue(path: string): MarkHue {
  const area: Area | undefined = AREA_PLACES[path as keyof Places]
  return area ? AREA_HUE[area] : (settingsSection(path)?.hue ?? "ink")
}

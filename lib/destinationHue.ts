import { hueFor, type CampHue } from "@/lib/campHue"

/**
 * The hue of each place in the app, for the tile its icon sits on wherever it
 * is listed: the phone's More menu, the settings list, Home's cards (the
 * playful layer, "Tiles").
 *
 * One hue per place, chosen for what the place holds, so a destination is the
 * same colour on every screen that lists it. Places of one kind share a hue
 * (everything AI is dusk). A place not named here takes its path's hash, the
 * same rule identity colours follow (lib/campHue).
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
  "/app/settings/agents": "dusk",
  "/app/settings/assistants": "dusk",
  "/app/admin": "berry",
  "/app/settings/connectors": "lake",
  "/app/settings/workflows": "sun",
  "/app/settings/notifications": "sky",
  "/app/settings/api-tokens": "moss",
  "/app/templates": "dusk",
  "/app/team": "lake",
  invite: "moss",
}

export function destinationHue(path: string): CampHue {
  return BY_PATH[path] ?? hueFor(path)
}

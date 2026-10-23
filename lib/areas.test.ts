import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { AREA_HUE, areaHue, type Area } from "./areas"
import { CAMP_HUES } from "./campHue"
import { COMMAND_AREA } from "@/components/ui/CommandPalette"
import { HUE_CLASS, type MarkHue } from "@/components/ui/graphics/hues"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { destinationHue } from "./destinationHue"
import { SETTINGS_SECTIONS } from "./settingsSections"
import { SETTINGS_GROUP_HUE, SETTINGS_PLACES } from "./adminSections"

/**
 * COLOUR NAMES AN AREA (design v3.1, "a calm frame, coloured areas"; STEP5 #9
 * and spec G). Each part of OneCamp wears one hue wherever it appears: its
 * tab, its tile, the dot beside its name. Seen twice, a hue is learned, so a
 * buyer reads dusk as docs before the word. lib/areas.ts writes each hue
 * once, kept small enough for any first screen to carry, and the storefront
 * wears the same ones (onemana-frontend lib/areas.ts, which also names each
 * area). What each covers, so a new feature knows its colour:
 * - chat, sky: channels, direct messages, threads, guests, polls, check-ins,
 *   the Slack bridge;
 * - calls, berry: calls, huddles, voice, video and screen clips, recordings;
 * - docs, dusk: docs, the page tree, comments, versions, imports;
 * - projects, moss: tasks, boards, lists, timelines, cycles, goals, reports,
 *   forms, time;
 * - calendar, sun: events, booking pages, focus time, Google Calendar;
 * - tables, lake: tables, formulas, linked rows and rollups;
 * - agents, the agents' indigo (never dusk): agents, OneCamp AI's answers and
 *   the record of what they did.
 * Anything that isn't an area (Home, the inbox, setup, money, the law) is
 * neutral ink, and the brand's orange is spent only on what you press. These
 * pin the table and every place the app marks an area with it: Home's guide,
 * the palette, the empty states, the tab dots, the places and the settings.
 * Calendar event colours and identity hues (people, projects, channels, docs)
 * are not area hues.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8")
const AREAS = Object.keys(AREA_HUE) as Area[]
const isArea = (value: unknown): value is Area => typeof value === "string" && Object.hasOwn(AREA_HUE, value)

/** The app's own source files, tests left out. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return /node_modules|\.next/.test(path) ? [] : sources(path)
    return /\.(tsx?)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe("the areas' table", () => {
  it("pins each area's hue, as the storefront wears them", () => {
    expect(AREA_HUE).toEqual({
      chat: "sky",
      calls: "berry",
      docs: "dusk",
      projects: "moss",
      calendar: "sun",
      tables: "lake",
      agents: "agent",
    })
    const camp = AREAS.filter((a) => a !== "agents").map(areaHue)
    // The six camp hues go one to an area; the agents keep the agents' indigo.
    expect([...camp].sort()).toEqual([...CAMP_HUES].sort())
    expect(AREAS).toEqual(["chat", "calls", "docs", "projects", "calendar", "tables", "agents"])
  })

  it("is the one source: no second table, and nothing imports one", () => {
    // lib/areaHues was a copy for first screens; lib/areas is that small now.
    expect(existsSync(join(process.cwd(), "lib/areaHues.ts"))).toBe(false)
    const copies = ["app", "components", "lib", "hooks"].flatMap(sources).filter((f) => /lib\/areaHues/.test(read(f)))
    expect(copies).toEqual([])
    // It imports nothing: every first screen that names an area carries it.
    expect(read("lib/areas.ts")).not.toMatch(/^import /m)
    expect(read("lib/areas.ts").length).toBeLessThan(400)
  })

  it("draws the agents in the agent's indigo, and what names no area in neutral ink", () => {
    expect(HUE_CLASS.agent).toBe("hue-agent")
    expect(HUE_CLASS.ink).toBe("hue-ink")
    const css = read("app/globals.css")
    expect(css).toMatch(/@utility hue-agent \{\s*--hue: var\(--agent\);/)
    expect(css).toMatch(/@utility hue-ink \{\s*--hue: var\(--muted-foreground\);/)
    for (const h of CAMP_HUES) expect(HUE_CLASS[h]).toBe(`hue-${h}`)
    // The interaction layer tints in the same hues, ink as a neutral wash.
    expect(read("app/interaction.css")).toMatch(/\[data-hue="ink"\] \{[^}]*--ix-hue: var\(--ink\);/)
  })
})

describe("every mark of an area takes the area's hue", () => {
  it("the palette: a command that opens an area sits on that area's tile", () => {
    for (const [id, area] of Object.entries(COMMAND_AREA)) expect(isArea(area), id).toBe(true)
    expect(COMMAND_AREA["create-doc"]).toBe("docs")
    expect(COMMAND_AREA["create-event"]).toBe("calendar")
    expect(COMMAND_AREA["start-instant-meeting"]).toBe("calls")
    expect(COMMAND_AREA["nav-home"]).toBeUndefined()
    expect(COMMAND_AREA["settings"]).toBeUndefined()
    // Connectors name no area. Memory is the agents', which this edition doesn't have (E1): its palette offers none.
    const src = read("components/ui/CommandPalette.tsx")
    expect(src).not.toMatch(/case "(gmail|github)": return <Tile hue="(sky|moss|sun|lake|dusk|berry)"/)
    expect(src).not.toMatch(/case "memory":/)
  })

  it("the empty states of an area's own pages draw in the area's hue", () => {
    const pages: [string, string][] = [
      ["app/app/doc/trash/page.tsx", "docs"],
      ["components/doc/docListResult.tsx", "docs"],
      ["components/docTree/SpaceDocs.tsx", "docs"],
      ["app/app/tables/page.tsx", "tables"],
      ["components/project/ProjectsOverview.tsx", "projects"],
      ["components/project/ProjectsWorkload.tsx", "projects"],
      ["components/reports/ReportsView.tsx", "projects"],
      ["components/goals/GoalsView.tsx", "projects"],
      ["components/task/cyclesSwitcher.tsx", "projects"],
    ]
    for (const [file, area] of pages) {
      const src = read(file)
      expect(src, file).toContain(`areaHue("${area}")`)
      expect(src, file).not.toMatch(/<Spot[A-Za-z]+[^>]* hue="(sky|moss|sun|lake|dusk|berry)"/)
    }
  })

  it("the phone's tab dots: Channels and DMs wear Chat's hue; Home and the inbox none", () => {
    const src = read("components/navigationBar/mobile/mobileBottomNavigationBar.tsx")
    expect(src).toMatch(/label: "Channels"[^}]*area: "chat"/)
    expect(src).toMatch(/label: "DMs"[^}]*area: "chat"/)
    expect(src).not.toMatch(/label: "(Home|Inbox)"[^}]*area:/)
    expect(read("app/phone.css")).toMatch(/\.phone-tab-dot\[data-area\] \{\s*background: var\(--hue\);/)
  })

  it("calendar event colours stay the events' own: the calendar's tones never read the area table", () => {
    expect(read("components/calendar/calendarTones.ts")).not.toMatch(/lib\/areas/)
  })
})

describe("every place wears its area's hue, and what names no area ink", () => {
  it("pins each area's places: docs dusk, tables lake, projects moss, chat sky, calls berry, calendar sun, agents indigo", () => {
    const places: [string, MarkHue][] = [
      ["/app/doc", "dusk"],
      ["/app/tables", "lake"],
      ["/app/myTask", "moss"],
      ["/app/project", "moss"],
      ["/app/board", "moss"],
      ["/app/goals", "moss"],
      ["/app/channel", "sky"],
      ["/app/chat", "sky"],
      ["/app/recordings", "berry"],
      ["/app/calendar", "sun"],
      ["/app/ai", "agent"],
      ["/app/inbox?tab=ai", "agent"],
    ]
    for (const [path, hue] of places) expect(destinationHue(path), path).toBe(hue)
    // Read from the table, never written beside it.
    expect(destinationHue("/app/doc")).toBe(AREA_HUE.docs)
    expect(read("lib/destinationHue.ts")).not.toMatch(/"(sky|moss|sun|lake|dusk|berry)"/)
  })

  it("has a class for every hue a place can wear, so no surface reads one it can't draw", () => {
    // The More sheet, the workspace sheet, the sidebar and the settings list
    // draw a place's hue through HUE_CLASS; ink and the agents' indigo are
    // keys of it like the camp hues.
    const paths = ["/app/home", "/app/inbox", "/app/later", "/app/mail", "/app/team", "/app/admin", "/app/templates", "invite", "/app/doc", "/app/tables", "/app/myTask", "/app/project", "/app/board", "/app/goals", "/app/channel", "/app/chat", "/app/recordings", "/app/calendar", "/app/ai", "/app/inbox?tab=ai", ...SETTINGS_SECTIONS.map((s) => s.href)]
    for (const path of paths) expect(HUE_CLASS[destinationHue(path)], path).toMatch(/^hue-(sky|moss|sun|dusk|berry|lake|agent|ink)$/)
    for (const hue of [...Object.values(AREA_HUE), ...Object.values(ADMIN_GROUP_HUE), ...Object.values(SETTINGS_GROUP_HUE)]) expect(HUE_CLASS[hue], hue).toBeTruthy()
  })

  it("draws every place that names no area in ink, never a hash of its path", () => {
    for (const path of ["/app/home", "/app/inbox", "/app/later", "/app/mail", "/app/team", "/app/admin", "/app/templates", "invite", "/app/a-page-added-later"]) {
      expect(destinationHue(path), path).toBe("ink")
    }
  })

  it("gives a settings section its area's hue and any other ink, wherever it is listed", () => {
    expect(Object.fromEntries(SETTINGS_SECTIONS.map((s) => [s.href, s.hue]))).toEqual({
      "/app/settings/notifications": "ink",
      "/app/settings/connectors": "ink",
      "/app/settings/workflows": "ink",
      "/app/settings/api-tokens": "ink",
    })
    for (const s of SETTINGS_SECTIONS) expect(destinationHue(s.href), s.href).toBe(s.hue)
    // The agents' sections wear the agents' area hue, the table's own.
    expect(SETTINGS_SECTIONS.filter((s) => s.hue !== "ink").every((s) => s.hue === AREA_HUE.agents)).toBe(true)
    // The admin's groups follow the same rule: AI is the agents', the rest ink.
    expect(SETTINGS_GROUP_HUE).toEqual({ workspace: "ink", ai: "agent", connections: "ink", records: "ink", system: "ink" })
    expect(ADMIN_GROUP_HUE).toEqual({ people: "ink", workspace: "ink", ai: "agent", connections: "ink", system: "ink" })
    for (const p of SETTINGS_PLACES) expect(["ink", "agent"], p.key).toContain(p.hue)
  })

  it("marks a guest in sun wherever a Guest tag is drawn (design v3: Guest is sun)", () => {
    expect(read("components/ui/principalTag.tsx")).toMatch(/guest: \{ label: "Guest"[^}]*tone: "bg-camp-sun-tint text-camp-sun-ink"/)
    expect(read("components/channel/channelGuestTag.tsx")).toMatch(/bg-camp-sun-tint text-camp-sun-ink/)
    expect(read("app/styles/admin/people.css")).toMatch(/\.people-tag-guest \{\s*background: var\(--camp-sun-tint\);\s*color: var\(--camp-sun-ink\);/)
    // Every hand-drawn tag that reads "Guest" draws it in sun.
    const tags = [
      "components/calendar/rsvp/guestFaces.tsx",
      "components/calendar/rsvp/guestList.tsx",
      "components/livekit/CallStage.tsx",
      "components/project/ProjectShareDialog.tsx",
      "app/guest/p/[token]/page.tsx",
    ]
    for (const f of tags) {
      const drawn = [...read(f).matchAll(/className=(?:"[^"]*"|\{[^}]*\})>Guest</g)].map((m) => m[0])
      expect(drawn.length, f).toBeGreaterThan(0)
      for (const d of drawn) expect(d, f).toMatch(/camp-sun|HUE_CLASS\.sun/)
    }
  })
})

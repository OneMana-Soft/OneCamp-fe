import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { avatarHueClass } from "@/components/ui/graphics/hues"
import { hueFor } from "@/lib/campHue"
import { displayNameOf } from "@/lib/personName"
import { avatarSeed, getAvatarFallbackClass, personHue } from "@/lib/utils/getAvatarColor"

/**
 * One colour per person, on every screen (design v3 §3.9).
 *
 * A person's colour comes from one place, lib/utils/getAvatarColor:
 *   - an IdentityMark avatar is keyed by avatarSeed(person), their display name;
 *   - anything else that colours a person (a call tile, a speaking ring, a
 *     caption's name, a mention's dot, a cursor, an invite's face) uses
 *     personHue(person), and the older avatars getAvatarFallbackClass(name).
 * On 11 Oct the project board, the task list, the timeline and the header's
 * stack keyed people by uuid while the sidebar, messages and the task panel
 * keyed them by name: Sam Rivera was lake in the panel and sun in the list
 * beside it.
 *
 * Nothing hashes a person's id to a colour locally. `hueFor` itself is for
 * things that are not people (projects, events, tables, tags, places), and
 * only the files below call it directly.
 */

// Files that call hueFor directly, each for something that isn't a person.
// A new file that colours something by hueFor goes here once it is checked
// that the something is not a person; a person goes through personHue.
const NON_PERSON_HUE = new Set([
  "lib/campHue.ts", // the hash itself
  "lib/utils/getAvatarColor.ts", // the person functions, built on it
  "lib/projectHue.ts", // projects: their own hue, shared out among the reader's
  "lib/destinationHue.ts", // places
  "lib/tags.ts", // tags
  "components/ui/graphics/IdentityMark.tsx", // the mark, keyed by its caller
  "components/ui/chip.tsx", // option and tag chips
  "components/colorIcon/colorIcon.tsx", // projects, channels
  "components/guest/guestUi.tsx", // the workspace's own hue
  "components/projectTemplates/TemplatePicker.tsx", // templates
  "app/app/templates/page.tsx", // templates
  "components/tags/TagPicker.tsx", // tags
  "components/recording/recordingListRecording.tsx", // places
  "components/calendar/calendarTones.ts", // projects, events
  "components/message/WorkLinkCards.tsx", // projects, docs, tables
  "components/task/taskListTask.tsx", // tags
  "components/home/GreetingComposition.tsx", // events (people via personHue)
  "components/home/Greeting.tsx", // events
  "components/home/TodayAgenda.tsx", // events
  "components/admin/AdminTeamList.tsx", // teams
  "components/table/TableGlyph.tsx", // tables
  "components/table/DataTableCalendar.tsx", // tables
  "components/table/DataTableChart.tsx", // tables
  "components/table/DataTableBoard.tsx", // tables
  "app/admin-setup/page.tsx", // setup steps
  "app/app/tables/[table-id]/page.tsx", // tables
  "app/f/[token]/page.tsx", // forms
  "app/app/(showcase)/playful-dev/PlayfulShowcase.tsx", // the palette itself
])

// A hueFor argument that names a person, in any file.
const PERSONISH = /\b(user|author|actor|person|participant|identity|selfId|sender|guest|owner|assignee|member|viewer|email|mention|collaborator|inviter|who)\w*/i

function files(path: string): string[] {
  const s = statSync(path)
  if (s.isFile()) return [path]
  if (/node_modules|\.next|test-results/.test(path)) return []
  return readdirSync(path).flatMap((name) => files(join(path, name)))
}

const sources = ["app", "components", "hooks", "lib"]
  .flatMap(files)
  .filter((f) => /\.(tsx?|mjs)$/.test(f) && !/\.test\.tsx?$/.test(f))

/** Code without comments, so a doc comment that names a call doesn't count. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/** Each call's argument text, its parentheses balanced. */
function callArgs(src: string, fn: string): string[] {
  const out: string[] = []
  const re = new RegExp(`\\b${fn}\\(`, "g")
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 1
    let i = m.index + m[0].length
    for (; i < src.length && depth; i++) {
      if (src[i] === "(") depth++
      else if (src[i] === ")") depth--
    }
    out.push(src.slice(m.index + m[0].length, i - 1))
  }
  return out
}

describe("one colour per person", () => {
  it("has one seed: the display name, whichever function draws the person", () => {
    const sam = { user_uuid: "f7a3a5b8-8ed1-4abc-b7f5-b53cd125f221", user_name: "Sam Rivera" }
    expect(avatarSeed(sam)).toBe(displayNameOf(sam))
    expect(personHue(sam)).toBe(hueFor("Sam Rivera"))
    // The IdentityMark avatar, the older fallback and personHue land on one hue.
    expect(avatarHueClass(hueFor(avatarSeed(sam)))).toBe(getAvatarFallbackClass(displayNameOf(sam)))
    expect(personHue(" Sam Rivera ")).toBe(personHue(sam))
    // Before someone has a name, their address's name part stands in, as displayNameOf does.
    expect(personHue({ user_email_id: "priya@acme.com" })).toBe(hueFor("priya"))
    expect(avatarSeed(null)).toBe("")
    // With nothing to go on, their id; a colour they picked wins over both
    // (the hub's personHue(name, id, chosen), folded in here on 12 Oct).
    expect(avatarSeed({ user_uuid: sam.user_uuid })).toBe(sam.user_uuid)
    expect(personHue({ user_id: sam.user_uuid })).toBe(hueFor(sam.user_uuid))
    expect(personHue(sam, "#EC4899")).toBe("berry")
  })

  it("scans the whole app", () => {
    expect(sources.length).toBeGreaterThan(500)
  })

  it("keys every IdentityMark avatar by avatarSeed", () => {
    const offenders: string[] = []
    for (const f of sources) {
      const src = code(readFileSync(f, "utf8"))
      for (const m of src.matchAll(/<IdentityMark\b[\s\S]*?\/>/g)) {
        const el = m[0]
        if (!/variant="avatar"/.test(el)) continue
        if (!/\bid=\{avatarSeed\(/.test(el)) offenders.push(`${f}: ${el.replace(/\s+/g, " ").slice(0, 140)}`)
        if (/chosen=\{[^}]*theme/i.test(el)) offenders.push(`${f}: an app theme is not an avatar colour: ${el.replace(/\s+/g, " ").slice(0, 140)}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("calls hueFor directly only for things that are not people", () => {
    const offenders: string[] = []
    for (const f of sources) {
      const src = code(readFileSync(f, "utf8"))
      const args = callArgs(src, "hueFor")
      if (!args.length) continue
      if (!NON_PERSON_HUE.has(f)) offenders.push(`${f}: colour a person with personHue or avatarSeed (lib/utils/getAvatarColor); a project, event, table or tag goes in NON_PERSON_HUE`)
      for (const a of args) if (PERSONISH.test(a) && f !== "lib/utils/getAvatarColor.ts") offenders.push(`${f}: hueFor(${a}) colours a person by a key of its own; use personHue`)
    }
    expect(offenders).toEqual([])
  })

  it("never seeds an avatar with an id, and never hashes a colour locally", () => {
    const offenders: string[] = []
    for (const f of sources) {
      const src = code(readFileSync(f, "utf8"))
      for (const a of callArgs(src, "getAvatarFallbackClass")) if (/uuid|_id\b|\bid\b|Id\b/.test(a)) offenders.push(`${f}: getAvatarFallbackClass(${a})`)
      // An address stands in for a name before someone has one (an invite).
      const id = (a: string) => /uuid|\.id\b|Id\b/.test(a) || /_id\b/.test(a.replace(/user_email_id/g, ""))
      for (const a of callArgs(src, "personHue")) if (id(a)) offenders.push(`${f}: personHue(${a}) is given an id`)
      for (const a of callArgs(src, "avatarSeed")) if (id(a)) offenders.push(`${f}: avatarSeed(${a}) is given an id`)
      // lib/celebrate cycles the hues for a burst's sparks: nobody's colour.
      // lib/projectHue shares the hues out among projects, from each one's hueFor.
      if (!["lib/campHue.ts", "lib/celebrate.ts", "lib/projectHue.ts"].includes(f) && /CAMP_HUES\s*\[|%\s*CAMP_HUES\.length/.test(src)) offenders.push(`${f}: picks a camp hue by its own hash`)
      if (/charCodeAt/.test(src) && /avatar/i.test(src)) offenders.push(`${f}: hashes text in a file that draws avatars`)
    }
    expect(offenders).toEqual([])
  })
})

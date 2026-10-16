import { describe, expect, it } from "vitest"
import { attrValue, byDay, creditLine, creditsOf, reasonOf, versionTitle, versionWhen, type DocVersion } from "./versions"

const now = new Date("2026-10-13T15:00:00")
const at = (iso: string): DocVersion => ({ id: iso, kind: "doc", pinned: false, contributors: [], created_at: new Date(iso).toISOString() })

const people = {
  maya: { name: "Maya Chen" },
  sam: { name: "Sam Rivera" },
  captain: { name: "Release Captain" },
}

describe("who a version credits", () => {
  it("names an agent with the person who asked it, and each person once", () => {
    const v: DocVersion = {
      ...at("2026-10-13T14:00:00"),
      contributors: [{ user_uuid: "maya" }, { agent_uuid: "captain", asker_uuid: "sam" }, { user_uuid: "maya" }, { user_uuid: "sam" }],
    }
    const credits = creditsOf(v, people)
    expect(credits.map((c) => c.label)).toEqual(["Maya Chen", "Release Captain for Sam Rivera", "Sam Rivera"])
    expect(credits[1].face).toMatchObject({ id: "captain", agent: true })
    expect(creditLine(credits)).toBe("Maya Chen, Release Captain for Sam Rivera and 1 more")
  })

  it("says who it can when the server couldn't name someone", () => {
    const v: DocVersion = { ...at("2026-10-13T14:00:00"), contributors: [{ user_uuid: "gone" }, { agent_uuid: "bot" }] }
    expect(creditsOf(v, null).map((c) => c.label)).toEqual(["Someone", "An agent"])
  })

  it("joins two names with 'and'", () => {
    const v: DocVersion = { ...at("2026-10-13T14:00:00"), contributors: [{ user_uuid: "maya" }, { user_uuid: "sam" }] }
    expect(creditLine(creditsOf(v, people))).toBe("Maya Chen and Sam Rivera")
  })
})

describe("why a version was kept", () => {
  it("says only what is worth saying", () => {
    expect(reasonOf({ ...at("2026-10-13T14:00:00"), reason: "interval" }, [])).toBeNull()
    expect(reasonOf({ ...at("2026-10-13T14:00:00"), reason: "idle" }, [])).toBeNull()
    expect(reasonOf({ ...at("2026-10-13T14:00:00"), reason: "mass_delete" }, [])).toEqual({ label: "Before a large deletion", warning: true })
    expect(reasonOf({ ...at("2026-10-13T14:00:00"), reason: "manual" }, [])?.label).toBe("Before a restore")
    expect(reasonOf({ ...at("2026-10-13T14:00:00"), reason: "saved" }, [])?.label).toBe("Saved")
    expect(reasonOf({ ...at("2026-10-13T14:00:00"), reason: "saved", name: "Sent to Acme" }, [])).toBeNull()
  })

  it("names the agent a version was kept before", () => {
    const v: DocVersion = { ...at("2026-10-13T14:00:00"), kind: "agent_run", reason: "before_write", contributors: [{ agent_uuid: "captain", asker_uuid: "sam" }] }
    expect(reasonOf(v, creditsOf(v, people))?.label).toBe("Before Release Captain's edit")
  })
})

describe("a version's day and name", () => {
  it("groups versions by day, newest first", () => {
    const days = byDay([at("2026-10-13T14:00:00"), at("2026-10-13T09:00:00"), at("2026-10-12T18:00:00"), at("2026-10-01T10:00:00")], now)
    expect(days.map((d) => [d.day, d.versions.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      ["Thu 1 Oct", 1],
    ])
  })

  it("is called by its name, else by when it was kept", () => {
    expect(versionWhen(at("2026-10-12T18:05:00"), now)).toBe("Yesterday, 6:05 PM")
    expect(versionTitle({ ...at("2026-10-12T18:05:00"), name: "  Sent to Acme " }, now)).toBe("Sent to Acme")
  })

  it("escapes a value for a quoted attribute selector", () => {
    expect(attrValue('a"b\\c')).toBe('a\\"b\\\\c')
  })
})

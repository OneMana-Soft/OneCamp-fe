import { describe, expect, it } from "vitest"
import { companionOf, foldCompanions, isCompanion, personOf, stageTracksOf } from "./companion"

// Another device of someone in a call (meet-04): the server draws a
// companion's LiveKit identity, "<their graph uid>~c~<12 lowercase hex>"
// (backend livekitInit companion.go), and lets it publish only a screen. The
// web reads it to keep one row and one face per person.
const MAYA = "0x1a2b"
const MAYA_PHONE = `${MAYA}~c~0123456789ab`

describe("a companion's identity", () => {
  it("personOf reads a companion's person and leaves anyone else alone", () => {
    expect(personOf(MAYA_PHONE)).toBe(MAYA)
    expect(companionOf(MAYA_PHONE)).toBe(MAYA)
    for (const other of [MAYA, "guest-g1-x7", "agent-1", "recorder", ""]) {
      expect(personOf(other)).toBe(other)
      expect(companionOf(other)).toBeUndefined()
    }
  })

  it("isCompanion only for <uid>~c~<12 hex>, as the server draws it", () => {
    expect(isCompanion(MAYA_PHONE)).toBe(true)
    // Not the server's: no graph uid, a short or upper-case tag, a guest's name.
    for (const no of [MAYA, "maya~c~0123456789ab", `${MAYA}~c~0123`, `${MAYA}~c~0123456789AB`, `${MAYA}~c~0123456789abc`, "guest-x~c~0123456789ab"]) {
      expect(isCompanion(no)).toBe(false)
    }
  })
})

describe("the people fold", () => {
  const row = (identity: string, sharing = false) => ({ identity, sharing })
  const merge = (r: ReturnType<typeof row>, c: ReturnType<typeof row>) => ({ ...r, sharing: r.sharing || c.sharing })

  it("puts a companion on its person's row, never a row of its own", () => {
    const rows = foldCompanions([row(MAYA_PHONE, true), row(MAYA), row("0x9")], merge)
    expect(rows).toEqual([row(MAYA, true), row("0x9")])
  })

  it("lets a companion stand for its person while only it is here", () => {
    // Their other device left: the companion keeps them in "who's in", once.
    const second = `${MAYA}~c~ba9876543210`
    expect(foldCompanions([row("0x9"), row(MAYA_PHONE), row(second, true)], merge)).toEqual([row("0x9"), row(MAYA_PHONE, true)])
  })
})

describe("the tiles fold", () => {
  const tile = (identity: string, source: string) => ({ participant: { identity }, source })

  it("keeps a companion's screen as its person's, and never draws it a face", () => {
    const tiles = [tile(MAYA, "camera"), tile(MAYA_PHONE, "camera"), tile(MAYA_PHONE, "screen_share"), tile("0x9", "camera")]
    expect(stageTracksOf(tiles)).toEqual([tile(MAYA, "camera"), tile(MAYA_PHONE, "screen_share"), tile("0x9", "camera")])
  })
})

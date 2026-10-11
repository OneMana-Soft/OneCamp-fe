import { describe, expect, it } from "vitest"
import { matchScore, normaliseQuery, paletteTargets, rankTargets } from "@/lib/search/paletteMatch"

describe("matchScore", () => {
  it("ranks a whole match over a prefix over a word start over a substring over a keyword", () => {
    const s = (q: string) => matchScore(q, "Q4 launch", ["release"])
    expect(s("q4 launch")).toBeGreaterThan(s("q4 l"))
    expect(s("q4")).toBeGreaterThan(s("laun"))
    expect(s("laun")).toBeGreaterThan(s("aunch"))
    expect(s("aunch")).toBeGreaterThan(s("rel"))
    expect(s("zzz")).toBe(0)
  })

  it("ignores case, accents and a leading # or @", () => {
    expect(normaliseQuery("  #Café  Plans ")).toBe("cafe plans")
    expect(matchScore("#eng", "engineering")).toBeGreaterThan(0)
    expect(matchScore("@maya", "Maya Chen")).toBeGreaterThan(0)
    expect(matchScore("resume", "Résumé review")).toBeGreaterThan(0)
  })
})

describe("paletteTargets", () => {
  const sidebar = {
    userChannels: [{ ch_uuid: "c1", ch_name: "engineering", ch_private: false }, { ch_uuid: "c2", ch_name: "acme", ch_private: true }],
    userChats: [
      { dm_grouping_id: "me m1", dm_unread: 0, dm_notification_type: "", dm_participants: [{ user_uuid: "me", user_name: "Sam" }, { user_uuid: "m1", user_name: "Maya Chen" }] },
      { dm_grouping_id: "0123456789abcdef0123456789abcdef", dm_unread: 0, dm_notification_type: "", dm_participants: [{ user_uuid: "me", user_name: "Sam" }, { user_uuid: "m1", user_name: "Maya Chen" }, { user_uuid: "j1", user_name: "Jonas Weber" }] },
    ],
    userProjects: [{ uid: "", project_uuid: "p1", project_name: "Q4 launch" }],
    userTeams: [{ id: "", team_uuid: "t1", team_name: "Launch" }],
    userDocs: [{ doc_uuid: "d1", doc_title: "Q4 launch plan" }],
    userBoards: [{ board_uuid: "b1", board_title: "" }],
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const targets = paletteTargets(sidebar as any, "me")

  it("turns the sidebar into places with their real paths", () => {
    expect(targets.map((t) => t.path)).toEqual([
      "/app/channel/c1",
      "/app/channel/c2",
      "/app/chat/m1",
      "/app/chat/group/0123456789abcdef0123456789abcdef",
      "/app/project/p1",
      "/app/team/t1",
      "/app/doc/d1",
      "/app/board/b1",
    ])
    expect(targets.find((t) => t.id === "c2")?.isPrivate).toBe(true)
    // A DM is named for the other people in it, never for yourself.
    expect(targets[2].label).toBe("Maya Chen")
    expect(targets[3].label).toBe("Maya Chen, Jonas Weber")
    expect(targets[7].label).toBe("Untitled board")
  })

  it("finds them as you type, best first", () => {
    expect(rankTargets("q4", targets).map((t) => t.id)).toEqual(["p1", "d1"])
    expect(rankTargets("#eng", targets)[0].id).toBe("c1")
    expect(rankTargets("jonas", targets)[0].id).toBe("0123456789abcdef0123456789abcdef")
    expect(rankTargets("", targets)).toEqual([])
  })
})

import { looksLikeQuestion, parsePalettePrefix, titleSegments } from "@/lib/search/paletteMatch"

describe("the field's scope prefixes (S2)", () => {
  it("turns @, #, > and ? into a scope once something follows", () => {
    expect(parsePalettePrefix("@maya")).toEqual({ scope: "people", query: "maya" })
    expect(parsePalettePrefix("#eng")).toEqual({ scope: "channels", query: "eng" })
    expect(parsePalettePrefix("> new task")).toEqual({ scope: "commands", query: "new task" })
    expect(parsePalettePrefix("? where are we")).toEqual({ scope: "ask", query: "where are we" })
  })
  it("leaves a bare prefix and plain words alone", () => {
    expect(parsePalettePrefix("#")).toEqual({ scope: null, query: "#" })
    expect(parsePalettePrefix("launch")).toEqual({ scope: null, query: "launch" })
  })
})

describe("looksLikeQuestion (S5)", () => {
  it("is a question when it ends with ?, runs to four words, or starts with a question word", () => {
    expect(looksLikeQuestion("launch?")).toBe(true)
    expect(looksLikeQuestion("where are we on launch")).toBe(true)
    expect(looksLikeQuestion("summarise engineering")).toBe(true)
    expect(looksLikeQuestion("draft announcement")).toBe(true)
    expect(looksLikeQuestion("why")).toBe(true)
  })
  it("is a search otherwise", () => {
    expect(looksLikeQuestion("launch")).toBe(false)
    expect(looksLikeQuestion("q4 launch plan")).toBe(false)
    expect(looksLikeQuestion("  ")).toBe(false)
  })
})

describe("the match highlight in a title (S10)", () => {
  it("marks a whole-token match for the highlighter, and a match inside a word as fuzzy", () => {
    expect(titleSegments("Q4 launch plan", "launch")).toEqual([
      { text: "Q4 ", match: null },
      { text: "launch", match: "token" },
      { text: " plan", match: null },
    ])
    expect(titleSegments("Relaunch notes", "launch")).toEqual([
      { text: "Re", match: null },
      { text: "launch", match: "fuzzy" },
      { text: " notes", match: null },
    ])
  })
  it("keeps the title's own spelling and ignores accents and case", () => {
    expect(titleSegments("Résumé review", "resume").map((s) => s.text).join("")).toBe("Résumé review")
    expect(titleSegments("Résumé review", "resume")[0]).toEqual({ text: "Résumé", match: "token" })
  })
  it("ignores a single letter inside a word", () => {
    expect(titleSegments("pull", "l")).toEqual([{ text: "pull", match: null }])
  })
})

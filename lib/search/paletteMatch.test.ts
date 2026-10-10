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

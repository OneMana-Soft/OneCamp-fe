import { beforeEach, describe, expect, it, vi } from "vitest"

const patched: { key: unknown; update: (d: unknown) => unknown }[] = []
const mutated: unknown[] = []
vi.mock("@/lib/swrMutate", () => ({
  patchCached: (key: unknown, update: (d: unknown) => unknown) => patched.push({ key, update }),
  appMutate: (key: unknown) => { mutated.push(key); return Promise.resolve() },
}))

const { followSystemLine } = await import("@/lib/conversation/liveSystemLine")
const { GetEndpointUrl } = await import("@/services/endPoints")

const dispatched: { type: string; payload: unknown }[] = []
const dispatch = ((a: { type: string; payload: unknown }) => { dispatched.push(a); return a }) as never
const GROUP = { kind: "group" as const, id: "grp1", latestKey: `${GetEndpointUrl.GetGroupChatLatestMessage}/grp1` }
// The sidebar's DMs and groups as they are when the line arrives.
const other = { dm_grouping_id: "dm7", dm_name: undefined }
const CHATS = [{ dm_grouping_id: "grp1", dm_name: "Old" }, other] as never

beforeEach(() => {
  patched.length = 0
  mutated.length = 0
  dispatched.length = 0
})

describe("a system line arriving live", () => {
  it("names the group in the sidebar and its header at once", () => {
    followSystemLine(dispatch, GROUP, "system", JSON.stringify({ kind: "group.renamed", actor: "maya", name: "Launch crew" }), CHATS)
    expect(dispatched).toEqual([expect.objectContaining({
      type: "users/createUserChatList",
      payload: { chatUsersDm: [{ dm_grouping_id: "grp1", dm_name: "Launch crew" }, other] },
    })])
    // The other conversations are the same objects, so their rows don't redraw.
    expect((dispatched[0].payload as { chatUsersDm: unknown[] }).chatUsersDm[1]).toBe(other)
    expect(patched[0].key).toBe(`${GetEndpointUrl.GetDmGroupParticipants}/grp1`)
    const before = { data: { dm_grouping_id: "grp1", dm_participants: [] } }
    expect(patched[0].update(before)).toEqual({ data: { dm_grouping_id: "grp1", dm_participants: [], dm_name: "Launch crew" } })
    // Already so: nothing to write.
    const named = { data: { dm_grouping_id: "grp1", dm_name: "Launch crew" } }
    expect(patched[0].update(named)).toBe(named)
  })

  it("takes a name away", () => {
    followSystemLine(dispatch, GROUP, "system", JSON.stringify({ kind: "group.renamed", actor: "maya" }), CHATS)
    expect(dispatched[0].payload).toEqual({ chatUsersDm: [{ dm_grouping_id: "grp1", dm_name: undefined }, other] })
    expect(patched[0].update({ data: { dm_name: "Old" } })).toEqual({ data: { dm_name: undefined } })
  })

  it("reads the latest page again once a share has finished, so the copies show", () => {
    followSystemLine(dispatch, GROUP, "system", JSON.stringify({ kind: "history.shared", actor: "maya", from: "old", count: 40 }))
    expect(mutated).toEqual([GROUP.latestKey])
    expect(dispatched).toEqual([])
  })

  it("changes nothing else, and nothing for a person's message", () => {
    followSystemLine(dispatch, GROUP, "system", JSON.stringify({ kind: "group.continued", actor: "maya", to: "grp2" }), CHATS)
    followSystemLine(dispatch, GROUP, undefined, JSON.stringify({ kind: "group.renamed", name: "x" }), CHATS)
    followSystemLine(dispatch, GROUP, "system", "not json", CHATS)
    expect([dispatched, patched, mutated]).toEqual([[], [], []])
  })
})

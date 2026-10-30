import { beforeEach, describe, expect, it, vi } from "vitest"

const post = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a) } }))

const { addPeople, makePrivateChannel, placePath, renameGroup, setHidden, shareChoicesKey } = await import("@/lib/conversation/conversationApi")

const DM = { kind: "dm" as const, id: "aaaa bbbb" }
const GROUP = { kind: "group" as const, id: "4f2a9c" }

beforeEach(() => {
  post.mockReset()
  post.mockResolvedValue({ data: { data: { kind: "group", id: "new-grp", existed: false, sharing: 12 } } })
})

describe("the conversation service's paths", () => {
  it("name a DM by both people's ids, escaped, and a group by its id", () => {
    expect(placePath(DM, "people")).toBe("/conversations/dm/aaaa%20bbbb/people")
    expect(shareChoicesKey(GROUP)).toBe("/conversations/group/4f2a9c/share-choices")
  })
})

describe("the calls", () => {
  it("add people with the share chosen, and answer where they were taken", async () => {
    const opened = await addPeople(DM, ["p1", "p2"], "week")
    expect(post).toHaveBeenCalledWith("/conversations/dm/aaaa%20bbbb/people", { people: ["p1", "p2"], share: "week" }, { suppressErrorToast: true })
    expect(opened).toEqual({ kind: "group", id: "new-grp", existed: false, sharing: 12 })
  })

  it("hide, name and make a private channel, each leaving its failure to the screen", async () => {
    await setHidden(GROUP, true)
    await renameGroup("4f2a9c", "Launch crew")
    await makePrivateChannel(GROUP, "launch-plan", true, ["p9"])
    expect(post.mock.calls).toEqual([
      ["/conversations/group/4f2a9c/hidden", { hidden: true }, { suppressErrorToast: true }],
      ["/conversations/group/4f2a9c/name", { name: "Launch crew" }, { suppressErrorToast: true }],
      ["/conversations/group/4f2a9c/private-channel", { name: "launch-plan", people: ["p9"], copy_history: true }, { suppressErrorToast: true }],
    ])
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useEffect } from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import useSWR, { SWRConfig } from "swr"
import { RecentCache, isKept, keptProfile, localStorageProvider, serialise } from "./swrCache"
import { MEMBER_KEY } from "./memberMark"
import { CLIENT_CONFIG_KEY } from "./clientConfigKey"
import { projectStatusesKey } from "./projectStatusesKey"
import { SESSION_ENDED_KEY, endSession } from "./sessionEnd"

// Tests for the SWR cache provider's persistence + safety logic.
// We don't try to test the listener wiring (jsdom doesn't reliably
// fire pagehide / beforeunload from synthetic events); instead we
// drive the rehydration path which is the read side of the cache.
//
// localStorageProvider's public type is SWR's `Cache<unknown>`, but the
// concrete runtime value is a Map. These tests exercise the concrete
// implementation, so we narrow to Map to assert on `.size`.
const provider = () => localStorageProvider() as unknown as Map<string, unknown>

const STORE = "onecamp-app-cache"
const stored = () => JSON.parse(localStorage.getItem(STORE) || "null")
const profileOf = (user_uuid: string) => ({ data: { data: { user_uuid, user_name: user_uuid } } })
const store = (member: string, entries: [string, unknown][]) =>
  localStorage.setItem(STORE, JSON.stringify({ v: 3, member, entries }))
const leave = () => window.dispatchEvent(new Event("pagehide"))

describe("localStorageProvider", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it("returns an empty Map when nothing is stored", () => {
    const map = provider()
    expect(map.size).toBe(0)
  })

  it("rehydrates the member's entries once the profile says it's them", () => {
    store("sam", [
      ["/user/sidebarNav", { data: { hello: "world" } }],
      ["/dm/getLatestChatList", { data: [1, 2, 3] }],
      ["/project/info/p1", { data: { name: "Q4 launch" } }],
    ])

    const map = provider()
    // Held back until the profile has answered.
    expect(map.size).toBe(0)
    expect(map.get("/user/sidebarNav")).toBeUndefined()

    map.set("/user/profile", profileOf("sam"))
    expect(map.size).toBe(4)
    expect((map.get("/user/sidebarNav") as { data: { hello: string } }).data.hello).toBe("world")
    expect((map.get("/project/info/p1") as { data: { name: string } }).data.name).toBe("Q4 launch")
  })

  it("drops another member's entries unseen, from storage too", () => {
    store("sam", [
      ["/user/sidebarNav", { data: "sam's channels" }],
      ["/project/taskListForKanban/p1", { data: "sam's board" }],
    ])
    const map = provider()
    map.set("/user/profile", profileOf("alex"))
    expect(map.get("/user/sidebarNav")).toBeUndefined()
    expect(map.get("/project/taskListForKanban/p1")).toBeUndefined()
    expect([...map.keys()]).toEqual(["/user/profile"])
    expect(localStorage.getItem(STORE)).toBeNull()
  })

  it("lets in nothing for a profile response without a member", () => {
    store("sam", [["/user/sidebarNav", { data: 1 }]])
    const map = provider()
    map.set("/user/profile", { isValidating: true, isLoading: true })
    map.set("/user/profile", { error: new Error("HTTP 500") })
    expect(map.get("/user/sidebarNav")).toBeUndefined()
    map.set("/user/profile", profileOf("sam"))
    expect(map.get("/user/sidebarNav")).toEqual({ data: 1 })
  })

  it("keeps a response this page already has over the one written down", () => {
    store("sam", [["/user/sidebarNav", { data: "last visit" }]])
    const map = provider()
    map.set("/user/sidebarNav", { data: "just now" })
    map.set("/user/profile", profileOf("sam"))
    expect(map.get("/user/sidebarNav")).toEqual({ data: "just now" })
  })

  it("never restores the profile or the realtime connection's settings, so both are asked for again", () => {
    store("sam", [
      ["/user/profile", profileOf("sam")],
      ["/config/mqttConfig", { data: { data: { username: "sam", password: "jwt", topics: ["t"] } } }],
      ["/user/sidebarNav", { data: 1 }],
    ])
    const map = provider()
    expect(map.get("/user/profile")).toBeUndefined()
    map.set("/user/profile", profileOf("sam"))
    expect(map.get("/config/mqttConfig")).toBeUndefined()
    expect(map.get("/user/sidebarNav")).toEqual({ data: 1 })
  })

  it("drops a cache from an older schema version safely", () => {
    for (const stale of [
      { v: 1, entries: [["/api/foo", { data: 42 }]] },
      // v2: every response, written down for no one in particular
      { v: 2, entries: [["/user/sidebarNav", { data: 42 }]] },
    ]) {
      localStorage.setItem(STORE, JSON.stringify(stale))
      const map = provider()
      map.set("/user/profile", profileOf("sam"))
      expect([...map.keys()]).toEqual(["/user/profile"])
      // Stale entry must be removed so future hydrations don't hit it.
      expect(localStorage.getItem(STORE)).toBeNull()
    }
  })

  it("drops a cache that doesn't say whose it is", () => {
    for (const member of [undefined, "", 42]) {
      localStorage.setItem(STORE, JSON.stringify({ v: 3, member, entries: [["/user/sidebarNav", { data: 1 }]] }))
      expect(provider().size).toBe(0)
      expect(localStorage.getItem(STORE)).toBeNull()
    }
  })

  it("recovers from corrupt JSON without throwing", () => {
    localStorage.setItem(STORE, "{not-json")
    const map = provider()
    expect(map.size).toBe(0)
    expect(localStorage.getItem(STORE)).toBeNull()
  })

  it("returns an empty Map when payload shape is malformed", () => {
    localStorage.setItem(STORE, JSON.stringify({ random: "junk" }))
    const map = provider()
    expect(map.size).toBe(0)
  })

  it("writes the member's cache down, with whose it is, when the page is left", () => {
    const map = provider()
    map.set("/user/profile", profileOf("sam"))
    map.set("/user/sidebarNav", { data: 1 })
    leave()
    // The profile goes beside them, and it is this member's (keptProfile, asana-12).
    expect(stored()).toEqual({ v: 3, member: "sam", profile: profileOf("sam"), entries: [["/user/sidebarNav", { data: 1 }]] })
  })

  it("writes down only what the first screens show, never a credential", () => {
    const map = provider()
    map.set("/user/profile", profileOf("sam"))
    map.set("/config/mqttConfig", { data: { data: { username: "sam", password: "jwt", topics: ["t"] } } })
    map.set("/ch/getFile/ch1/a.png", { data: { url: "https://minio/a.png?X-Amz-Signature=x" } })
    map.set("/api-tokens", { data: [{ token: "oc_secret" }] })
    map.set("/admin/ai/config", { data: { api_key: "sk-x" } })
    map.set("/integration/google-calendar/auth-url", { data: "https://accounts.google.com/o/oauth2/auth?state=x" })
    map.set("/user/sidebarNav", { data: 1 })
    map.set("/project/info/p1", { data: 4 })
    map.set("/po/latestPosts/ch1", { data: 2 })
    map.set("/ch/userActiveChannelsWithLatestPost?pageIndex=0&pageSize=20", { data: 3 })
    leave()
    expect(stored().entries.map((e: [string]) => e[0])).toEqual([
      "/project/info/p1",
      "/user/sidebarNav",
      "/po/latestPosts/ch1",
      "/ch/userActiveChannelsWithLatestPost?pageIndex=0&pageSize=20",
    ])
    expect(localStorage.getItem(STORE)).not.toMatch(/jwt|oc_secret|sk-x|Signature|oauth2/)
  })

  it("leaves what's written down as it was until the profile has said whose page this is", () => {
    store("sam", [["/user/sidebarNav", { data: "sam's" }]])
    const map = provider()
    map.set("/user/sidebarNav", { data: "someone's" })
    leave()
    expect(stored()).toEqual({ v: 3, member: "sam", entries: [["/user/sidebarNav", { data: "sam's" }]] })
  })

  it("stops writing down when someone else signs in under the page", () => {
    const map = provider()
    map.set("/user/profile", profileOf("sam"))
    map.set("/user/sidebarNav", { data: "sam's" })
    leave()
    expect(stored()?.member).toBe("sam")
    // Signed in as someone else in another tab, then the profile asked again.
    map.set("/user/profile", profileOf("alex"))
    expect(localStorage.getItem(STORE)).toBeNull()
    leave()
    expect(localStorage.getItem(STORE)).toBeNull()
  })

  it("keeps nothing for the next person once the session has ended", async () => {
    const map = provider()
    map.set("/user/profile", profileOf("sam"))
    map.set("/user/sidebarNav", { data: { name: "Sam" } })
    map.set("/project/taskListForKanban/p1", { data: [{ task_uuid: "t1" }] })
    leave()
    await endSession()
    expect(localStorage.getItem(STORE)).toBeNull()
    // A response that lands on the way out, then the page is left.
    map.set("/dm/getLatestChatList", { data: [1] })
    leave()
    window.dispatchEvent(new Event("beforeunload"))
    expect(localStorage.getItem(STORE)).toBeNull()
  })

  it("keeps nothing once the session has ended in another tab", async () => {
    const map = provider()
    map.set("/user/profile", profileOf("sam"))
    map.set("/user/sidebarNav", { data: { name: "Sam" } })
    leave()
    expect(stored()?.member).toBe("sam")
    // What the other tab's endSession reaches this one as.
    window.dispatchEvent(new StorageEvent("storage", { key: SESSION_ENDED_KEY, newValue: "1" }))
    await act(async () => {})
    expect(localStorage.getItem(STORE)).toBeNull()
    expect(map.size).toBe(0)
    // This tab, hidden or closed later, writes nothing back.
    leave()
    expect(localStorage.getItem(STORE)).toBeNull()
  })

  it("writes down the next session's cache, not the one before it", async () => {
    const first = provider()
    first.set("/user/profile", profileOf("sam"))
    first.set("/user/sidebarNav", { data: "first member" })
    await endSession()
    const second = provider()
    second.set("/user/profile", profileOf("alex"))
    second.set("/user/sidebarNav", { data: "second member" })
    leave()
    expect(stored()).toEqual({ v: 3, member: "alex", profile: profileOf("alex"), entries: [["/user/sidebarNav", { data: "second member" }]] })
  })
})

// The same, through SWR itself: it writes the profile into the cache before it
// tells the components that read it, and the app shows nothing until then.
describe("the cache under SWR", () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  const never = () => new Promise<never>(() => {})
  function Sidebar() {
    const { data } = useSWR<string>("/user/sidebarNav", never)
    return <p>{data ?? "loading the sidebar"}</p>
  }
  // AppProtectedRoute, in miniature: nothing until the profile has answered.
  function App({ member }: { member: string }) {
    const { data } = useSWR("/user/profile", async () => profileOf(member).data)
    return data ? <Sidebar /> : <p>waiting for the profile</p>
  }
  const open = (member: string) =>
    render(
      <SWRConfig value={{ provider: localStorageProvider, dedupingInterval: 0 }}>
        <App member={member} />
      </SWRConfig>,
    )

  it("shows the member's own cached sidebar at once", async () => {
    store("sam", [["/user/sidebarNav", { data: "sam's channels" }]])
    open("sam")
    expect(await screen.findByText("sam's channels")).toBeTruthy()
  })

  it("never shows another member's", async () => {
    store("sam", [["/user/sidebarNav", { data: "sam's channels" }]])
    open("alex")
    expect(await screen.findByText("loading the sidebar")).toBeTruthy()
    expect(screen.queryByText("sam's channels")).toBeNull()
    expect(localStorage.getItem(STORE)).toBeNull()
  })

  describe("when the server refuses what the device kept", () => {
    const failure = (status?: number) =>
      Object.assign(new Error(status ? `Request failed with status code ${status}` : "Network Error"), {
        isAxiosError: true,
        ...(status ? { response: { status } } : { code: "ERR_NETWORK" }),
      })
    // ProjectView in miniature: what the cache holds while it holds it, the refusal's state once it doesn't.
    function Screen({ path, answer }: { path: string; answer: () => Promise<string> }) {
      const { data, error } = useSWR<string>(path, answer, { shouldRetryOnError: false })
      return (
        <>
          <p>{data ?? (error ? "not yours to open" : "loading")}</p>
          {error ? <i>the server was asked</i> : null}
        </>
      )
    }
    function Member({ path, answer }: { path: string; answer: () => Promise<string> }) {
      const { data } = useSWR("/user/profile", async () => profileOf("sam").data)
      return data ? <Screen path={path} answer={answer} /> : <p>waiting for the profile</p>
    }
    const openAt = (path: string, answer: () => Promise<string>) =>
      render(
        <SWRConfig value={{ provider: localStorageProvider, dedupingInterval: 0 }}>
          <Member path={path} answer={answer} />
        </SWRConfig>,
      )

    it.each([
      ["a project's board", 403, "/project/info/p1"],
      ["a project's board", 404, "/project/info/p1"],
      ["its kanban list", 403, "/project/taskListForKanban/p1"],
      ["a first screen", 403, "/user/sidebarNav"],
      ["a first screen", 401, "/user/sidebarNav"],
    ])("lets %s go when the server refuses it (%i): the screen shows the refusal", async (_what, status, path) => {
      store("sam", [[path, { data: "what the device kept" }]])
      openAt(path, () => Promise.reject(failure(status)))
      expect(await screen.findByText("not yours to open")).toBeTruthy()
      expect(screen.queryByText("what the device kept")).toBeNull()
    })

    it.each([
      ["nothing answers", undefined],
      ["the server fails (500)", 500],
    ])("keeps it when %s: that isn't the server's word on it", async (_what, status) => {
      store("sam", [["/project/info/p1", { data: "what the device kept" }]])
      openAt("/project/info/p1", () => Promise.reject(failure(status)))
      expect(await screen.findByText("the server was asked")).toBeTruthy()
      expect(screen.getByText("what the device kept")).toBeTruthy()
    })
  })
})

describe("isKept", () => {
  it("keeps the lists the first screens show, by path", () => {
    for (const key of [
      "/user/sidebarNav",
      "/dm/getLatestChatList",
      "/po/latestPosts/ch1",
      "/dm/latestChat/u2",
      "/groupChat/latestChat/g1",
      "/ch/channelBasicInfo/ch1",
      "/activity/unified?limit=20",
      "/user/assignedTaskList",
      "/user/assignedTaskListForKanban",
    ]) expect(isKept(key), key).toBe(true)
  })

  // What this server has (AI, calls…): kept, so a read that fails on the next
  // load keeps the features it last had rather than hiding them (17 Oct: a
  // dark channel shot lost Huddle and the AI spark that way).
  it("keeps the client config, the features the server last said it has", () => {
    expect(isKept(CLIENT_CONFIG_KEY)).toBe(true)
  })

  // A project's board, per project, so a cold start opens the board the member left (asana-12). Its statuses too: the
  // board draws its columns once they're read, so a board kept without them waited offline for a read nobody kept
  // (a12quick1 at offlineTasks:1106; main, 30 Oct 23:3x: every read the board needs is kept).
  it("keeps a project's board, per project: its info, its kanban list and its statuses", () => {
    for (const key of ["/project/info/p1", "/project/taskListForKanban/p1", projectStatusesKey("p1")]) expect(isKept(key), key).toBe(true)
  })

  it("keeps nothing else", () => {
    for (const key of [
      "/project/membersInfo/p1",
      "/project/p1/statuses/s1",
      "/project/p1/fields",
      "/project/p1",
      "/project/infos/p1",
      "/user/profile",
      "/user/profile/u2",
      "/config/mqttConfig",
      "/config/client",
      "/ch/getFile/ch1/a.png",
      "/dm/getRecordingURL/r1",
      "/api-tokens",
      "/admin/scim/tokens",
      "/admin/auth/oauth-config",
      "/auth/2fa",
      "/connectors",
      "/oauth/requests/r1",
      "/user/sidebarNavigation",
      "$req$/user/sidebarNav",
      "$inf$/po/latestPosts/ch1",
      42,
    ]) expect(isKept(key), String(key)).toBe(false)
  })
})

describe("RecentCache", () => {
  it("forgets the least recently used beyond its limit", () => {
    const c = new RecentCache<number>([], 3)
    c.set("a", 1).set("b", 2).set("c", 3)
    c.get("a") // read: now the most recent
    c.set("d", 4)
    expect(c.has("b")).toBe(false)
    expect(c.recentFirst()).toEqual(["d", "a", "c"])
  })

  it("never reorders on a read, so a walk over its keys ends", () => {
    // SWR reads entries while walking the keys (a global mutate); a cache
    // that moved read keys to the end made that walk endless.
    const c = new RecentCache<number>([["a", 1], ["b", 2], ["c", 3]], 10)
    const seen: string[] = []
    for (const k of c.keys()) {
      c.get(k)
      seen.push(k)
      if (seen.length > 10) break
    }
    expect(seen).toEqual(["a", "b", "c"])
  })

  it("keeps the order it was given when restored", () => {
    const c = new RecentCache<number>([["x", 1], ["y", 2]], 5)
    expect([...c.keys()]).toEqual(["x", "y"])
  })
})

describe("serialise", () => {
  it("makes room by leaving out a board, the least recently opened first, never a first screen", () => {
    const body = { data: "x".repeat(40) }
    const map = new Map<string, unknown>([
      ["/user/sidebarNav", body],
      ["/project/info/old", body],
      ["/project/info/new", body],
      ["/po/latestPosts/ch1", body],
    ])
    // Room for three: the first screens read before both boards stay, and so does the board opened last.
    const one = JSON.stringify(["/project/info/old", body]).length + 1
    const written = JSON.parse(serialise(map, "sam", one * 3 + 2)).entries.map((e: [string]) => e[0])
    expect(written).toEqual(["/project/info/new", "/user/sidebarNav", "/po/latestPosts/ch1"])
  })

  it("writes down the most recent kept entries that fit, oldest first", () => {
    const m = new Map<string, unknown>([
      ["/dm/latestChat/old", { data: "o".repeat(50) }],
      ["/dm/latestChat/big", { data: "b".repeat(500) }],
      ["/dm/latestChat/new", { data: "n".repeat(50) }],
      ["$req$x", { data: 1 }],
      ["/dm/latestChat/failed", { error: new Error("x") }],
      ["/config/mqttConfig", { data: "secret" }],
    ])
    const out = JSON.parse(serialise(m, "sam", 300))
    expect(out.v).toBe(3)
    expect(out.member).toBe("sam")
    expect(out.entries.map((e: [string]) => e[0])).toEqual(["/dm/latestChat/old", "/dm/latestChat/new"])
  })

  it("round-trips through the provider", () => {
    localStorage.setItem(STORE, serialise(new Map([["/user/sidebarNav", { data: 1 }]]), "sam"))
    const map = localStorageProvider() as unknown as Map<string, unknown>
    map.set("/user/profile", profileOf("sam"))
    expect(map.get("/user/sidebarNav")).toEqual({ data: 1 })
    localStorage.clear()
  })

  // A page left while a request was on its way: the next load has no such
  // request, so the entry mustn't say it does. Nor that it's loading: SWR
  // takes a missing flag as loading, and screens showed a skeleton over the
  // cached data.
  it("writes an entry down at rest, neither on its way nor loading", () => {
    const out = JSON.parse(serialise(new Map([["/user/sidebarNav", { data: 1, isValidating: true, isLoading: false, _k: "/a" }]]), "sam"))
    expect(out.entries).toEqual([["/user/sidebarNav", { data: 1, isValidating: false, isLoading: false, _k: "/a" }]])
  })

  // Offline, every kept key's refresh fails beside its data, and a load that wrote down only error-free entries left
  // the next cold start with nothing (asana-12, a12quick2 :1142). No answer, or a failing server, isn't the server's
  // word on the key, so its last answer is kept, written at rest without the error. A refusal (401, 403, 404, as
  // serverSaid reads it) is the server's word, so that answer is never written back. That includes one this page
  // fetched itself: serverSaid takes back only what the device kept, so such an answer keeps its data beside the
  // refusal, and only this rule stops it here.
  it("keeps an answer whose refresh failed, at rest without the error; never writes back a refused one, even one this page fetched itself", () => {
    const failed = (status?: number) =>
      status === undefined
        ? Object.assign(new Error("Network Error"), { isAxiosError: true, code: "ERR_NETWORK" })
        : Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true, response: { status } })
    const map = new Map<string, unknown>([
      ["/user/sidebarNav", { data: 1, error: failed(), isValidating: true, isLoading: true }],
      ["/po/latestPosts/ch1", { data: 2, error: failed(500) }],
      ["/project/info/p1", { data: 3, error: failed(403) }],
      ["/project/info/p2", { data: 4, error: failed(404) }],
      ["/dm/latestChat/c1", { data: 5, error: failed(401) }],
    ])
    expect(JSON.parse(serialise(map, "sam")).entries).toEqual([
      ["/user/sidebarNav", { data: 1, isValidating: false, isLoading: false }],
      ["/po/latestPosts/ch1", { data: 2, isValidating: false, isLoading: false }],
    ])
  })
})

describe("opening offline as the member this device last confirmed (asana-12)", () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  // A request that never reached the server, as axios reports it.
  const unanswered = Object.assign(new Error("Network Error"), { isAxiosError: true, code: "ERR_NETWORK" })
  const refused = Object.assign(new Error("Request failed with status code 401"), { isAxiosError: true, response: { status: 401 } })
  const never = () => new Promise<never>(() => {})
  function Sidebar() {
    const { data } = useSWR<string>("/user/sidebarNav", never)
    return <p>{data ?? "loading the sidebar"}</p>
  }
  // AppProtectedRoute, in miniature: nothing until the profile has answered, or
  // went unanswered with one kept on this device.
  function App({ failure }: { failure: Error }) {
    const { data, error, mutate } = useSWR<unknown>(
      "/user/profile",
      async () => {
        throw failure
      },
      { shouldRetryOnError: false },
    )
    useEffect(() => {
      const kept = error ? keptProfile(error) : undefined
      if (kept) void mutate(kept, { revalidate: false })
    }, [error, mutate])
    return data ? <Sidebar /> : <p>waiting for the profile</p>
  }
  const open = (failure: Error) =>
    render(
      <SWRConfig value={{ provider: localStorageProvider, dedupingInterval: 0 }}>
        <App failure={failure} />
      </SWRConfig>,
    )
  const keep = (member: string, profileFor = member) =>
    localStorage.setItem(
      STORE,
      JSON.stringify({ v: 3, member, profile: profileOf(profileFor), entries: [["/user/sidebarNav", { data: `${member}'s channels` }]] }),
    )

  it("writes the profile down with the member's answers", () => {
    const out = JSON.parse(serialise(new Map<string, unknown>([["/user/profile", profileOf("sam")], ["/user/sidebarNav", { data: 1 }]]), "sam"))
    expect(out.profile?.data?.data?.user_uuid).toBe("sam")
    expect(out.entries.map(([k]: [string]) => k)).toEqual(["/user/sidebarNav"])
  })

  it("writes down no profile that isn't the member's", () => {
    const out = JSON.parse(serialise(new Map<string, unknown>([["/user/profile", profileOf("alex")]]), "sam"))
    expect(out.profile).toBeUndefined()
  })

  it("opens with it, and the member's kept answers, when the profile goes unanswered", async () => {
    keep("sam")
    localStorage.setItem(MEMBER_KEY, "1")
    open(unanswered)
    expect(await screen.findByText("sam's channels")).toBeTruthy()
  })

  it("doesn't when the server answered: a refusal (401, 403) or any other answer is the server's word", async () => {
    keep("sam")
    localStorage.setItem(MEMBER_KEY, "1")
    open(refused)
    await act(async () => {})
    expect(screen.getByText("waiting for the profile")).toBeTruthy()
    for (const status of [401, 403, 500]) {
      const answered = Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status } })
      expect(keptProfile(answered), String(status)).toBeUndefined()
    }
    // A request the page cancelled wasn't left unanswered by the network.
    expect(keptProfile(Object.assign(new Error("canceled"), { isAxiosError: true, code: "ERR_CANCELED" }))).toBeUndefined()
    // The same device, unanswered: it would open.
    expect(keptProfile(unanswered)).toEqual(profileOf("sam").data)
  })

  it("doesn't once this browser's member mark is gone", async () => {
    keep("sam")
    open(unanswered)
    await act(async () => {})
    expect(screen.getByText("waiting for the profile")).toBeTruthy()
  })

  it("doesn't with a profile kept for someone else", async () => {
    keep("sam", "alex")
    localStorage.setItem(MEMBER_KEY, "1")
    open(unanswered)
    await act(async () => {})
    expect(screen.getByText("waiting for the profile")).toBeTruthy()
    expect(screen.queryByText("sam's channels")).toBeNull()
  })

  it("is nothing once the session has ended", async () => {
    keep("sam")
    localStorage.setItem(MEMBER_KEY, "1")
    provider()
    await endSession()
    localStorage.setItem(MEMBER_KEY, "1")
    expect(keptProfile(unanswered)).toBeUndefined()
  })
})

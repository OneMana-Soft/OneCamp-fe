import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { notificationTag, type TaggedPushData } from "@/lib/utils/notificationTag"

// TN-BUG-6: a browser keeps one notification per tag, and the service worker
// tagged by kind alone, so Jonas's DM replaced Maya's before she was read, and
// every channel message replaced the one before. A tag is now one per place and
// sender. The service worker can't import the app, so it carries a mirror;
// this holds the two together, and runs the service worker itself.

const SELF = "5e1f0000-0000-4000-8000-000000000001"
const MAYA_DM = `${SELF} a11ce000-0000-4000-8000-00000000000a`
const JONAS_DM = `b0b00000-0000-4000-8000-00000000000b ${SELF}`
const ENG = "c0ffee00-0000-4000-8000-000000000001"

const dm = (grouping: string, who: string, id: string, body = "hi"): TaggedPushData =>
  ({ type: "chat", type_id: grouping, thread_id: id, username: who, title: who, body })
const post = (who: string, id: string): TaggedPushData =>
  ({ type: "channel", type_id: ENG, thread_id: id, username: who, title: "#engineering", body: "hi" })
const reply = (who: string, thread: string): TaggedPushData =>
  ({ type: "post_comment", type_id: ENG, thread_id: thread, username: who, title: "#engineering", body: "hi" })

/** Pairs that must never replace each other, and pairs that should. */
const APART: [string, TaggedPushData, TaggedPushData][] = [
  ["two people's DMs", dm(MAYA_DM, "Maya Chen", "m1"), dm(JONAS_DM, "Jonas Berg", "j1")],
  ["two people in one channel", post("Maya Chen", "p1"), post("Jonas Berg", "p2")],
  ["one person in two channels", post("Maya Chen", "p1"), { ...post("Maya Chen", "p2"), type_id: "c0ffee00-0000-4000-8000-000000000002" }],
  ["one person's replies in two threads", reply("Maya Chen", "p1"), reply("Maya Chen", "p2")],
  ["a message and a reply in its channel", post("Maya Chen", "p1"), reply("Maya Chen", "p1")],
  ["two reminders", { type: "reminder", type_id: SELF, title: "Reminder", body: "Review the deck" }, { type: "reminder", type_id: SELF, title: "Reminder", body: "Call the bank" }],
  ["two approvals", { type: "approval", tag: "approval_1", title: "Approve?" }, { type: "approval", tag: "approval_2", title: "Approve?" }],
]
const TOGETHER: [string, TaggedPushData, TaggedPushData][] = [
  ["one person's messages in one DM", dm(MAYA_DM, "Maya Chen", "m1", "first"), dm(MAYA_DM, "Maya Chen", "m2", "second")],
  ["one person's messages in one channel", post("Maya Chen", "p1"), post("Maya Chen", "p2")],
  ["one person's replies in one thread", reply("Maya Chen", "p1"), { ...reply("Maya Chen", "p1"), body: "and another" }],
]

describe("a push notification's tag", () => {
  it.each(APART)("tells apart %s", (_, a, b) => {
    expect(notificationTag(a, SELF)).not.toBe(notificationTag(b, SELF))
  })

  it.each(TOGETHER)("keeps to one notification %s, the latest", (_, a, b) => {
    expect(notificationTag(a, SELF)).toBe(notificationTag(b, SELF))
  })

  it("keeps the tag the server gave, for whoever is signed in", () => {
    expect(notificationTag({ type: "approval", tag: "approval_7" }, SELF)).toBe(`${SELF}_approval_7`)
    expect(notificationTag({ type: "approval", tag: "approval_7" }, null)).toBe("approval_7")
  })

  it("is never shared by two accounts in one browser", () => {
    const push = dm(MAYA_DM, "Maya Chen", "m1")
    expect(notificationTag(push, SELF)).not.toBe(notificationTag(push, "another-account"))
  })

  it("has a tag for a push that says nothing", () => {
    expect(notificationTag(null, SELF)).toBe(`${SELF}_general`)
    expect(notificationTag({}, undefined)).toBe("general")
  })
})

describe("the service worker", () => {
  const source = readFileSync(resolve(__dirname, "../../public/firebase-messaging-sw.js"), "utf8")
  const BEGIN = "// --- BEGIN notification tag"
  const END = "// --- END notification tag ---"

  it("carries the mirror", () => {
    expect(source).toContain(BEGIN)
    expect(source).toContain(END)
  })

  const mirror = new Function(`${source.slice(source.indexOf(BEGIN), source.indexOf(END))}; return oneCampNotificationTag;`)() as typeof notificationTag

  it.each([...APART, ...TOGETHER])("tags %s as the app does", (_, a, b) => {
    for (const push of [a, b]) {
      expect(mirror(push, SELF)).toBe(notificationTag(push, SELF))
      expect(mirror(push, null)).toBe(notificationTag(push, null))
    }
    expect(mirror(null, SELF)).toBe(notificationTag(null, SELF))
  })

  // The whole worker, with Firebase and the browser faked: what reaches the
  // notification centre when two people DM you while the tab is in the background.
  async function shown(payloads: { data: TaggedPushData }[]) {
    let onBackground: ((payload: unknown) => Promise<unknown>) | undefined
    const showNotification = vi.fn(async () => {})
    const firebase = {
      initializeApp: () => {},
      messaging: () => ({ onBackgroundMessage: (fn: typeof onBackground) => { onBackground = fn } }),
    }
    const self = { addEventListener: () => {}, registration: { showNotification }, indexedDB: undefined }
    const location = { search: "?apiKey=k&projectId=p&messagingSenderId=s&appId=a" }
    new Function("importScripts", "firebase", "self", "location", "clients", source)(() => {}, firebase, self, location, {})
    for (const p of payloads) await onBackground!(p)
    return showNotification.mock.calls.map((c) => ({ title: (c as unknown[])[0], tag: ((c as unknown[])[1] as { tag: string }).tag }))
  }

  it("shows a second sender's DM beside the first, never over it", async () => {
    const got = await shown([{ data: dm(MAYA_DM, "Maya Chen", "m1") }, { data: dm(JONAS_DM, "Jonas Berg", "j1") }])
    expect(got.map((n) => n.title)).toEqual(["Maya Chen", "Jonas Berg"])
    expect(got[0].tag).not.toBe(got[1].tag)
  })

  it("shows two people's messages in one channel side by side", async () => {
    const got = await shown([{ data: post("Maya Chen", "p1") }, { data: post("Jonas Berg", "p2") }])
    expect(got[0].tag).not.toBe(got[1].tag)
  })
})

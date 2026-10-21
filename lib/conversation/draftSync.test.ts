import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TEST_TODAY } from "@/lib/testing/testClock"
import type { ServerDraft } from "./drafts"

// The Draft Store (chat P5): every composer's draft kept on the device as it
// is typed and on the server once typing rests, put back after a reload and
// on another device, never replacing what was typed here, and emptied
// everywhere once sent. Driven through the real store with today's slices.

const { default: store, RESET_STORE_ACTION } = await import("@/store/store")
const { updateChannelInputText, clearChannelInputState } = await import("@/store/slice/channelSlice")
const { createOrUpdateChatBody } = await import("@/store/slice/chatSlice")
const { createOrUpdateChannelCommentMsg } = await import("@/store/slice/channelCommentSlice")
const { startDraftSync, deviceKey, SAVE_AFTER_MS } = await import("./draftSync")
const { endSession } = await import("@/lib/sessionEnd")

const ME = "0c4a0000-0000-4000-8000-00000000000a"
const MAYA = "0c4a0000-0000-4000-8000-00000000000b"
const CH = "c0ffee00-0000-4000-8000-000000000001"
const ROOT = "aaaa0000-0000-4000-8000-00000000000a"

class FakeStorage {
  items = new Map<string, string>()
  getItem = (k: string) => this.items.get(k) ?? null
  setItem = (k: string, v: string) => void this.items.set(k, v)
  removeItem = (k: string) => void this.items.delete(k)
}

function fakeServer(drafts: ServerDraft[] = []) {
  let answer: (v: ServerDraft[]) => void = () => {}
  const server = {
    kept: new Map(drafts.map((d) => [d.key, d])),
    puts: [] as Omit<ServerDraft, "updated_at">[],
    removes: [] as string[],
    held: false,
    fail: undefined as undefined | { status: number; msg?: string },
    list: vi.fn(() => (server.held ? new Promise<ServerDraft[]>((r) => (answer = r)) : Promise.resolve([...server.kept.values()]))),
    put: vi.fn(async (body: Omit<ServerDraft, "updated_at">) => {
      if (server.fail) throw { response: { status: server.fail.status, data: { msg: server.fail.msg } } }
      server.puts.push(body)
      server.kept.set(body.key, { ...body, updated_at: "2026-10-15T12:00:00Z" })
    }),
    remove: vi.fn(async (key: string) => {
      server.removes.push(key)
      server.kept.delete(key)
    }),
    answer: () => answer([...server.kept.values()]),
  }
  return server
}

const channelDraft = () => store.getState().channel.channelInputState[CH]
const settle = () => vi.advanceTimersByTimeAsync(0)

let storage: FakeStorage
let stop: () => void = () => {}
beforeEach(() => {
  // Its own clock, with the timers it waits on (lib/testing/testClock).
  vi.useFakeTimers({ now: TEST_TODAY, toFake: ["setTimeout", "clearTimeout", "Date"] })
  store.dispatch({ type: RESET_STORE_ACTION })
  storage = new FakeStorage()
})
afterEach(() => {
  stop()
  vi.useRealTimers()
})

function start(server: ReturnType<typeof fakeServer>, onRefused = vi.fn()) {
  stop = startDraftSync({ store, viewer: ME, server, storage, onRefused })
  return onRefused
}

describe("the Draft Store", () => {
  it("keeps a draft on the device at once and on the server once typing rests", async () => {
    const server = fakeServer()
    start(server)
    await settle()
    store.dispatch(updateChannelInputText({ channelId: CH, inputTextHTML: "<p>Ship it</p>" }))
    store.dispatch(updateChannelInputText({ channelId: CH, inputTextHTML: "<p>Ship it Friday</p>" }))
    await vi.advanceTimersByTimeAsync(300)
    expect(JSON.parse(storage.getItem(deviceKey(ME))!)[`channel:${CH}`].d.html).toBe("<p>Ship it Friday</p>")
    expect(server.put).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS)
    // One save, of the last words, once the typing rested.
    expect(server.puts).toEqual([{ key: `channel:${CH}`, html: "<p>Ship it Friday</p>", files: [] }])
    expect(JSON.parse(storage.getItem(deviceKey(ME))!)[`channel:${CH}`].synced).toBe(true)
  })

  it("puts the device's draft back after a reload, before the server answers", async () => {
    storage.setItem(deviceKey(ME), JSON.stringify({ [`channel:${CH}`]: { d: { html: "<p>Half a thought</p>", files: [] }, sig: "x", synced: false } }))
    const server = fakeServer()
    server.held = true
    start(server)
    expect(channelDraft().inputTextHTML).toBe("<p>Half a thought</p>")
    // The box takes it even while it has focus.
    expect(channelDraft().restoredUnsent).toBe(1)
    await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS)
    expect(server.puts.map((p) => p.html)).toEqual(["<p>Half a thought</p>"])
  })

  it("fills an empty box with another device's draft, and sends nothing back", async () => {
    const server = fakeServer([{ key: `channel:${CH}`, html: "<p>From my phone</p>", updated_at: "2026-10-15T11:00:00Z" }])
    start(server)
    await settle()
    expect(channelDraft().inputTextHTML).toBe("<p>From my phone</p>")
    await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS * 2)
    expect(server.put).not.toHaveBeenCalled()
    expect(server.remove).not.toHaveBeenCalled()
  })

  it("puts a later draft from another device in the same box, its revision moving on so a focused editor shows it", async () => {
    const server = fakeServer([{ key: `channel:${CH}`, html: "<p>First, from my phone</p>", updated_at: "2026-10-15T11:00:00Z" }])
    start(server)
    await settle()
    expect(channelDraft()).toMatchObject({ inputTextHTML: "<p>First, from my phone</p>", restoredUnsent: 1 })
    // The phone writes again; coming back online reads the server again.
    server.kept.set(`channel:${CH}`, { key: `channel:${CH}`, html: "<p>Then, from my laptop</p>", updated_at: "2026-10-15T11:30:00Z" })
    window.dispatchEvent(new Event("online"))
    await settle()
    expect(channelDraft()).toMatchObject({ inputTextHTML: "<p>Then, from my laptop</p>", restoredUnsent: 2 })
    await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS * 2)
    expect(server.put).not.toHaveBeenCalled()
  })

  it("puts a thread's draft in its reply box with its file, and moves the box's revision", async () => {
    const file = { attachment_uuid: "f1", attachment_obj_key: "k1", attachment_file_name: "plan.pdf", attachment_type: "document", attachment_size: 10, attachment_created_at: "" }
    const server = fakeServer([{ key: `post-thread:${ROOT}`, html: "<p>On it</p>", files: [file] as never, also_send: true, updated_at: "2026-10-15T11:00:00Z" }])
    start(server)
    await settle()
    const box = store.getState().channelComment.commentInputState[ROOT]
    expect(box).toMatchObject({ commentMsgBody: "<p>On it</p>", alsoSendToChannel: true, filesUploaded: [file] })
    expect(box.filesPreview).toMatchObject([{ key: "k1", progress: 100, fileName: "plan.pdf" }])
    expect(store.getState().draftRestores?.[`post-thread:${ROOT}`]).toBe(1)
    await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS * 2)
    expect(server.put).not.toHaveBeenCalled()
  })

  it("never replaces what was typed here and not yet saved", async () => {
    storage.setItem(deviceKey(ME), JSON.stringify({ [`channel:${CH}`]: { d: { html: "<p>Typed here</p>", files: [] }, sig: "x", synced: false } }))
    const server = fakeServer([{ key: `channel:${CH}`, html: "<p>Older, from my phone</p>", updated_at: "2026-10-15T11:00:00Z" }])
    start(server)
    await settle()
    expect(channelDraft().inputTextHTML).toBe("<p>Typed here</p>")
    await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS)
    expect(server.kept.get(`channel:${CH}`)?.html).toBe("<p>Typed here</p>")
  })

  it("empties a box whose draft was sent or emptied elsewhere", async () => {
    const draft = { html: "<p>Sent from my phone since</p>", files: [] }
    storage.setItem(deviceKey(ME), JSON.stringify({ [`channel:${CH}`]: { d: draft, sig: JSON.stringify([draft.html, [], "", false]), synced: true } }))
    const server = fakeServer()
    server.held = true
    start(server)
    expect(channelDraft().inputTextHTML).toBe("<p>Sent from my phone since</p>")
    server.answer()
    await settle()
    expect(channelDraft().inputTextHTML).toBe("")
    expect(JSON.parse(storage.getItem(deviceKey(ME))!)).toEqual({})
  })

  it("empties the draft everywhere once the message is sent", async () => {
    const server = fakeServer()
    start(server)
    await settle()
    store.dispatch(updateChannelInputText({ channelId: CH, inputTextHTML: "<p>Ship it</p>" }))
    await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS)
    store.dispatch(clearChannelInputState({ channelId: CH }))
    await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS)
    expect(server.removes).toEqual([`channel:${CH}`])
    expect(server.kept.size).toBe(0)
    expect(JSON.parse(storage.getItem(deviceKey(ME))!)).toEqual({})
  })

  it("keeps a thread's draft and a DM's under their own keys", async () => {
    const server = fakeServer()
    start(server)
    await settle()
    store.dispatch(createOrUpdateChannelCommentMsg({ threadId: ROOT, body: "<p>On it</p>" }))
    store.dispatch(createOrUpdateChatBody({ chatUUID: MAYA, body: "<p>Lunch?</p>" }))
    await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS)
    expect(server.puts.map((p) => p.key).sort()).toEqual([`dm:${ME} ${MAYA}`, `post-thread:${ROOT}`])
  })

  it("says once that a draft the server won't keep stays on this device, and doesn't send it again", async () => {
    const server = fakeServer()
    const refused = start(server)
    await settle()
    server.fail = { status: 413, msg: "That draft is too long to keep. Shorten it, or send it in parts." }
    store.dispatch(updateChannelInputText({ channelId: CH, inputTextHTML: "<p>a very long draft</p>" }))
    await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS * 20)
    expect(server.put).toHaveBeenCalledTimes(1)
    expect(refused).toHaveBeenCalledWith(`channel:${CH}`, "That draft is too long to keep. Shorten it, or send it in parts.")
    expect(JSON.parse(storage.getItem(deviceKey(ME))!)[`channel:${CH}`].d.html).toBe("<p>a very long draft</p>")
  })

  it("tries again a minute after the server says it's too soon", async () => {
    const server = fakeServer()
    start(server)
    await settle()
    server.fail = { status: 429 }
    store.dispatch(updateChannelInputText({ channelId: CH, inputTextHTML: "<p>later</p>" }))
    await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS)
    expect(server.put).toHaveBeenCalledTimes(1)
    server.fail = undefined
    await vi.advanceTimersByTimeAsync(59_000)
    expect(server.puts).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(server.puts.map((p) => p.html)).toEqual(["<p>later</p>"])
  })

  it("lets go of the device's drafts when the member signs out", async () => {
    const server = fakeServer()
    start(server)
    await settle()
    store.dispatch(updateChannelInputText({ channelId: CH, inputTextHTML: "<p>mine</p>" }))
    await vi.advanceTimersByTimeAsync(300)
    expect(storage.getItem(deviceKey(ME))).not.toBeNull()
    await endSession()
    expect(storage.getItem(deviceKey(ME))).toBeNull()
  })
})

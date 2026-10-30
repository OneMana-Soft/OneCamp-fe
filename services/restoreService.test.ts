import { afterEach, describe, expect, it, vi } from "vitest"

// Undo right after a delete the server kept (V-78): ONE request brings back
// any kind, through the caller's own client (this module imports none of the
// shared core, so lazy dialogs may take it: V-49). What goes wrong is the Undo
// toast's to say (Retry on a 503). What shows the thing is read again however
// it went: a 503 means part of it is back.

const showUndo = vi.hoisted(() => vi.fn())
vi.mock("@/components/ui/undoToast", () => ({ showUndo }))

const { restore, offerUndo } = await import("@/services/restoreService")

const post = vi.fn()
afterEach(() => {
  post.mockReset()
  showUndo.mockReset()
})

describe("restore", () => {
  it("posts the kind and the id to /restore through the caller's client, quietly (the Undo toast says why)", async () => {
    post.mockResolvedValue({ data: { msg: "ok" } })
    await restore({ post }, "time_entry", "e/1")
    expect(post).toHaveBeenCalledWith("/restore/time_entry/e%2F1", {}, { suppressErrorToast: true })
  })

  it("passes a refusal on as it came, for the toast to say", async () => {
    const refused = Object.assign(new Error("Request failed with status code 409"), { response: { status: 409, data: { msg: "A status named QA is already here." } } })
    post.mockRejectedValue(refused)
    await expect(restore({ post }, "status", "s1")).rejects.toBe(refused)
  })

  it("reads again once it's back, and once the server has answered", async () => {
    const order: string[] = []
    post.mockImplementation(async () => {
      order.push("post")
      return { data: { msg: "ok" } }
    })
    await restore({ post }, "cycle", "c1", async () => order.push("read"))
    expect(order).toEqual(["post", "read"])
  })

  it("reads again when it didn't finish too (a 503: part of it is back), and still says why", async () => {
    const unfinished = Object.assign(new Error("Request failed with status code 503"), { response: { status: 503, data: { msg: "The status is back, but its restore didn't finish. Try again in a moment." } } })
    post.mockRejectedValue(unfinished)
    const readAgain = vi.fn(async () => {})
    await expect(restore({ post }, "status", "s1", readAgain)).rejects.toBe(unfinished)
    expect(readAgain).toHaveBeenCalledTimes(1)
  })

  // CR-95's S1: what the toast reads is the restore's own outcome. A read
  // again that fails (offline a moment later, say) never replaces the
  // server's words, nor turns a restore that worked into "Couldn't undo that".
  it("a refusal keeps its words when the read again fails", async () => {
    const refused = Object.assign(new Error("Request failed with status code 403"), { response: { status: 403, data: { msg: "Only the project's admins can restore its statuses." } } })
    post.mockRejectedValue(refused)
    await expect(restore({ post }, "status", "s1", () => Promise.reject(new Error("Network Error")))).rejects.toBe(refused)
  })

  it("a restore that worked still resolves when the read again fails", async () => {
    post.mockResolvedValue({ data: { msg: "Status restored." } })
    await expect(restore({ post }, "status", "s1", () => Promise.reject(new Error("Network Error")))).resolves.toBeUndefined()
  })
})

describe("offerUndo", () => {
  it("loads the toast's code on the delete and offers its Undo", async () => {
    const undo = async () => {}
    offerUndo("Deleted Budget", undo, "Its values come back too.")
    await vi.waitFor(() => expect(showUndo).toHaveBeenCalledWith("Deleted Budget", undo, "Its values come back too."))
  })
})

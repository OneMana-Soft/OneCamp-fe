import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

// What a person reads when a request fails. One toast, saying what didn't
// happen in their words and why in the server's; and, when nothing answered
// at all, that the server couldn't be reached, instead of silence.

const toasts: { title?: string; description?: string; variant?: string }[] = []
vi.mock("@/hooks/use-toast", () => {
  const toast = (t: { title?: string; description?: string }) => {
    toasts.push(t)
    return { id: String(toasts.length), dismiss: () => {}, update: () => {} }
  }
  return { toast, useToast: () => ({ toast }) }
})

const { default: axiosInstance } = await import("@/lib/axiosInstance")
const { usePost } = await import("@/hooks/usePost")
const { PostEndpointUrl } = await import("@/services/endPoints")
const connectivity = await import("@/lib/connectivity")

/** The server's answer to every request in a test; status 0 means no answer at all. */
function serverAnswers(status: number, data: unknown = {}) {
  const previous = axiosInstance.defaults.adapter
  axiosInstance.defaults.adapter = async (config) => {
    const { AxiosError } = await import("axios")
    if (status === 0) throw new AxiosError("Network Error", "ERR_NETWORK", config, {})
    const res = { data, status, statusText: String(status), headers: {}, config }
    if (status >= 400) throw new AxiosError("Request failed", String(status), config, undefined, res as never)
    return res
  }
  return () => {
    axiosInstance.defaults.adapter = previous
  }
}

let restore: () => void = () => {}
afterEach(() => {
  restore()
  toasts.length = 0
  connectivity.noteNetworkOk()
})

async function deleteProject(opts: { showToast?: boolean; showErrorToast?: boolean } = { showToast: true }) {
  const { result } = renderHook(() => usePost())
  await act(async () => {
    await result.current
      .makeRequest({ apiEndpoint: PostEndpointUrl.DeleteProject, payload: { project_uuid: "p1" }, ...opts })
      .catch(() => undefined)
  })
}

describe("a request that fails", () => {
  // It was two toasts in a row, the server's reason under "That didn't work"
  // and then "Error: Failed to delete project.: <reason>" replacing it.
  it("says what didn't happen and why, once", async () => {
    restore = serverAnswers(400, { msg: "Archive the project's open tasks first." })
    await deleteProject()
    expect(toasts).toEqual([
      expect.objectContaining({ title: "Couldn't delete project", description: "Archive the project's open tasks first.", variant: "destructive" }),
    ])
  })

  it("says what the status means when the server's message is a bare no", async () => {
    restore = serverAnswers(403, { msg: "unauthorized" })
    await deleteProject()
    expect(toasts).toEqual([expect.objectContaining({ title: "Couldn't delete project", description: "You don't have permission to do that." })])
  })

  it("still lets the demo say why it keeps something", async () => {
    restore = serverAnswers(403, { code: "demo", msg: "Everyone who opens the demo shares this." })
    await deleteProject()
    expect(toasts).toEqual([expect.objectContaining({ title: "The demo is shared", description: "Everyone who opens the demo shares this." })])
  })

  it("says the server couldn't be reached when nothing answered", async () => {
    restore = serverAnswers(0)
    await deleteProject()
    expect(toasts).toEqual([
      expect.objectContaining({ title: "Couldn't delete project", description: expect.stringMatching(/could not be reached/i) }),
    ])
  })

  it("names what didn't happen in the caller's words when it has them", async () => {
    restore = serverAnswers(400, { msg: "Free plan: all 25 places are taken." })
    const { result } = renderHook(() => usePost())
    await act(async () => {
      await result.current
        .makeRequest({ apiEndpoint: PostEndpointUrl.ActivateUser, payload: { user_uuid: "u1" }, showErrorToast: true, failureTitle: "Couldn't reactivate Priya Raman" })
        .catch(() => undefined)
    })
    expect(toasts).toEqual([
      expect.objectContaining({ title: "Couldn't reactivate Priya Raman", description: "Free plan: all 25 places are taken.", variant: "destructive" }),
    ])
  })

  it("confirms success in plain words, not under a 'Success' title", async () => {
    restore = serverAnswers(200, { data: {} })
    await deleteProject()
    expect(toasts).toEqual([expect.objectContaining({ title: "Project deleted" })])
  })
})

describe("a request that gets no answer, outside usePost's toasts", () => {
  it("says a change wasn't saved when it was a write", async () => {
    restore = serverAnswers(0)
    await axiosInstance.post("/updateThing", {}).catch(() => undefined)
    expect(toasts).toEqual([expect.objectContaining({ title: "Couldn't reach the server", variant: "destructive" })])
  })

  it("leaves a read to the offline notice, without a toast", async () => {
    restore = serverAnswers(0)
    await axiosInstance.get("/someList").catch(() => undefined)
    expect(toasts).toEqual([])
  })

  it("marks the server unreachable after two misses, and reachable again on the next answer", async () => {
    restore = serverAnswers(0)
    await axiosInstance.get("/a").catch(() => undefined)
    expect(connectivity.isServerUnreachable()).toBe(false)
    await axiosInstance.get("/b").catch(() => undefined)
    expect(connectivity.isServerUnreachable()).toBe(true)
    restore()
    restore = serverAnswers(200, { data: [] })
    await axiosInstance.get("/c")
    expect(connectivity.isServerUnreachable()).toBe(false)
  })

  // Signing out: the page leaves for the sign-in page at once, so a failed
  // logout request has nothing to tell anyone, and "Couldn't reach the
  // server: your change wasn't saved" flashed over it was wrong.
  it("says nothing at all for a quiet request", async () => {
    // Past the 4-second window in which the same toast is shown only once,
    // so a toast here would not be swallowed as a repeat of an earlier test's.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(Date.now() + 60_000)
    restore = serverAnswers(0)
    const { result } = renderHook(() => usePost())
    await act(async () => {
      await result.current.makeRequest({ apiEndpoint: PostEndpointUrl.Logout, quiet: true }).catch(() => undefined)
    })
    vi.useRealTimers()
    expect(toasts).toEqual([])
  })
})

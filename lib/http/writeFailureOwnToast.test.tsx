import { act, cleanup, render, screen } from "@testing-library/react"
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios"
import { useEffect } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { toast, useToast, useToastState } from "@/hooks/use-toast"
import axiosInstance from "@/lib/axiosInstance"
import { saidHere } from "@/lib/http/saidHere"
import { saysWriteFailure } from "@/lib/http/writeSaid"

/*
 * A failed write is said once (V-397), by whoever says it first: the caller,
 * in the turn it failed, or else the shared toast (lib/http/writeFailure).
 * A caller says it on its row (useSaveStatus), in place in its own words, or
 * in an error toast of its own: "Couldn't remove Deploys" says more than the
 * shared "Already changed", and the two stacked over the dialog's next step
 * (AppsCard's remove and disconnect, Slack's bridge, the AI models' tests:
 * 105 catches on 3 Nov). Each claims the failure as it says it, with
 * saidHere(e, fallback) for the server's words or saysWriteFailure(e) beside
 * its own; app/writeFailureSaidOnce.test guards that every such catch does.
 * The claim lives in the card, so hooks/use-toast and the interceptor carry
 * nothing for it on every route's first load. Through the real request
 * interceptor and the real toasts.
 */

/** The server, in memory: a path fails with a status and a message, or never answers (status 0). */
let answers: Record<string, { status: number; msg?: string }> = {}
const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  const path = String(config.url).replace(/^https?:\/\/[^/]+\/?/, "/").replace(/^\/?/, "/")
  const a = answers[path] ?? { status: 404, msg: "nothing here" }
  if (a.status === 0) throw new AxiosError("Network Error", AxiosError.ERR_NETWORK, config, {})
  const response = { status: a.status, statusText: "", data: { msg: a.msg }, headers: {}, config }
  if (a.status < 400) return response
  throw new AxiosError(`Request failed with status code ${a.status}`, "ERR_BAD_RESPONSE", config, null, response)
}

/** One turn of the event loop: every await and catch of the failed write has run, and the shared toast's task. */
const turn = () => act(() => new Promise<void>((r) => setTimeout(r, 0)))

/** The toasts on screen, as "title: description"; it closes any left from a test before. */
function Toasts() {
  const { toasts } = useToastState()
  const { dismiss } = useToast()
  useEffect(() => dismiss(), [dismiss])
  return (
    <ul>
      {toasts.filter((t) => t.open).map((t) => (
        <li key={t.id}>{[t.title, t.description].filter(Boolean).join(": ")}</li>
      ))}
    </ul>
  )
}
const shown = () => screen.queryAllByRole("listitem").map((li) => li.textContent)

beforeEach(() => {
  axiosInstance.defaults.adapter = adapter
  answers = {}
  render(<Toasts />)
})
afterEach(cleanup)

describe("a caller's own error toast says its failed write", () => {
  it("once: the caller's toast, in the server's words, claims it and stands for the shared one", async () => {
    answers["/apps/deploys"] = { status: 409, msg: "Someone changed Deploys first" }
    await act(async () => {
      try {
        await axiosInstance.delete("/apps/deploys")
      } catch (e) {
        toast({ title: "Couldn't remove Deploys", description: saidHere(e, "Try again."), variant: "destructive" })
      }
    })
    await turn()
    expect(shown()).toEqual(["Couldn't remove Deploys: Someone changed Deploys first"])
  })

  it("once for a write with no answer, claimed beside a toast of its own words in the error tone", async () => {
    answers["/slack/link"] = { status: 0 }
    await act(async () => {
      await axiosInstance.post("/slack/link", {}).catch((e) => {
        saysWriteFailure(e)
        toast({ title: "Couldn't link those channels", tone: "error" })
      })
    })
    await turn()
    expect(shown()).toEqual(["Couldn't link those channels"])
  })

  it("twice when the caller's error toast doesn't claim it: the claim says it, and the guard makes every catch claim", async () => {
    answers["/apps/deploys"] = { status: 409, msg: "Someone changed Deploys first" }
    await act(async () => {
      await axiosInstance.delete("/apps/deploys").catch(() => toast({ title: "Couldn't remove Deploys", variant: "destructive" }))
    })
    await turn()
    expect(shown()).toHaveLength(2)
    expect(shown()).toContain("Couldn't remove Deploys")
  })

  it("not by a toast that isn't an error: the failure is still said", async () => {
    answers["/notes"] = { status: 500, msg: "The notes store is down" }
    await act(async () => {
      await axiosInstance.put("/notes", {}).catch(() => toast({ title: "Kept your draft on this device" }))
    })
    await turn()
    expect(shown()).toHaveLength(2)
    expect(shown()).toContain("Kept your draft on this device")
  })

  it("not by another failure's shared toast: two failed writes nobody says are both toasted", async () => {
    answers["/a"] = { status: 409, msg: "A changed first" }
    answers["/b"] = { status: 409, msg: "B changed first" }
    await act(async () => {
      await Promise.all([axiosInstance.post("/a", {}).catch(() => undefined), axiosInstance.post("/b", {}).catch(() => undefined)])
    })
    await turn()
    expect(shown().filter((t) => /^.*: [AB] changed first$/.test(t ?? ""))).toHaveLength(2)
  })

  it("and a caller that says it in place, in the server's words, raises no toast", async () => {
    answers["/docs/move"] = { status: 409, msg: "That folder moved a moment ago" }
    let line = ""
    await act(async () => {
      await axiosInstance.post("/docs/move", {}).catch((e) => {
        line = saidHere(e, "It wasn't moved.")
      })
    })
    await turn()
    expect(line).toBe("That folder moved a moment ago")
    expect(shown()).toEqual([])
  })
})

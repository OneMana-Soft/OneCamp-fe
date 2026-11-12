import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { SWRConfig } from "swr"

// Home's OneCamp AI cards read in the background: the briefing, "what needs
// me" (also the AI panel's suggestions) and the AI teammates' work. Each card
// hides itself when its read fails, so nothing on screen is wrong, yet the
// failed read raised "Something went wrong" over Home, and a member without
// agent.manage met "Not allowed" there on every visit: /agents/activity
// answers them 403. A failed background read raises no toast (V-577).

const toasts: { title?: string; description?: string }[] = []
vi.mock("@/hooks/use-toast", () => {
  const toast = (t: { title?: string; description?: string }) => {
    toasts.push(t)
    return { id: String(toasts.length), dismiss: () => {}, update: () => {} }
  }
  return { toast, useToast: () => ({ toast }) }
})
vi.mock("@/components/common/withFeature", () => ({ withAI: (c: unknown) => c }))

const { default: axiosInstance } = await import("@/lib/axiosInstance")
const { READ_FAILURE_BEAT_MS } = await import("@/lib/http/loadFailure")
const { forgetShared } = await import("@/lib/utils/sharedRequest")
const { attentionKey, briefingKey, getAttention, getBriefing } = await import("@/services/memoryService")
const { AgentWorkCard } = await import("@/components/ai/AgentWorkCard")

/**
 * The server answers every request with this status, and words of its own
 * each time, so a toast is never kept quiet as one shown a moment ago.
 */
let answers = 0
function serverAnswers(status: number) {
  const previous = axiosInstance.defaults.adapter
  axiosInstance.defaults.adapter = async (config) => {
    const { AxiosError } = await import("axios")
    const res = { data: { msg: `Resting, answer ${++answers}.` }, status, statusText: String(status), headers: {}, config }
    throw new AxiosError("Request failed", String(status), config, undefined, res as never)
  }
  return () => {
    axiosInstance.defaults.adapter = previous
  }
}

/** Past the beat a failed read waits before its toast. */
const pastTheBeat = () => new Promise((r) => setTimeout(r, READ_FAILURE_BEAT_MS + 150))

let restore: () => void = () => {}
afterEach(() => {
  cleanup()
  restore()
  toasts.length = 0
  forgetShared(briefingKey())
  forgetShared(attentionKey())
})

describe("Home's AI reads", () => {
  it.each([500, 501, 503])("say nothing when the briefing and the queue fail (%i)", async (status) => {
    restore = serverAnswers(status)
    await expect(getBriefing()).rejects.toBeTruthy()
    await expect(getAttention()).rejects.toBeTruthy()
    await pastTheBeat()
    expect(toasts).toEqual([])
  })

  it.each([403, 500])("say nothing when the AI teammates' work fails (%i)", async (status) => {
    restore = serverAnswers(status)
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, revalidateOnFocus: false }}>
        <AgentWorkCard />
      </SWRConfig>,
    )
    await pastTheBeat()
    expect(toasts).toEqual([])
  })

  it("leave any other failed read to say itself", async () => {
    restore = serverAnswers(500)
    await expect(axiosInstance.get("/elsewhere")).rejects.toBeTruthy()
    await pastTheBeat()
    expect(toasts).toHaveLength(1)
  })
})
